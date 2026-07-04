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
import { recordRuntimeEvent } from '@/lib/runtimeInstrumentation/runtimeTracer';

export type VoiceToTextState = 'idle' | 'recording' | 'transcribing' | 'error';
export type VoicePermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface VoiceDiagnosticEvent {
  id: number;
  ts: number;
  code:
    | 'VOICE_PERMISSION_STATE'
    | 'VOICE_PERMISSION_REQUESTED'
    | 'VOICE_CAPTURE_STARTED'
    | 'VOICE_SEND_DURING_RECORDING'
    | 'VOICE_FINALIZATION_COMPLETE'
    | 'VOICE_SEND_BLOCKED_REASON'
    | 'VOICE_SEND_COMPLETE';
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

  const isSupported = detectSupport();

  const recordDiagnostic = useCallback((code: VoiceDiagnosticEvent['code'], detail?: string) => {
    diagIdRef.current += 1;
    const evt: VoiceDiagnosticEvent = { id: diagIdRef.current, ts: Date.now(), code, detail };
    setDiagnostics((prev) => {
      const next = [...prev, evt];
      return next.length > 12 ? next.slice(next.length - 12) : next;
    });
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
    // Cleanup on unmount: fully release the mic.
    return () => {
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
      };
      recorderRef.current = rec;
      rec.start();
      setError(null);
      setState('recording');
      recordDiagnostic('VOICE_CAPTURE_STARTED');
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
    }
  }, [ensureStream, isSupported, recordDiagnostic, releaseStream, state]);

  // Internal: stop the recorder and transcribe. Optionally release the stream
  // after transcription. Returns the transcript, or null on error/empty.
  const stopAndTranscribe = useCallback(async (opts: { keepStream: boolean }): Promise<string | null> => {
    const rec = recorderRef.current;
    if (!rec) {
      if (!opts.keepStream) releaseStream();
      return null;
    }
    const mimeType = rec.mimeType || 'audio/webm';
    const finished = new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        resolve(blob);
      };
    });
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch { /* ignore */ }
    setState('transcribing');
    const blob = await finished;
    recorderRef.current = null;
    if (!opts.keepStream) releaseStream();

    if (cancelledRef.current) {
      cancelledRef.current = false;
      setState('idle');
      setError(null);
      return null;
    }

    try {
      const base64 = await blobToBase64(blob);
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64, mimeType },
      });
      if (fnError) throw new Error(fnError.message || 'Transcription failed.');
      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      if (!transcript) {
        setError('No speech detected. Try again.');
        setState('error');
        return null;
      }
      setState('idle');
      setError(null);
      return transcript;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Transcription unavailable.');
      setState('error');
      return null;
    }
  }, [releaseStream]);

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
    // Keep the stream alive so the next start doesn't re-prompt.
    setState('idle');
    setError(null);
  }, []);

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
