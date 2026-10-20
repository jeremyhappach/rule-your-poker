import {AudioManager} from '@/lib/audio/audioManager';
/** Same canonical audio owner, with local-only preferences for an isolated fixture. */
export const platformAudio=new AudioManager({
  createContext:()=>new AudioContext(),loadPreference:async()=>true,
  now:()=>performance.now(),storage:()=>sessionStorage,document:()=>document,
});
