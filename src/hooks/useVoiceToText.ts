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
  getActiveRuntimeIncidentId,
  forceInstanceHeartbeat,
  nextIncidentSequence,
  setRuntimeAmbient,
  snapshotVoiceSurfaceContext,
} from '@/lib/runtimeInstrumentation/runtimeTracer';
import {
  beginVoiceOperation,
  endVoiceOperation,
  getActiveVoiceOperationId,
} from '@/lib/runtimeInstrumentation/voiceOperation';
import {
  openServerVoiceIncident,
  writeClientVoiceEvent,
  triggerServerFinalizer,
} from '@/lib/runtimeInstrumentation/serverVoiceOperation';
import {
  useVoiceOperationIdentity,
  assertVoiceIdentityMatchesRoute,
  type VoiceOperationIdentity,
} from '@/hooks/VoiceOperationIdentityContext';

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

  // Canonical active game identity (see VoiceOperationIdentityContext).
  // This is the ONLY source of game/session identity for a voice operation.
  // It replaces the previous ambient-tracer snapshot approach, which could
  // return NULL on real active-game routes and broke peer RLS linkage.
  const identity: VoiceOperationIdentity = useVoiceOperationIdentity();
  const identityRef = useRef<VoiceOperationIdentity>(identity);
  identityRef.current = identity;
  const boundarySeqRef = useRef(0);

  /** Build the persisted metadata payload for a start-path boundary event. */
  const buildBoundaryMeta = useCallback((): Record<string, unknown> => {
    boundarySeqRef.current += 1;
    const stream = streamRef.current;
    const track = stream?.getAudioTracks?.()[0] ?? null;
    const rec = recorderRef.current;
    const id = identityRef.current;
    return {
      monotonic_sequence: boundarySeqRef.current,
      game_id: id.gameId,
      session_id: id.sessionId,
      dealer_game_id: id.dealerGameId,
      game_type: id.gameType,
      shell_phase: id.shellPhase,
      active_tab: id.activeTab,
      local_player_id: id.localPlayerId,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
      media_recorder_state: rec?.state ?? null,
      audio_track_ready_state: track?.readyState ?? null,
      audio_track_muted: track?.muted ?? null,
      navigator_online:
        typeof navigator !== 'undefined' ? navigator.onLine : null,
      visibility_state:
        typeof document !== 'undefined' ? document.visibilityState : null,
    };
  }, []);

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
      // Prefer the durable voice-operation id so recording still
      // attributes correctly after `endVoiceOperation` has fired its
      // grace-window close of the runtime incident.
      const incidentId =
        getActiveVoiceOperationId() ?? getActiveRuntimeIncidentId();
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

    // INVARIANT A: create the durable voice-operation correlation id
    // SYNCHRONOUSLY, BEFORE any async work (ensureStream), any
    // MediaRecorder construction, or any timer. Every downstream voice
    // event reads this id from the durable voiceOperation ref.
    const surface = inferVoiceSurface();
    try { setRuntimeAmbient({ voice_surface: surface }); } catch { /* noop */ }
    const incidentId = beginVoiceOperation({
      opened_at: new Date().toISOString(),
      voice_surface: surface,
      surface_context: snapshotVoiceSurfaceContext(),
    });
    boundarySeqRef.current = 0;

    // CANONICAL identity source: the immutable operation context injected by
    // the mounted Game.tsx shell via VoiceOperationIdentityProvider. We do
    // NOT source game/session identity from the nullable ambient tracer
    // snapshot anymore — that path proved unreliable on real active-game
    // routes (see op 15511b7f-…: opened on /game/… but game_id NULL).
    const id = identityRef.current;
    const openGameId = id.gameId;
    const openDealerGameId = id.dealerGameId;
    const openSessionId = id.sessionId;

    // Enforce: on an active `/game/:gameId` route the shell identity gameId
    // must equal the route param. `assertVoiceIdentityMatchesRoute` emits the
    // DB-persisted `VOICE_ACTIVE_GAME_IDENTITY_MISSING` invariant on any
    // mismatch (route present but shell gameId null or different).
    assertVoiceIdentityMatchesRoute(id, 'useVoiceToText.start');

    void openServerVoiceIncident({
      voice_operation_id: incidentId,
      surface,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
      game_id: openGameId,
      dealer_game_id: openDealerGameId,
      session_id: openSessionId,
      sender_player_id: id.localPlayerId ?? null,
    });

    // Start-path boundary #1: handler entered (before any async work).
    void writeClientVoiceEvent(incidentId, 'VOICE_START_HANDLER_ENTERED', {
      metadata: buildBoundaryMeta(),
    });

    try {
      void writeClientVoiceEvent(incidentId, 'VOICE_GET_USER_MEDIA_BEGIN', {
        metadata: buildBoundaryMeta(),
      });
      const stream = await ensureStream();
      if (!stream) {
        // ensureStream set error; end operation with grace so acks land.
        endVoiceOperation('start-no-stream');
        void writeClientVoiceEvent(incidentId, 'VOICE_START_HANDLER_EXITED', {
          metadata: { ...buildBoundaryMeta(), exit_reason: 'no-stream' },
        });
        return;
      }
      void writeClientVoiceEvent(incidentId, 'VOICE_GET_USER_MEDIA_RESOLVED', {
        metadata: buildBoundaryMeta(),
      });
      // Now that streamRef is populated, the audio-track fields resolve.
      void writeClientVoiceEvent(incidentId, 'VOICE_AUDIO_TRACK_ACQUIRED', {
        metadata: buildBoundaryMeta(),
      });

      chunksRef.current = [];
      cancelledRef.current = false;
      void writeClientVoiceEvent(incidentId, 'VOICE_MEDIARECORDER_CONSTRUCT_BEGIN', {
        metadata: buildBoundaryMeta(),
      });
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
      void writeClientVoiceEvent(incidentId, 'VOICE_MEDIARECORDER_CONSTRUCTED', {
        metadata: buildBoundaryMeta(),
      });
      captureStartedAtRef.current = Date.now();
      void writeClientVoiceEvent(incidentId, 'VOICE_MEDIARECORDER_START_BEGIN', {
        metadata: buildBoundaryMeta(),
      });
      rec.start();
      void writeClientVoiceEvent(incidentId, 'VOICE_MEDIARECORDER_START_RETURNED', {
        metadata: buildBoundaryMeta(),
      });
      setError(null);
      setState('recording');
      void writeClientVoiceEvent(incidentId, 'VOICE_RECORDING_STATE_COMMITTED', {
        metadata: buildBoundaryMeta(),
      });
      // Force an immediate instance heartbeat so the DB shows this tab
      // is actively capturing before any other event lands.
      forceInstanceHeartbeat('VOICE_CAPTURE_START');
      recordDiagnostic('VOICE_CAPTURE_START', `incident=${incidentId};surface=${surface}`);
      // Legacy alias retained for existing UI diagnostic pane.
      recordDiagnostic('VOICE_CAPTURE_STARTED');
      void writeClientVoiceEvent(incidentId, 'CAPTURE_STARTED', { metadata: { surface } });

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
      void writeClientVoiceEvent(incidentId, 'VOICE_START_HANDLER_EXITED', {
        metadata: { ...buildBoundaryMeta(), exit_reason: 'ok' },
      });
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
      void writeClientVoiceEvent(incidentId, 'VOICE_START_HANDLER_EXITED', {
        metadata: {
          ...buildBoundaryMeta(),
          exit_reason: 'error',
          error_name: name ?? null,
          error_message: msg.slice(0, 500),
        },
      });
      endVoiceOperation('start-error');
    }

  }, [buildBoundaryMeta, ensureStream, isSupported, recordDiagnostic, releaseStream, state, stopHeartbeat]);

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
      const opId = getActiveVoiceOperationId();
      if (opId) void writeClientVoiceEvent(opId, 'CAPTURE_STOP_REQUESTED');
      if (rec.state !== 'inactive') rec.stop();
    } catch { /* ignore */ }
    stopHeartbeat();
    setState('transcribing');
    const blob = await finished;
    recordDiagnostic('VOICE_BLOB_READY', `bytes=${blob.size};mime=${mimeType}`);
    { const opId = getActiveVoiceOperationId(); if (opId) void writeClientVoiceEvent(opId, 'BLOB_READY', { byte_count: blob.size }); }
    recorderRef.current = null;
    if (!opts.keepStream) releaseStream();

    if (cancelledRef.current) {
      cancelledRef.current = false;
      setState('idle');
      setError(null);
      recordDiagnostic('VOICE_FINALIZE_RETURN', 'cancelled');
      endVoiceOperation('cancelled');
      captureStartedAtRef.current = null;
      recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'cancelled');
      return null;
    }

    try {
      recordDiagnostic('VOICE_ENCODE_START', `bytes=${blob.size}`);
      const base64 = await blobToBase64(blob);
      recordDiagnostic('VOICE_ENCODE_COMPLETE', `chars=${base64.length}`);
      recordDiagnostic('VOICE_FN_INVOKE_START', `bytes=${base64.length}`);
      const opId = getActiveVoiceOperationId();
      if (opId) {
        void writeClientVoiceEvent(opId, 'ENCODE_COMPLETE', { byte_count: base64.length });
        void writeClientVoiceEvent(opId, 'FN_INVOKE_START', { byte_count: base64.length });
      }

      // Direct-fetch invoke path. We instrument every observable transport
      // boundary so the finalizer can name the exact opaque segment when the
      // client never observes an Edge response that the server logged as
      // EDGE_RESPONSE_SENT. Behavior is preserved: same URL, same body,
      // same JSON response shape as supabase.functions.invoke would use.
      const invokeStartedAt = performance.now();
      const abortController = new AbortController();
      const TIMEOUT_MS = 60000;
      const timeoutHandle = setTimeout(() => {
        try {
          void import('@/lib/chatOperations/chatOperationBoundary').then(({ recordChatAbortInitiated }) => {
            recordChatAbortInitiated('useVoiceToText.timeout', 'voice-to-text-invoke', { timeout_ms: TIMEOUT_MS });
          }).catch(() => {});
        } catch { /* noop */ }
        try { abortController.abort('timeout'); } catch { /* noop */ }
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_TIMEOUT', {
          duration_ms: Math.round(performance.now() - invokeStartedAt),
          metadata: { timeout_ms: TIMEOUT_MS },
        });
      }, TIMEOUT_MS);

      const requestBody = JSON.stringify({ audio: base64, mimeType, voice_operation_id: opId });
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? supabaseKey;
      const invokeUrl = `${supabaseUrl}/functions/v1/voice-to-text`;

      if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_CLIENT_CALL_ENTERED', {
        byte_count: requestBody.length,
        metadata: {
          abort_signal_aborted: abortController.signal.aborted,
          timeout_ms: TIMEOUT_MS,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          navigator_online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        },
      });

      let data: { transcript?: string; error?: string } | null = null;
      let fnError: { name?: string; message?: string } | null = null;

      try {
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_FETCH_DISPATCHED', {
          byte_count: requestBody.length,
          metadata: { url_host: (() => { try { return new URL(invokeUrl).host; } catch { return null; } })() },
        });

        const response = await fetch(invokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': supabaseKey,
          },
          body: requestBody,
          signal: abortController.signal,
        });

        const contentType = response.headers.get('content-type');
        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_RESPONSE_HEADERS_RECEIVED', {
          status_code: response.status,
          duration_ms: Math.round(performance.now() - invokeStartedAt),
          metadata: {
            http_status: response.status,
            content_type: contentType,
            content_length: contentLength,
          },
        });

        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_RESPONSE_BODY_READ_STARTED', {
          status_code: response.status,
        });
        const bodyText = await response.text();
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_RESPONSE_BODY_READ_COMPLETED', {
          status_code: response.status,
          byte_count: bodyText.length,
        });

        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_RESPONSE_PARSE_STARTED', {
          byte_count: bodyText.length,
        });
        let parsed: { transcript?: string; error?: string } | null = null;
        try {
          parsed = bodyText ? JSON.parse(bodyText) : null;
        } catch (parseErr) {
          if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_PROMISE_REJECTED', {
            error_category: 'parse-error',
            error_message: (parseErr instanceof Error ? parseErr.message : String(parseErr)).slice(0, 500),
            metadata: { errorName: 'SyntaxError', snippet: bodyText.slice(0, 256) },
          });
          throw parseErr;
        }
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_RESPONSE_PARSE_COMPLETED', {
          metadata: {
            hasTranscript: typeof parsed?.transcript === 'string' && parsed.transcript.length > 0,
            transcriptLength: typeof parsed?.transcript === 'string' ? parsed.transcript.length : 0,
          },
        });

        if (!response.ok) {
          fnError = { name: 'FunctionsHttpError', message: parsed?.error ?? `HTTP ${response.status}` };
        } else {
          data = parsed;
        }

        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_PROMISE_RESOLVED', {
          status_code: response.status,
          duration_ms: Math.round(performance.now() - invokeStartedAt),
          metadata: { ok: response.ok },
        });
      } catch (invokeErr) {
        const name = (invokeErr as { name?: string })?.name ?? 'Error';
        const message = invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
        const aborted = abortController.signal.aborted;
        if (opId) {
          if (aborted) {
            void writeClientVoiceEvent(opId, 'VOICE_INVOKE_ABORTED', {
              duration_ms: Math.round(performance.now() - invokeStartedAt),
              metadata: { reason: String(abortController.signal.reason ?? 'aborted') },
            });
          }
          void writeClientVoiceEvent(opId, 'VOICE_INVOKE_PROMISE_REJECTED', {
            error_category: aborted ? 'aborted' : (name === 'TypeError' ? 'network' : 'fetch-error'),
            error_message: message.slice(0, 500),
            metadata: { errorName: name, aborted },
          });
        }
        fnError = { name, message };
      } finally {
        clearTimeout(timeoutHandle);
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_FINALLY_ENTERED', {
          duration_ms: Math.round(performance.now() - invokeStartedAt),
        });
        if (opId) void writeClientVoiceEvent(opId, 'VOICE_INVOKE_FINALLY_EXITED', {
          duration_ms: Math.round(performance.now() - invokeStartedAt),
        });
      }

      if (fnError) {
        recordDiagnostic('VOICE_FN_INVOKE_ERROR', fnError.message || 'invoke-failed');
        if (opId) void writeClientVoiceEvent(opId, 'FN_INVOKE_ERROR', {
          error_category: 'invoke-failed',
          error_message: (fnError.message ?? 'invoke-failed').slice(0, 500),
        });
        try {
          recordVoiceRequestNetworkFailure({
            phase: 'edge-function-invoke',
            message: fnError.message ?? null,
            errorName: fnError.name ?? null,
          });
        } catch { /* noop */ }
        throw new Error(fnError.message || 'Transcription failed.');
      }
      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      recordDiagnostic('VOICE_FN_INVOKE_RESPONSE', `hasTranscript=${!!transcript};len=${transcript.length}`);
      if (opId) void writeClientVoiceEvent(opId, 'FN_INVOKE_RESPONSE', {
        status_code: 200,
        metadata: { transcript_length: transcript.length },
      });
      if (!transcript) {
        setError('No speech detected. Try again.');
        setState('error');
        recordDiagnostic('VOICE_FINALIZE_RETURN', 'empty');
        if (opId) void writeClientVoiceEvent(opId, 'SEND_FAILED', { error_category: 'empty-transcript' });
        triggerServerFinalizer();
        captureStartedAtRef.current = null;
        recordDiagnostic('VOICE_STOP_HANDLER_EXITED', 'empty');
        return null;
      }
      setState('idle');
      setError(null);
      recordDiagnostic('VOICE_FINALIZE_RETURN', `chars=${transcript.length}`);
      if (opId) void writeClientVoiceEvent(opId, 'SEND_COMPLETE', { metadata: { transcript_length: transcript.length } });
      triggerServerFinalizer();
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
      const opId2 = getActiveVoiceOperationId();
      if (opId2) void writeClientVoiceEvent(opId2, 'SEND_FAILED', {
        error_category: name ?? 'unknown', error_message: msg.slice(0, 500),
      });
      triggerServerFinalizer();
      try {
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
