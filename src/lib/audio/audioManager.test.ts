// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { audioHarness } from './audioTestHarness';
import { boxingBellCue } from '../run21/boxingBell';
import { doorbellCue, knockCue, ginScratchCue } from './platformCues';

let h: ReturnType<typeof audioHarness>;
const ready = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const event = (id = 'round1:player1', remaining = 2500) => ({ userId: 'user', id: `run21-bell:session:game:hand:${id}`, expiresAt: Date.now() + remaining, cue: boxingBellCue });
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); h = audioHarness(); });
afterEach(() => { h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('unlocks synchronously before a game mounts and reuses one context for rounds and other cues', async () => {
  h.ctx.state = 'suspended'; h.manager.unlock();
  expect(h.createContext).toHaveBeenCalledTimes(1); expect(h.ctx.resume).toHaveBeenCalledTimes(1);
  h.state('running'); await ready();
  for (const id of ['round1:player1', 'round1:player2', 'round2:player1', 'round3:player1']) h.manager.request(event(id));
  expect(h.starts()).toEqual(Array.from({length: 4}, () => [10,10,10,10,10.32,10.32,10.32,10.32]).flat());
  h.manager.play(doorbellCue); h.manager.play(knockCue); h.manager.play(ginScratchCue);
  expect(h.createContext).toHaveBeenCalledTimes(1); expect(h.ctx.close).not.toHaveBeenCalled();
});

it('a suspended first observed intro is not consumed; readiness schedules exactly two strikes', async () => {
  await ready(); h.ctx.state = 'suspended';
  h.manager.request(event()); h.manager.request(event());
  expect(h.starts()).toEqual([]); expect(sessionStorage.length).toBe(0);
  h.state('running');
  expect(h.starts()).toEqual([10,10,10,10,10.32,10.32,10.32,10.32]); expect(sessionStorage.length).toBe(1);
  h.manager.request(event()); expect(h.starts()).toHaveLength(8);
});

it('never catches up an expired or insufficient remaining window after unlock', async () => {
  await ready(); h.ctx.state = 'suspended'; h.manager.request(event());
  vi.advanceTimersByTime(2501); h.state('running');
  h.manager.request(event('late', 300));
  expect(h.starts()).toEqual([]); expect(sessionStorage.length).toBe(0);
});

it('waits for asynchronous preference loading, but only within the presentation window', async () => {
  h.dispose(); let resolve!: (enabled: boolean) => void;
  h = audioHarness(() => new Promise(r => { resolve = r; }));
  h.manager.request(event()); expect(h.starts()).toEqual([]);
  await ready(); resolve(true); await ready(); expect(h.starts()).toHaveLength(8);
  expect(h.preference).toHaveBeenCalledTimes(1);
});

it('discards preference completion after expiry or withdrawal', async () => {
  h.dispose(); let resolve!: (enabled: boolean) => void;
  h = audioHarness(() => new Promise(r => { resolve = r; }));
  h.manager.request(event()); const cancel = h.manager.request(event('retired')); cancel();
  await ready(); vi.advanceTimersByTime(2501); resolve(true); await ready();
  expect(h.starts()).toEqual([]); expect(sessionStorage.length).toBe(0);
});

it('respects mute, unmutes eligible events, and stops active sources when muted again', async () => {
  await ready(); h.manager.setPreference('user', false); h.manager.request(event());
  expect(h.starts()).toEqual([]); expect(sessionStorage.length).toBe(0);
  h.manager.setPreference('user', true); expect(h.starts()).toHaveLength(8);
  h.manager.setPreference('user', false);
  expect(h.nodes.filter(n => n.kind === 'oscillator').every(n => n.stop.mock.calls.length === 2)).toBe(true);
  h.manager.setPreference('user', true); h.manager.request(event()); expect(h.starts()).toHaveLength(8);
});

it('a saved preference wins over a stale initial fetch and does not affect another user', async () => {
  h.dispose(); let resolve!: (enabled: boolean) => void;
  h = audioHarness(() => new Promise(r => { resolve = r; })); await ready();
  h.manager.setPreference('user', false); resolve(true); await ready();
  h.manager.setPreference('someone-else', true); h.manager.request(event()); expect(h.starts()).toEqual([]);
});

it('profile failure stays silent and does not consume the event', async () => {
  h.dispose(); h = audioHarness(async () => { throw new Error('offline'); });
  h.manager.request(event()); await ready(); expect(h.starts()).toEqual([]); expect(sessionStorage.length).toBe(0);
});

it('suppresses duplicates across refresh (new manager) and keeps successful cues through component remounts', async () => {
  await ready(); const cancel = h.manager.request(event()); cancel(); h.manager.request(event());
  expect(h.starts()).toHaveLength(8);
  h.dispose(); h = audioHarness(); await ready(); h.manager.request(event());
  expect(h.starts()).toEqual([]);
});

it.each(['suspended', 'interrupted'])('cancels sources on %s, never resumes old strikes, then permits a new intro', async state => {
  await ready(); h.manager.request(event()); h.state(state);
  expect(h.nodes.filter(n => n.kind === 'oscillator').every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
  vi.advanceTimersByTime(3000); h.state('running'); h.manager.request(event()); expect(h.starts()).toHaveLength(8);
  h.manager.request(event('round2:player1')); expect(h.starts()).toHaveLength(16);
});

it('partial scheduling failure creates no receipt or connected output and can retry', async () => {
  await ready();
  const create = h.ctx.createOscillator.getMockImplementation()!;
  let attempts = 0;
  h.ctx.createOscillator.mockImplementation(() => { if (++attempts === 5) throw new Error('resource failure'); return create(); });
  h.manager.request(event()); expect(sessionStorage.length).toBe(0);
  expect(h.nodes[0].connect).not.toHaveBeenCalled();
  expect(h.starts()).toHaveLength(4);
  expect(h.nodes.filter(n => n.kind === 'oscillator').every(n => n.stop.mock.calls.length === 2)).toBe(true);
  h.manager.unlock(); expect(h.starts()).toHaveLength(12); expect(sessionStorage.length).toBe(1);
});

it('uninstall is idempotent at installation and cancels pending work and the one context', async () => {
  await ready(); expect(h.manager.install()).toBe(h.dispose);
  h.manager.request(event()); h.dispose(); expect(h.ctx.close).toHaveBeenCalledTimes(1);
  expect(h.nodes.every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
});

it('storage restrictions retain in-memory dedupe', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  await ready(); h.manager.request(event()); h.manager.request(event()); expect(h.starts()).toHaveLength(8);
});

it('new-user auth invalidates pending requests and a late old-user preference', async () => {
  await ready(); h.ctx.state = 'suspended'; h.manager.request(event()); h.manager.setUser('other');
  await ready(); h.state('running'); expect(h.starts()).toEqual([]);
  h.manager.request({...event(), userId: 'other'}); expect(h.starts()).toHaveLength(8);
});

it.each([
  ['doorbell', doorbellCue, [10,10.15], [880,659.25]],
  ['knock', knockCue, [10,10,10.18,10.18,10.36,10.36], [80,80,80]],
  ['scratch', ginScratchCue, [10], []],
] as const)('preserves the existing %s source pattern and honors shared mute', async (_name, cue, starts, frequencies) => {
  await ready(); expect(h.manager.play(cue)).toBe(true); expect(h.starts()).toEqual(starts);
  expect(h.nodes.filter(n => n.kind === 'oscillator').map(n => n.frequency.setValueAtTime.mock.calls[0][0])).toEqual(frequencies);
  h.manager.setPreference('user', false); expect(h.manager.play(cue)).toBe(false); expect(h.starts()).toEqual(starts);
});

it('does not catch up existing instantaneous sounds after blocked playback', async () => {
  await ready(); h.ctx.state = 'suspended';
  expect(h.manager.play(doorbellCue)).toBe(false); h.state('running'); expect(h.starts()).toEqual([]);
});
