import { vi } from 'vitest';
import { AudioManager } from './audioManager';

const parameter = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
const fakeNode = (kind: string) => ({ kind, type: '', buffer: null, gain: parameter(), frequency: parameter(), Q: parameter(), playbackRate: parameter(),
  connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), setPeriodicWave: vi.fn(), onended: null });
export function audioHarness(loadPreference: (userId: string) => Promise<boolean | null> = async () => true) {
  const nodes: ReturnType<typeof fakeNode>[] = [];
  function node(kind: string) {
    const value = fakeNode(kind);
    nodes.push(value);
    return value;
  }
  const ctx = Object.assign(new EventTarget(), {
    state: 'running', currentTime: 10, sampleRate: 1000, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createGain: vi.fn(() => node('gain')),
    createOscillator: vi.fn(() => node('oscillator')),
    createPeriodicWave: vi.fn(() => ({} as PeriodicWave)),
    createBufferSource: vi.fn(() => node('buffer')),
    createBiquadFilter: vi.fn(() => node('filter')),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
  });
  const createContext = vi.fn(() => ctx as unknown as AudioContext);
  const preference = vi.fn(loadPreference);
  const env = { createContext, loadPreference: preference, now: () => Date.now(), storage: () => sessionStorage, document: () => document };
  const manager = new AudioManager(env);
  const dispose = manager.install();
  manager.setUser('user');
  const state = (value: string) => { ctx.state = value; ctx.dispatchEvent(new Event('statechange')); };
  return { manager, ctx, nodes, createContext, preference, env, dispose, state,
    starts: () => nodes.flatMap(n => n.start.mock.calls.map(call => call[0] as number)) };
}
