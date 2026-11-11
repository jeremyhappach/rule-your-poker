// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AudioManager, type AudioCue} from './audioManager';

// Each creation gets a genuinely separate graph. 'silent' models the reported
// failure: state still says running, resume succeeds, but no source is audible.
function contextFixture() {
  const nodes: {stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>}[] = [];
  const ctx = Object.assign(new EventTarget(), {
    state: 'running', silent: false, audible: 0, currentTime: 10, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      const node = {connect: vi.fn(), disconnect: vi.fn(), stop: vi.fn()}; nodes.push(node); return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = {buffer: null, onended: null, connect: vi.fn(), disconnect: vi.fn(), stop: vi.fn(),
        start: vi.fn(() => {if (!ctx.silent && ctx.state === 'running') ctx.audible++;})};
      nodes.push(node); return node;
    }),
    createBuffer: vi.fn(() => ({})),
  });
  ctx.close.mockImplementation(async () => {ctx.state = 'closed'; ctx.dispatchEvent(new Event('statechange'));});
  return {ctx, nodes};
}
const cue: AudioCue = {durationMs: 100, schedule(ctx, output, track) {
  const source = track(ctx.createBufferSource()); source.connect(output); source.start(); return true;
}};
const settled = async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();};
let contexts: ReturnType<typeof contextFixture>[], manager: AudioManager, dispose: () => void;
let interrupted: () => void, recovered: () => void, sessionInterrupted: boolean|undefined;
const event = (id: string) => ({userId: 'user', id, cue, expiresAt: Date.now() + 1000});
beforeEach(async () => {
  vi.useFakeTimers(); sessionStorage.clear(); contexts = []; sessionInterrupted=undefined;
  manager = new AudioManager({createContext: () => {const item = contextFixture(); contexts.push(item); return item.ctx as unknown as AudioContext;},
    now: () => Date.now(), storage: () => sessionStorage, document: () => document,
    loadPreference: async () => true, savePreference: async () => {},
    playbackSession: {activate() {}, release() {}, interrupted:()=>sessionInterrupted,
      observe(onInterrupted, onRecovered) {interrupted = onInterrupted; recovered = onRecovered; return () => {};}}});
  dispose = manager.install(); manager.setUser('user'); await settled();
});
afterEach(() => {dispose(); vi.restoreAllMocks(); vi.useRealTimers();});

it('unmute replaces a running-but-silent context without reloading or replaying old sounds', async () => {
  manager.request(event('heard')); const old = contexts[0]; old.ctx.silent = true;
  manager.request(event('lost')); expect(old.ctx.audible).toBe(1);
  await manager.savePreference('user', false);
  manager.unlock(true); expect(contexts).toHaveLength(1); // Muted taps cannot reopen it.
  manager.request(event('muted'));
  await manager.savePreference('user', true);
  expect(old.ctx.close).toHaveBeenCalledOnce(); expect(contexts).toHaveLength(2);
  const fresh = contexts[1].ctx, primer = fresh.audible;
  expect(primer).toBe(1); // Synchronously primed during the unmute gesture.
  for (const id of ['heard', 'lost', 'muted']) manager.request(event(id));
  expect(fresh.audible).toBe(primer);
  manager.request(event('new')); expect(fresh.audible).toBe(primer + 1);
  expect(contexts.filter(c => c.ctx.state !== 'closed')).toHaveLength(1);
});

it.each(['visibility', 'pagehide'] as const)('recreates after %s even when the old state falsely stays running', async boundary => {
  manager.request(event('before')); const old = contexts[0]; old.ctx.silent = true;
  const hidden = vi.spyOn(document, 'hidden', 'get');
  if (boundary === 'visibility') {hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));}
  else window.dispatchEvent(new Event('pagehide'));
  expect(old.ctx.close).toHaveBeenCalledOnce();
  manager.request(event('away')); manager.unlock(true); expect(contexts).toHaveLength(1);
  hidden.mockReturnValue(false); window.dispatchEvent(new Event('pageshow'));
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('app:page-resumed'));
  expect(contexts).toHaveLength(2);
  manager.request(event('away')); expect(contexts[1].ctx.audible).toBe(0);
  manager.request(event('after')); expect(contexts[1].ctx.audible).toBe(1);
});

it('a real gameplay exit gives the next Arcade/game entry a fresh context; header handoffs do not', async () => {
  const leave = manager.acquireGameplay(); manager.request(event('first-game'));
  const old = contexts[0]; old.ctx.silent = true;
  leave(); const handoff = manager.acquireGameplay(); await settled();
  expect(old.ctx.close).not.toHaveBeenCalled(); expect(contexts).toHaveLength(1);
  handoff(); await settled(); expect(old.ctx.close).toHaveBeenCalledOnce();
  const leaveNext = manager.acquireGameplay(); manager.request(event('next-game'));
  expect(contexts).toHaveLength(2); expect(contexts[1].ctx.audible).toBe(1); leaveNext();
});

it('rechecks native session state on return when WebKit misses its recovery event', () => {
  manager.request(event('before'));
  sessionInterrupted=true;
  interrupted();
  manager.unlock(true);
  expect(contexts).toHaveLength(1);
  sessionInterrupted=false;
  window.dispatchEvent(new Event('pageshow'));
  manager.request(event('before'));
  manager.request(event('after'));
  expect(contexts).toHaveLength(2);
  expect(contexts[1].ctx.audible).toBe(1);
});

it('retires queued requests/timelines and ignores completion/events from an abandoned resume', async () => {
  manager.unlock(); const old = contexts[0]; let finish!: () => void;
  old.ctx.state = 'suspended'; old.ctx.resume.mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
  manager.request(event('pending'));
  const timeline = {userId: 'user', id: 'count', startedAt: Date.now(), expiresAt: Date.now() + 1000, cueAt: () => cue};
  manager.follow(timeline);
  window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow'));
  const fresh = contexts[1]; finish(); await settled();
  old.ctx.state = 'interrupted'; old.ctx.dispatchEvent(new Event('statechange'));
  manager.request(event('pending')); manager.follow(timeline);
  expect(fresh.ctx.audible).toBe(0); expect(fresh.ctx.close).not.toHaveBeenCalled();
  manager.request(event('new')); expect(fresh.ctx.audible).toBe(1);
});

it('blocks cues during an AudioSession interruption and recreates only after recovery', () => {
  manager.request(event('before')); interrupted();
  manager.request(event('interrupted')); manager.unlock(true); expect(contexts).toHaveLength(1);
  window.dispatchEvent(new Event('focus')); expect(contexts).toHaveLength(1);
  recovered(); expect(contexts).toHaveLength(2);
  manager.request(event('interrupted')); expect(contexts[1].ctx.audible).toBe(0);
  manager.request(event('after')); expect(contexts[1].ctx.audible).toBe(1);
});

it('an interrupted context is retired even when no AudioSession API event is available', () => {
  manager.request(event('before')); const old = contexts[0];
  old.ctx.state = 'interrupted'; old.ctx.dispatchEvent(new Event('statechange'));
  expect(old.ctx.close).toHaveBeenCalledOnce();
  manager.unlock(true); manager.request(event('after'));
  expect(contexts).toHaveLength(2); expect(contexts[1].ctx.audible).toBe(2);
});

it('explicit unmute retries even if the native session recovery event never arrived', async () => {
  manager.request(event('before')); interrupted();
  await manager.savePreference('user', false); await manager.savePreference('user', true);
  expect(contexts).toHaveLength(2);
  manager.request(event('fresh')); expect(contexts[1].ctx.audible).toBe(2);
});

it('a close failure cannot strand recovery or let the old graph keep playing', async () => {
  manager.request(event('old')); const old = contexts[0];
  old.ctx.close.mockRejectedValue(new Error('broken device'));
  await manager.savePreference('user', false); await manager.savePreference('user', true);
  expect(old.nodes.every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
  manager.request(event('fresh')); expect(contexts[1].ctx.audible).toBe(2);
});
