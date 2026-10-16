import {useEffect, useRef} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {strikeBoxingBell} from '@/lib/run21/boxingBell';

/** Audio is optional presentation; failure or a locked device never delays the turn. */
export function useRun21Bell(userId: string, introKey: string | null) {
  const audio = useRef<AudioContext | null>(null);
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    const unlock = () => {
      try {
        const Audio = window.AudioContext ?? (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
        if (!Audio) return;
        audio.current ??= new Audio();
        if (audio.current.state === 'suspended') void audio.current.resume().catch(() => {});
      } catch { /* Autoplay is optional. */ }
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      void audio.current?.close().catch(() => {}); audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (!introKey || attempted.current.has(introKey)) return;
    attempted.current.add(introKey);
    const key = `run21-bell:${userId}:${introKey}`;
    try {if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1');} catch { /* In-memory dedupe remains. */ }
    let cancelled = false;
    // Check the current mute preference for each round; fail silent while unavailable.
    void supabase.from('profiles').select('play_sounds').eq('id', userId).maybeSingle().then(({data}) => {
      if (cancelled || data?.play_sounds === false || !data) return;
      try {
        const Audio = window.AudioContext ?? (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
        if (!audio.current && Audio) audio.current = new Audio();
        if (audio.current) strikeBoxingBell(audio.current);
      } catch { /* Never block gameplay for audio. */ }
    }, () => {});
    return () => {cancelled = true;};
  }, [introKey, userId]);
}
