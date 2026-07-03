/**
 * useVoiceToText — minimal, contained speech-to-text hook for the
 * match-chat composer.
 *
 * Records a short audio clip via MediaRecorder, POSTs it to the
 * `voice-to-text` Supabase edge function which delegates to
 * ElevenLabs. Returns the transcript as text so the composer can
 * insert it as an editable draft. Never persists raw audio.
 *
 * Failures (permission denied, no capability configured, network,
 * transcription error) resolve as an `error` state — the caller must
 * continue to allow normal typing.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type VoiceToTextState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceToTextResult {
  state: VoiceToTextState;
  error: string | null;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  reset: () => void;
}

function detectSupport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isSupported = detectSupport();

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  const releaseStream = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Voice input not supported on this device.');
      setState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start();
      setError(null);
      setState('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Microphone permission denied.');
      setState('error');
      releaseStream();
    }
  }, [isSupported, releaseStream]);

  const stop = useCallback(async (): Promise<string | null> => {
    const rec = recorderRef.current;
    if (!rec) {
      releaseStream();
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
    releaseStream();

    try {
      const base64 = await blobToBase64(blob);
      const { data, error: fnError } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64, mimeType },
      });
      if (fnError) throw new Error(fnError.message || 'Transcription failed.');
      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
      if (!transcript) {
        setError('No speech detected.');
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

  return { state, error, isSupported, start, stop, reset };
}
