/**
 * useVoiceToText — speech-to-text hook for the match-chat composer.
 *
 * Design goals (fixes for two P0 UX defects):
 *
 * 1. Do NOT call getUserMedia() on every recording. Chrome/Safari re-prompt
 *    when the previous MediaStream's tracks were stopped and a new
 *    getUserMedia call is issued. We instead reuse a single persistent
 *    MediaStream across successive recordings within the hook's lifetime
 *    and only release it on teardown (component unmount). We also
 *    proactively check `navigator.permissions.query({name:'microphone'})`
 *    where supported so we can surface a denied/site-settings message
 *    without triggering another prompt.
 *
 * 2. Support "send while recording" via `finalize()`, which stops the
 *    active MediaRecorder and awaits the final transcription without
 *    tearing down the mic stream. The composer wraps this in an atomic
 *    send transaction (see MobileChatPanel).
 *
 * The hook never persists raw audio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  recordRuntimeEvent,
  recordVoiceRequestNetworkFailure,
  beginRuntimeIncident,
  endRuntimeIncident,
  getActiveRuntimeIncidentId,
  forceInstanceHeartbeat,
  nextIncidentSequence,
  setRuntimeAmbient,
  snapshotVoiceSurfaceContext,
} from '@/lib/runtimeInstrumentation/runtimeTracer';

function inferVoiceSurface(): string {
  if (typeof window === 'undefined') return 'unknown';
  const p = window.location.pathname || '';
  if (/^\/game\//.test(p)) return 'active_game_table';
  if (/^\/(lobby|waiting|$)/.test(p) || p === '/' || p === '/index') return 'waiting_table';
  return 'unknown';
}

export type VoiceToTextState = 'idle' | 'recording' | 'transcribing' | 'error';
export type VoicePermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export type VoiceDiagnosticCode =
  | 'VOICE_PERMISSION_STATE'
  | 'VOICE_PERMISSION_REQUESTED'
  | 'VOICE_CAPTURE_STARTED'
  | 'VOICE_CAPTURE_START'
  | 'VOICE_CAPTURE_STOP_REQUESTED'
  | 'VOICE_RECORDING_HEARTBEAT'
  | 'VOICE_STOP_BUTTON_TAPPED'
  | 'VOICE_SEND_BUTTON_TAPPED_WHILE_RECORDING'
  | 'VOICE_STOP_HANDLER_ENTERED'
  | 'VOICE_STOP_HANDLER_EXITED'
  | 'VOICE_MEDIARECORDER_STOP_CALLED'
  | 'VOICE_MEDIARECORDER_ONSTOP_ENTERED'
  | 'VOICE_MEDIARECORDER_DATAAVAILABLE'
  | 'VOICE_BLOB_READY'
  | 'VOICE_ENCODE_START'
  | 'VOICE_ENCODE_COMPLETE'
  | 'VOICE_FN_INVOKE_START'
  | 'VOICE_FN_INVOKE_RESPONSE'
  | 'VOICE_FN_INVOKE_ERROR'
  | 'VOICE_FINALIZE_RETURN'
  | 'VOICE_SEND_DURING_RECORDING'
  | 'VOICE_FINALIZATION_COMPLETE'
  | 'VOICE_SEND_BEGIN'
  | 'VOICE_SEND_BLOCKED_REASON'
  | 'VOICE_SEND_BLOCKED'
  | 'VOICE_SEND_COMPLETE';

export interface VoiceDiagnosticEvent {
  id: number;
  ts: number;
  code: VoiceDiagnosticCode;
  detail?: string;
}

export interface UseVoiceToTextResult {
  state: VoiceToTextState;
  error: string | null;
  isSupported: boolean;
  permission: VoicePermissionState;
  start: () => Promise<void>;
  /** Stop + transcribe, then release the stream (mic-off toggle). */
  stop: () => Promise<string | null>;
  /** Stop + transcribe WITHOUT releasing the stream (send-while-recording). */
  finalize: () => Promise<string | null>;
  /** Explicit user cancel: stop recording, drop audio, keep stream alive. */
  cancel: () => void;
  reset: () => void;
  diagnostics: VoiceDiagnosticEvent[];
  recordDiagnostic: (code: VoiceDiagnosticEvent['code'], detail?: string) => void;
}

function detectSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof window.MediaRecorder === 'undefined') return false;
  return true;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function useVoiceToText(): UseVoiceToTextResult {
  const [state, setState] = useState<VoiceToTextState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<VoicePermissionState>('unknown');
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnosticEvent[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const diagIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const captureStartedAtRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSupported = detectSupport();

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const recordDiagnostic = useCallback((code: VoiceDiagnosticEvent['code'], detail?: string) => {
    diagIdRef.current += 1;
    const evt: VoiceDiagnosticEvent = { id: diagIdRef.current, ts: Date.now(), code, detail };
    setDiagnostics((prev) => {
      const next = [...prev, evt];
      return next.length > 12 ? next.slice(next.length - 12) : next;
    });
    try {
      const incidentId = getActiveRuntimeIncidentId();
      const seq = incidentId ? nextIncidentSequence(incidentId) : null;
      const elapsedMs =
        captureStartedAtRef.current !== null
          ? Date.now() - captureStartedAtRef.current
          : null;
      const payload: Record<string, unknown> = {};
      if (detail !== undefined) payload.detail = detail;
      if (seq !== null) payload.sequence = seq;
      if (elapsedMs !== null) payload.elapsedMs = elapsedMs;
      recordRuntimeEvent({
        event_family: 'voice',
        event_name: code,
        severity: code === 'VOICE_SEND_BLOCKED_REASON' ? 'warn' : 'info',
        correlation_id: incidentId,
        voice_operation_id: incidentId,
        payload: Object.keys(payload).length > 0 ? payload : undefined,
      });
    } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  const streamAlive = useCallback((): boolean => {
    const s = streamRef.current;
    if (!s) return false;
    const tracks = s.getAudioTracks?.() ?? [];
    return tracks.length > 0 && tracks.every((t) => t.readyState === 'live');
  }, []);

  const releaseStream = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  }, []);

  // Query permission state up front (Chrome/Edge/Firefox support this;
  // Safari does not, in which case we leave state at 'unknown' and rely
  // on getUserMedia error semantics without pre-prompting).
  const queryPermission = useCallback(async (): Promise<VoicePermissionState> => {
    if (!isSupported) {
      setPermission('unsupported');
      recordDiagnostic('VOICE_PERMISSION_STATE', 'unsupported');
      return 'unsupported';
    }
    try {
      const nav = navigator as Navigator & { permissions?: { query: (d: unknown) => Promise<PermissionStatus> } };
      if (!nav.permissions?.query) {
        setPermission('unknown');
        recordDiagnostic('VOICE_PERMISSION_STATE', 'unknown-no-api');
        return 'unknown';
      }
      const status = await nav.permissions.query({ name: 'microphone' as PermissionName });
      const s = status.state as VoicePermissionState;
      setPermission(s);
      recordDiagnostic('VOICE_PERMISSION_STATE', s);
      status.onchange = () => {
        const next = status.state as VoicePermissionState;
        setPermission(next);
        recordDiagnostic('VOICE_PERMISSION_STATE', `changed:${next}`);
      };
      return s;
    } catch {
      setPermission('unknown');
      recordDiagnostic('VOICE_PERMISSION_STATE', 'unknown-query-failed');
      return 'unknown';
    }
  }, [isSupported, recordDiagnostic]);

  useEffect(() => {
    void queryPermission();
    // Cleanup on unmount: fully release the mic and any timers.
    return () => {
      stopHeartbeat();
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      recorderRef.current = null;
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamAlive()) return streamRef.current;
    // Only prompt when necessary. If permission is explicitly denied,
    // do not call getUserMedia (would re-trigger the OS prompt on some
    // platforms and is guaranteed to fail).
    if (permission === 'denied') {
      setError('Microphone is blocked. Enable microphone for this site in your browser settings, then try again.');
      setState('error');
      return null;
    }
    recordDiagnostic('VOICE_PERMISSION_REQUESTED', permission);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setPermission('granted');
    recordDiagnostic('VOICE_PERMISSION_STATE', 'granted');
    return stream;
  }, [permission, recordDiagnostic, streamAlive]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Voice input is not supported in this browser.');
      setState('error');
      return;
    }
    if (state === 'recording' || state === 'transcribing') return;

    try {
      const stream = await ensureStream();
      if (!stream) return; // error already set

      chunksRef.current = [];
      cancelledRef.current = false;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        try {
          recordDiagnostic(
            'VOICE_MEDIARECORDER_DATAAVAILABLE',
            `bytes=${e.data?.size ?? 0}`,
          );
        } catch { /* noop */ }
      };
      recorderRef.current = rec;
      captureStartedAtRef.current = Date.now();
      rec.start();
      setError(null);
      setState('recording');
      // Open a durable runtime incident id that survives tab replacement
      // and browser relaunch. Every downstream event (encode, invoke,
      // send, page-lifecycle) attaches to this id via correlation_id.
      const incidentId = beginRuntimeIncident('voice_capture', {
        opened_at: new Date().toISOString(),
        mimeType: rec.mimeType || 'audio/webm',
      });
      // Force an immediate instance heartbeat so the DB shows this tab
      // is actively capturing before any other event lands.
      forceInstanceHeartbeat('VOICE_CAPTURE_START');
      recordDiagnostic('VOICE_CAPTURE_START', `incident=${incidentId}`);
      // Legacy alias retained for existing UI diagnostic pane.
      recordDiagnostic('VOICE_CAPTURE_STARTED');

      // 1s pre-stop heartbeat so the missing-boundary window between
      // VOICE_CAPTURE_STARTED and VOICE_CAPTURE_STOP_REQUESTED is
      // fully observable in the DB.
      stopHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        try {
          const elapsed =
            captureStartedAtRef.current !== null
              ? Date.now() - captureStartedAtRef.current
              : 0;
          recordDiagnostic('VOICE_RECORDING_HEARTBEAT', `elapsedMs=${elapsed}`);
        } catch { /* noop */ }
      }, 1000);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const msg = err instanceof Error ? err.message : String(err);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
        setError('Microphone permission denied. Enable microphone for this site in your browser settings, then try again.');
        recordDiagnostic('VOICE_PERMISSION_STATE', 'denied');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No microphone found on this device.');
      } else {
        setError(msg || 'Microphone unavailable.');
      }
      setState('error');
      releaseStream();
      stopHeartbeat();
      captureStartedAtRef.current = null;
    }
  }, [ensureStream, isSupported, recordDiagnostic, releaseStream, state, stopHeartbeat]);

  // Internal: stop the recorder and transcribe. Optionally release the stream
  // after transcription. Returns the transcript, or null on error/empty.
  const stopAndTranscribe = useCallback(async (opts: { keepStream: boolean }): Promise<string | null> => {
    recordDiagnostic(
      'VOICE_STOP_HANDLER_ENTERED',
      `keepStream=${opts.keepStream}`,
    );
    const rec = recorderRef.current;
    if (!rec) {
      if (!opts.keepStream) releaseStream();
      stopHeartbeat();
      recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'no-recorder');
      return null;
    }
    const mimeType = rec.mimeType || 'audio/webm';
    const finished = new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        try {
          recordDiagnostic(
            'VOICE_MEDIARECORDER_ONSTOP_ENTERED',
            `chunks=${chunksRef.current.length}`,
          );
        } catch { /* noop */ }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        resolve(blob);
      };
    });
    try {
      recordDiagnostic('VOICE_CAPTURE_STOP_REQUESTED');
      recordDiagnostic('VOICE_MEDIARECORDER_STOP_CALLED', `state=${rec.state}`);
      if (rec.state !== 'inactive') rec.stop();
    } catch { /* ignore */ }
    stopHeartbeat();
    setState('transcribing');
    const blob = await finished;
    recordDiagnostic('VOICE_BLOB_READY', `bytes=${blob.size};mime=${mimeType}`);
    recorderRef.current = null;
    if (!opts.keepStream) releaseStream();

    if (cancelledRef.current) {
      cancelledRef.current = false;
      setState('idle');
      setError(null);
      recordDiagnostic('VOICE_FINALIZE_RETURN', 'cancelled');
      endRuntimeIncident('cancelled');
      captureStartedAtRef.current = null;
      recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'cancelled');
      return null;
    }

    try {
      recordDiagnostic('VOICE_ENCODE_START', `bytes=${blob.size}`);
      const base64 = await blobToBase64(blob);
      recordDiagnostic('VOICE_ENCODE_COMPLETE', `chars=${base64.length}`);
      recordDiagnostic('VOICE_FN_INVOKE_START', `bytes=${base64.length}`);
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64, mimeType },
      });
      if (fnError) {
        recordDiagnostic('VOICE_FN_INVOKE_ERROR', fnError.message || 'invoke-failed');
        try {
          recordVoiceRequestNetworkFailure({
            phase: 'edge-function-invoke',
            message: fnError.message ?? null,
            errorName: (fnError as { name?: string }).name ?? null,
          });
        } catch { /* noop */ }
        throw new Error(fnError.message || 'Transcription failed.');
      }
      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      recordDiagnostic('VOICE_FN_INVOKE_RESPONSE', `hasTranscript=${!!transcript};len=${transcript.length}`);
      if (!transcript) {
        setError('No speech detected. Try again.');
        setState('error');
        recordDiagnostic('VOICE_FINALIZE_RETURN', 'empty');
        captureStartedAtRef.current = null;
        recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'empty');
        return null;
      }
      setState('idle');
      setError(null);
      recordDiagnostic('VOICE_FINALIZE_RETURN', `chars=${transcript.length}`);
      captureStartedAtRef.current = null;
      recordDiagnostic('VOICE_STOP_HANDLER_EXITED', `chars=${transcript.length}`);
      return transcript;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = (err as { name?: string })?.name ?? null;
      setError(msg || 'Transcription unavailable.');
      setState('error');
      recordDiagnostic('VOICE_FN_INVOKE_ERROR', msg);
      recordDiagnostic('VOICE_FINALIZE_RETURN', 'error');
      try {
        // TypeError from fetch / offline / DNS all bubble as generic
        // Error. Surface as a network-family failure so the DB
        // timeline shows the outage boundary immediately.
        const looksNetworky =
          name === 'TypeError' ||
          /network|fetch|failed to fetch|load failed/i.test(msg);
        if (looksNetworky || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          recordVoiceRequestNetworkFailure({
            phase: 'edge-function-catch',
            message: msg,
            errorName: name,
          });
        }
      } catch { /* noop */ }
      captureStartedAtRef.current = null;
      recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'error');
      return null;
    }
  }, [recordDiagnostic, releaseStream, stopHeartbeat]);

  const stop = useCallback(() => stopAndTranscribe({ keepStream: false }), [stopAndTranscribe]);
  const finalize = useCallback(() => stopAndTranscribe({ keepStream: true }), [stopAndTranscribe]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    cancelledRef.current = true;
    chunksRef.current = [];
    try {
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch { /* ignore */ }
    recorderRef.current = null;
    stopHeartbeat();
    captureStartedAtRef.current = null;
    // Keep the stream alive so the next start doesn't re-prompt.
    setState('idle');
    setError(null);
  }, [stopHeartbeat]);

  return {
    state,
    error,
    isSupported,
    permission,
    start,
    stop,
    finalize,
    cancel,
    reset,
    diagnostics,
    recordDiagnostic,
  };
}
