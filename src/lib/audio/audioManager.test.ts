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

it('retains unplayed timelines through delayed suspension notices across multiplayer and Arcade',async()=>{
 await ready();
 for(const id of ['multiplayer:11:1','arcade:11:1','arcade:11:2','multiplayer:tri:1','multiplayer:run21:1']){
  h.ctx.state='suspended';const before=h.starts().length;
  h.manager.follow({userId:'user',id,startedAt:Date.now(),expiresAt:Date.now()+2500,cueAt:()=>boxingBellCue});
  h.state('suspended');expect(h.starts()).toHaveLength(before);
  h.state('running');expect(h.starts()).toHaveLength(before+8);
 }
 expect(h.createContext).toHaveBeenCalledTimes(1);
});

it('primes only trusted gestures and replaces a closed context without stale listeners',async()=>{
 await ready();h.manager.unlock();expect(h.ctx.createBufferSource).not.toHaveBeenCalled();
 h.manager.unlock(true);h.manager.unlock(true);expect(h.ctx.createBufferSource).toHaveBeenCalledTimes(1);
 const old=h.ctx,other=audioHarness();other.dispose();other.ctx.state='running';
 h.createContext.mockReturnValue(other.ctx as unknown as AudioContext);
 old.state='closed';h.manager.unlock(true);
 expect(other.ctx.createBufferSource).toHaveBeenCalledTimes(1);
 h.manager.request(event('after-close'));expect(other.starts()).toHaveLength(9);
 old.dispatchEvent(new Event('statechange'));expect(other.nodes.filter(n=>n.kind==='oscillator').every(n=>n.stop.mock.calls.length===1)).toBe(true);
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

it('discards muted events and stops active sources without replay on unmute', async () => {
  await ready(); h.manager.setPreference('user', false); h.manager.request(event());
  expect(h.starts()).toEqual([]);
  h.manager.setPreference('user', true); h.manager.request(event()); expect(h.starts()).toHaveLength(0);
  h.manager.request(event('fresh')); expect(h.starts()).toHaveLength(8);
  h.manager.setPreference('user', false);
  expect(h.nodes.filter(n => n.kind === 'oscillator').every(n => n.stop.mock.calls.length === 2)).toBe(true);
  h.manager.setPreference('user', true); h.manager.request(event()); expect(h.starts()).toHaveLength(8);
});

it('mute consumes queued effects and timelines while suspended, including same-id remounts', async () => {
  await ready(); h.ctx.state = 'suspended';
  const timeline = {userId:'user', id:'queued-count', startedAt:Date.now(), expiresAt:Date.now()+2500, cueAt:()=>boxingBellCue};
  h.manager.request(event()); h.manager.follow(timeline);
  h.manager.setPreference('user', false); h.manager.setPreference('user', true); h.state('running');
  h.manager.request(event()); h.manager.follow(timeline); expect(h.starts()).toHaveLength(0);
  h.manager.request(event('new')); expect(h.starts()).toHaveLength(8);
});

it('unmute obtains a context immediately and foreground recovery does not replay old effects', async () => {
  await ready(); h.manager.request(event()); h.manager.setPreference('user', false);
  h.ctx.state = 'suspended'; h.ctx.resume.mockClear(); h.manager.setPreference('user', true);
  expect(h.ctx.resume).toHaveBeenCalledTimes(1); await ready();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  h.manager.request(event('hidden'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); window.dispatchEvent(new Event('pageshow'));
  h.state('running'); h.manager.request(event('hidden')); expect(h.starts()).toHaveLength(8);
  h.manager.request(event('visible')); expect(h.starts()).toHaveLength(16);
});

it('retries a blocked foreground resume inside the next trusted gesture without creating a new context', async () => {
  await ready(); h.ctx.state='suspended';h.ctx.resume.mockImplementation(()=>new Promise<void>(()=>{}));
  h.manager.unlock();h.manager.unlock();expect(h.ctx.resume).toHaveBeenCalledTimes(1);
  h.manager.unlock(true);expect(h.ctx.resume).toHaveBeenCalledTimes(2);expect(h.createContext).toHaveBeenCalledTimes(1);
  h.state('running');h.manager.request(event('after-gesture'));expect(h.starts()).toHaveLength(9);
});

it('owns playback only during audible foreground gameplay and releases after the last header', async () => {
  const playbackSession = {activate:vi.fn(), release:vi.fn()}; h.env.playbackSession = playbackSession;
  await ready(); const one = h.manager.acquireGameplay(), two = h.manager.acquireGameplay();
  expect(playbackSession.activate).toHaveBeenCalled(); playbackSession.release.mockClear(); one();
  expect(playbackSession.release).not.toHaveBeenCalled(); two();
  const handoff=h.manager.acquireGameplay(); await ready();
  expect(playbackSession.release).not.toHaveBeenCalled();
  handoff(); await ready(); expect(playbackSession.release).toHaveBeenCalledTimes(1);
  h.manager.acquireGameplay(); h.manager.setPreference('user', false); expect(playbackSession.release).toHaveBeenCalledTimes(2);
});

it('shares optimistic preference updates and rolls back a failed save without a stale profile race', async () => {
  await ready(); let reject!: (error: Error) => void;
  const save = vi.fn(() => new Promise<void>((_, r) => { reject = r; })); h.env.savePreference = save;
  const listener = vi.fn(), unsubscribe = h.manager.subscribe(listener);
  const pending = h.manager.savePreference('user', false);
  expect(h.manager.getSnapshot()).toEqual({userId:'user', enabled:false, saving:true});
  await h.manager.savePreference('user', true); expect(save).toHaveBeenCalledTimes(1);
  reject(new Error('offline')); await expect(pending).rejects.toThrow('offline');
  expect(h.manager.getSnapshot()).toEqual({userId:'user', enabled:true, saving:false});
  expect(listener).toHaveBeenCalled(); unsubscribe();
});

it('does not let an old save completion unlock a new account save', async () => {
  await ready(); const complete: (() => void)[] = [];
  h.env.savePreference = () => new Promise<void>(resolve => complete.push(resolve));
  const old = h.manager.savePreference('user', false);
  h.manager.setUser(null); h.manager.setUser('user'); await ready();
  const current = h.manager.savePreference('user', false); complete[0](); await old;
  expect(h.manager.getSnapshot().saving).toBe(true); complete[1](); await current;
  expect(h.manager.getSnapshot()).toEqual({userId:'user',enabled:false,saving:false});
});

it('allows simultaneous independent effects and reloads the existing persisted Sounds field', async () => {
  await ready(); let persisted=true; h.env.savePreference=async(_id,enabled)=>{persisted=enabled;};
  h.manager.request(event('card'));h.manager.request(event('celebration'));expect(h.starts()).toHaveLength(16);
  await h.manager.savePreference('user',false);h.dispose();h=audioHarness(async()=>persisted);await ready();
  expect(h.manager.getSnapshot().enabled).toBe(false);h.manager.request(event('after-reload'));expect(h.starts()).toHaveLength(0);
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

it('keeps an unplayed live timeline through repeated mobile unlock gestures, then plays once',async()=>{
 await ready();h.ctx.state='suspended';
 const cue={userId:'user',id:'eleven:opponent:round:bell',startedAt:Date.now(),expiresAt:Date.now()+2500,cueAt:()=>boxingBellCue};
 h.manager.follow(cue);h.manager.unlock();h.manager.unlock();
 expect(h.starts()).toEqual([]);expect(sessionStorage.length).toBe(0);
 h.state('running');expect(h.starts()).toHaveLength(8);
 h.manager.follow(cue);h.manager.unlock();expect(h.starts()).toHaveLength(8);
});
