// Development entry only. The production singleton and account preference stay untouched.
import {AudioManager} from '@/lib/audio/audioManager';
import {createPlaybackSession} from '@/lib/audio/playbackSession';
export const LAB_USER = '00000000-0000-4000-8000-000000000002';
const preference = 'ptown-sound-studio-v2-enabled';
export const platformAudio = new AudioManager({
  createContext: () => new (window.AudioContext ?? (window as any).webkitAudioContext)(),
  loadPreference: async () => localStorage.getItem(preference) !== 'false',
  savePreference: async (_, enabled) => { localStorage.setItem(preference, String(enabled)); },
  now: () => performance.now(), storage: () => sessionStorage, document: () => document,
  playbackSession: createPlaybackSession(),
});
