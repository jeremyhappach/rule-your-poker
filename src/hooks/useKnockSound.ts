import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to play 3 knocks on a table sound effect using Web Audio API.
 * Respects the user's play_sounds preference.
 */
export const useKnockSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playSoundsRef = useRef(true);

  // Fetch user's sound preference
  useEffect(() => {
    const fetchPref = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('play_sounds')
        .eq('id', user.id)
        .single();
      if (data) {
        playSoundsRef.current = data.play_sounds ?? true;
      }
    };
    fetchPref();
  }, []);

  // Unlock audio context on first user interaction
  useEffect(() => {
    const unlock = () => {
      if (audioContextRef.current) return;
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        // AudioContext unavailable
      }
    };
    const events = ['touchstart', 'touchend', 'mousedown', 'click'];
    events.forEach(e => document.addEventListener(e, unlock, { once: true }));
    return () => {
      events.forEach(e => document.removeEventListener(e, unlock));
    };
  }, []);

  const playKnock = useCallback(() => {
    if (!playSoundsRef.current) return;

    let ctx = audioContextRef.current;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
      } catch {
        return;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    try {
      const now = ctx.currentTime;

      // Play 3 knocks with ~180ms spacing — synthesized as short noise bursts
      // with a low-pass filter to simulate knuckles on wood
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.18;

        // White noise source (short burst)
        const bufferSize = ctx.sampleRate * 0.06; // 60ms burst
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let s = 0; s < bufferSize; s++) {
          output[s] = (Math.random() * 2 - 1) * 0.8;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        // Low-pass filter for woody thump character
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);
        filter.Q.setValueAtTime(1.5, t);

        // Gain envelope — sharp attack, quick decay
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.7, t + 0.005); // 5ms attack
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06); // 55ms decay

        // Sub-bass thump for body
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(80, t);
        sub.frequency.exponentialRampToValueAtTime(40, t + 0.05);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0, t);
        subGain.gain.linearRampToValueAtTime(0.5, t + 0.003);
        subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        // Connect noise path
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        // Connect sub path
        sub.connect(subGain);
        subGain.connect(ctx.destination);

        noise.start(t);
        noise.stop(t + 0.06);
        sub.start(t);
        sub.stop(t + 0.06);
      }

      console.log('[KNOCK] Played 3 table knocks');
    } catch (e) {
      console.log('[KNOCK] Failed to play:', e);
    }
  }, []);

  return { playKnock };
};
