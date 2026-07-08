/**
 * useVoiceToText — isolated speech-to-text hook for the match-chat composer.
 *
 * ISOLATION CONTRACT (post-cleanup):
 *   This hook is deliberately self-contained. It does NOT import or
 *   emit into any of the following systems:
 *     - runtimeTracer / runtimeInstrumentation event bus
 *     - voiceOperation correlation store
 *     - serverVoiceOperation writers (client_voice_events, incidents)
 *     - VoiceOperationIdentity context (route/game/session identity)
 *     - chatOperationBoundary
 *     - startupFlightRecorder / lifecycleDebug
 *     - pagehide / sendBeacon / keepalive flushes
 *     - localStorage / sessionStorage (no persistence at all)
 *
 *   All state is component-local. A voice capture is a purely
 *   in-memory transaction between the mic, an in-flight MediaRecorder,
 *   and a single `fetch` to the voice-to-text edge function. No
 *   diagnostic events are shipped anywhere; the `diagnostics` field is
 *   a bounded, in-memory ring buffer for optional UI display only.
 *
 * BEHAVIOR:
 *   - Reuses one persistent MediaStream across successive recordings
 *     within the hook's lifetime; released on unmount / stop().
 *   - `stop()` finalizes and releases the mic stream.
 *   - `finalize()` finalizes without releasing the stream (used by
 *     the composer's atomic "send while recording" flow).
 *   - `cancel()` discards audio and returns to idle without transcribing.
 *   - Graceful degradation on unsupported browsers, permission denial,
 *     and network / edge failures. Never throws to the caller.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type VoiceToTextState = 'idle' | 'recording' | 'transcribing' | 'error';
export type VoicePermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported';

/**
 * Diagnostic codes are kept for optional in-UI display only. They are
 * not emitted to any external system.
 */
export type VoiceDiagnosticCode = string;

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
  recordDiagnostic: (code: VoiceDiagnosticCode, detail?: string) => void;
}

export function detectVoiceSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder === 'undefined') {
    return false;
  }
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
  const mountedRef = useRef(true);

  const isSupported = detectVoiceSupport();

  /** Guarded state setter — silently drops writes after unmount. */
  const safeSetState = useCallback((s: VoiceToTextState) => {
    if (mountedRef.current) setState(s);
  }, []);
  const safeSetError = useCallback((e: string | null) => {
    if (mountedRef.current) setError(e);
  }, []);
  const safeSetPermission = useCallback((p: VoicePermissionState) => {
    if (mountedRef.current) setPermission(p);
  }, []);

  const recordDiagnostic = useCallback(
    (code: VoiceDiagnosticCode, detail?: string) => {
      if (!mountedRef.current) return;
      diagIdRef.current += 1;
      const evt: VoiceDiagnosticEvent = {
        id: diagIdRef.current,
        ts: Date.now(),
        code,
        detail,
      };
      setDiagnostics((prev) => {
        const next = [...prev, evt];
        return next.length > 12 ? next.slice(next.length - 12) : next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    safeSetState('idle');
    safeSetError(null);
  }, [safeSetError, safeSetState]);

  const streamAlive = useCallback((): boolean => {
    const s = streamRef.current;
    if (!s) return false;
    const tracks = s.getAudioTracks?.() ?? [];
    return tracks.length > 0 && tracks.every((t) => t.readyState === 'live');
  }, []);

  const releaseStream = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
  }, []);

  const queryPermission = useCallback(async (): Promise<VoicePermissionState> => {
    if (!isSupported) {
      safeSetPermission('unsupported');
      return 'unsupported';
    }
    try {
      const nav = navigator as Navigator & {
        permissions?: { query: (d: unknown) => Promise<PermissionStatus> };
      };
      if (!nav.permissions?.query) {
        safeSetPermission('unknown');
        return 'unknown';
      }
      const status = await nav.permissions.query({ name: 'microphone' as PermissionName });
      const s = status.state as VoicePermissionState;
      safeSetPermission(s);
      status.onchange = () => {
        safeSetPermission(status.state as VoicePermissionState);
      };
      return s;
    } catch {
      safeSetPermission('unknown');
      return 'unknown';
    }
  }, [isSupported, safeSetPermission]);

  useEffect(() => {
    mountedRef.current = true;
    void queryPermission();
    return () => {
      mountedRef.current = false;
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamAlive()) return streamRef.current;
    if (permission === 'denied') {
      safeSetError(
        'Microphone is blocked. Enable microphone for this site in your browser settings, then try again.',
      );
      safeSetState('error');
      return null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    safeSetPermission('granted');
    return stream;
  }, [permission, safeSetError, safeSetPermission, safeSetState, streamAlive]);

  const start = useCallback(async () => {
    if (!isSupported) {
      safeSetError('Voice input is not supported in this browser.');
      safeSetState('error');
      return;
    }
    if (state === 'recording' || state === 'transcribing') return;

    try {
      const stream = await ensureStream();
      if (!stream) return;

      chunksRef.current = [];
      cancelledRef.current = false;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start();
      safeSetError(null);
      safeSetState('recording');
      recordDiagnostic('VOICE_CAPTURE_STARTED');
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const msg = err instanceof Error ? err.message : String(err);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        safeSetPermission('denied');
        safeSetError(
          'Microphone permission denied. Enable microphone for this site in your browser settings, then try again.',
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        safeSetError('No microphone found on this device.');
      } else {
        safeSetError(msg || 'Microphone unavailable.');
      }
      safeSetState('error');
      releaseStream();
    }
  }, [
    ensureStream,
    isSupported,
    recordDiagnostic,
    releaseStream,
    safeSetError,
    safeSetPermission,
    safeSetState,
    state,
  ]);

  const stopAndTranscribe = useCallback(
    async (opts: { keepStream: boolean }): Promise<string | null> => {
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
      } catch {
        /* ignore */
      }
      safeSetState('transcribing');
      const blob = await finished;
      recorderRef.current = null;
      if (!opts.keepStream) releaseStream();

      if (cancelledRef.current) {
        cancelledRef.current = false;
        safeSetState('idle');
        safeSetError(null);
        return null;
      }

      try {
        const base64 = await blobToBase64(blob);
        const { data, error: fnError } = await supabase.functions.invoke('voice-to-text', {
          body: { audio: base64, mimeType },
        });
        if (fnError) {
          throw new Error(fnError.message || 'Transcription failed.');
        }
        const transcript =
          typeof (data as { transcript?: string } | null)?.transcript === 'string'
            ? (data as { transcript: string }).transcript.trim()
            : '';
        if (!transcript) {
          safeSetError('No speech detected. Try again.');
          safeSetState('error');
          return null;
        }
        safeSetState('idle');
        safeSetError(null);
        return transcript;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        safeSetError(msg || 'Transcription unavailable.');
        safeSetState('error');
        return null;
      }
    },
    [releaseStream, safeSetError, safeSetState],
  );

  const stop = useCallback(
    () => stopAndTranscribe({ keepStream: false }),
    [stopAndTranscribe],
  );
  const finalize = useCallback(
    () => stopAndTranscribe({ keepStream: true }),
    [stopAndTranscribe],
  );

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    cancelledRef.current = true;
    chunksRef.current = [];
    try {
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    // Keep the stream alive so the next start doesn't re-prompt.
    safeSetState('idle');
    safeSetError(null);
  }, [safeSetError, safeSetState]);

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
