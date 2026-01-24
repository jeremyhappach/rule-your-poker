import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to play a doorbell chime when a new player sits down at the table.
 * Respects the user's play_sounds preference.
 */
export const useDoorbellSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playSoundsRef = useRef(true);
  const isUnlockedRef = useRef(false);

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

  // Unlock audio context on first user interaction (required for mobile browsers)
  useEffect(() => {
    const unlock = () => {
      if (isUnlockedRef.current) return;
      
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        isUnlockedRef.current = true;
      } catch (e) {
        console.log('[DOORBELL] AudioContext not available');
      }
    };

    // Try to unlock on various user interactions
    const events = ['touchstart', 'touchend', 'mousedown', 'click'];
    events.forEach(e => document.addEventListener(e, unlock, { once: true }));

    return () => {
      events.forEach(e => document.removeEventListener(e, unlock));
    };
  }, []);

  const playDoorbell = useCallback(() => {
    if (!playSoundsRef.current) return;
    
    const ctx = audioContextRef.current;
    if (!ctx) {
      // Fallback: try to create context on demand
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return;
      }
    }
    
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    try {
      // Resume context if suspended (mobile browsers)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // Create a pleasant two-tone doorbell chime
      const now = audioCtx.currentTime;

      // First tone (higher pitch)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Second tone (lower pitch, slight delay)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5
      gain2.gain.setValueAtTime(0.25, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.5);

      console.log('[DOORBELL] Played doorbell chime');
    } catch (e) {
      console.log('[DOORBELL] Failed to play:', e);
    }
  }, []);

  return { playDoorbell };
};
