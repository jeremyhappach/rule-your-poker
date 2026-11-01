import { supabase } from '@/integrations/supabase/client';
import { AudioManager } from './audioManager';
import { createPlaybackSession } from './playbackSession';

export const platformAudio = new AudioManager({
  playbackSession: createPlaybackSession(),
  savePreference: async (userId, enabled) => {
    const { data, error } = await supabase.from('profiles').update({play_sounds: enabled}).eq('id', userId).select('play_sounds').single();
    if (error || data?.play_sounds !== enabled) throw new Error('Unable to save Sounds. Please try again.');
  },
  createContext: () => {
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) throw new Error('Web Audio unavailable');
    return new Context();
  },
  loadPreference: async userId => {
    const { data, error } = await supabase.from('profiles').select('play_sounds').eq('id', userId).maybeSingle();
    return !error && data ? data.play_sounds ?? true : null;
  },
  now: () => performance.now(),
  storage: () => sessionStorage,
  document: () => document,
});
