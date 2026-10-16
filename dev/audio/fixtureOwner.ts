import { AudioManager } from '../../src/lib/audio/audioManager';

export const probe = { contexts: 0, starts: [] as number[], context: null as AudioContext | null, resolvePreference: null as ((value: boolean) => void) | null };
const delayed = new URLSearchParams(location.search).has('delayed');
export const platformAudio = new AudioManager({
  createContext: () => {
    probe.contexts++;
    const ctx = new AudioContext(); probe.context = ctx;
    const create = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const source = create(), start = source.start.bind(source);
      source.start = (when = 0) => { probe.starts.push(when); start(when); };
      return source;
    };
    return ctx;
  },
  loadPreference: () => delayed ? new Promise(resolve => { probe.resolvePreference = resolve; }) : Promise.resolve(true),
  now: () => performance.now(), storage: () => sessionStorage, document: () => document,
});
platformAudio.install();
platformAudio.setUser('browser-user');
