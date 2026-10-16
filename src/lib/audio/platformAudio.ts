import { supabase } from '@/integrations/supabase/client';
import { AudioManager } from './audioManager';

export const platformAudio = new AudioManager({
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
