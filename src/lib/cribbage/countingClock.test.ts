// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeCountingElapsed, createCountingClock, type CountingFrame } from './countingClock';
import type { CribbageState } from '../cribbageTypes';

const start = Date.parse('2026-11-05T12:00:00Z');
const iso = (ms: number) => new Date(start + ms).toISOString();
const state = { countingStartedAt: iso(0), countingResolution: {
  version: 3, outcome: 'ready', resolvedAt: iso(0),
  originalReleaseAt: iso(30000), presentationReleaseAt: iso(30000),
} } as CribbageState;
const frame: CountingFrame = { gameId: 'g', dealerGameId: 'dg', roundId: 'r', handNumber: 1, pauseVersion: 0, paused: false, state };
describe('Cribbage accepted frame clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it.each([-120000, 120000])('ignores a constant %i ms device offset and bounds asymmetric release', offset => {
    vi.setSystemTime(start + offset);
    const clock = createCountingClock(vi.fn());
    const sent = clock.request();
    vi.advanceTimersByTime(900);
    clock.accept(sent, performance.now(), iso(150), frame);
    const time = clock.getSnapshot()!;
    expect(time.elapsed(state)).toBe(600);
    expect(time.releaseDelay(start + 5000)).toBe(4875);
    vi.advanceTimersByTime(300);
    expect(time.elapsed(state)).toBe(900);
    // A subsequent accepted frame may refine time but must keep the current presentation.
    clock.accept(clock.request(), performance.now(), iso(1200), frame);
    expect(clock.getSnapshot()).toBe(time);
  });
  it('drops pre-interruption and reordered replies and rejects callbacks from an old round', () => {
    const clock = createCountingClock(vi.fn()), old = clock.request();
    clock.invalidate();
    clock.accept(old, performance.now(), iso(0), frame);
    expect(clock.getSnapshot()).toBeNull();
    const earlier = clock.request();
    vi.advanceTimersByTime(50);
    clock.accept(clock.request(), performance.now(), iso(50), frame);
    const accepted = clock.getSnapshot()!;
    clock.accept(earlier, performance.now(), iso(0), { ...frame, roundId: 'stale' });
    expect(clock.getSnapshot()).toBe(accepted);
    clock.accept(clock.request(), performance.now(), iso(51), { ...frame, roundId: 'next', handNumber: 2 });
    expect(accepted.current()).toBe(false);
  });
  it.each([-120000, 120000])('requests one fresh frame after a %i ms wall jump', jump => {
    const recover = vi.fn(), clock = createCountingClock(recover);
    clock.accept(clock.request(), performance.now(), iso(1000), frame);
    const old = clock.getSnapshot()!;
    vi.setSystemTime(Date.now() + jump);
    expect(old.current()).toBe(false);
    expect(old.current()).toBe(false);
    expect(recover).toHaveBeenCalledTimes(1);
    clock.accept(clock.request(), performance.now(), iso(1200), frame);
    expect(clock.getSnapshot()!.elapsed(state)).toBe(1200);
  });
  it('invalidates a delayed wake callback even if both clocks advanced during sleep', () => {
    const recover = vi.fn(), clock = createCountingClock(recover);
    clock.accept(clock.request(), performance.now(), iso(0), frame);
    expect(clock.getSnapshot()!.current(120000)).toBe(false);
    expect(recover).toHaveBeenCalledOnce();
  });
  it('holds server time at the pause receipt and retires outstanding callbacks', () => {
    const clock = createCountingClock(vi.fn());
    clock.accept(clock.request(), performance.now(), iso(500), frame);
    const running = clock.getSnapshot()!;
    clock.accept(clock.request(), performance.now(), iso(1000), { ...frame, paused: true, pausedAt: iso(800), pauseVersion: 1,
      state });
    vi.advanceTimersByTime(120000);
    expect(running.current()).toBe(false);
    const paused = clock.getSnapshot()!;
    expect(paused.current()).toBe(false);
    expect(paused.elapsed(state)).toBe(800);
  });
  it('subtracts prior pauses on a fresh mount, and starts an ambiguous legacy hand conservatively', () => {
    const resumed = { ...state, countingResolution: { ...state.countingResolution!, presentationReleaseAt: iso(150000) } };
    expect(activeCountingElapsed(start+123000, resumed, 4)).toBe(3000);
    const legacy = { ...resumed, countingResolution: { ...resumed.countingResolution, originalReleaseAt: undefined } };
    expect(activeCountingElapsed(start+123000, legacy, 4)).toBe(0);
    expect(activeCountingElapsed(start+3000, legacy, 0)).toBe(3000);
  });
});
