// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCribbageCountRelease, type CountRelease } from './useCribbageCountRelease';
import { createCountingClock, type CountingFrame, type CountingTime } from '@/lib/cribbage/countingClock';

const origin = Date.parse('2026-11-05T12:00:00Z');
const frame = { gameId: 'g', dealerGameId: 'dg', roundId: 'r', handNumber: 1, pauseVersion: 0, paused: false } as CountingFrame;
function setup(submit: () => Promise<CountRelease>) {
  const clock = createCountingClock(vi.fn());
  const sync = () => clock.accept(clock.request(), performance.now(), new Date(origin + performance.now()).toISOString(), frame);
  sync();
  const apply = vi.fn(), failed = vi.fn();
  const hook = renderHook(({scope,time}: {scope: string; time: CountingTime | null}) =>
    useCribbageCountRelease(scope, time, submit, apply, failed), {initialProps:{scope:'hand',time:clock.getSnapshot()}});
  return { clock, sync, apply, failed, ...hook };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('coalesces both completion paths and waits through a pause before retrying a lost response', async () => {
  let respond!: (v: CountRelease) => void;
  const submit = vi.fn(() => new Promise<CountRelease>(resolve => { respond = resolve; }));
  const h = setup(submit);
  act(() => { h.result.current(); h.result.current(); });
  expect(submit).toHaveBeenCalledTimes(1);
  h.clock.invalidate();
  h.rerender({ scope:'hand', time:null });
  await act(async () => respond({outcome:'activated'}));
  expect(h.apply).not.toHaveBeenCalled();
  h.sync();
  h.rerender({ scope:'hand', time:h.clock.getSnapshot() });
  expect(submit).toHaveBeenCalledTimes(2);
  await act(async () => respond({outcome:'already_active'}));
  act(() => h.result.current());
  expect(h.apply).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledTimes(2);
});
it('rejects an old completion response after hand replacement', async () => {
  let respond!: (v: CountRelease) => void;
  const h = setup(() => new Promise(resolve => { respond = resolve; }));
  act(() => h.result.current());
  h.rerender({scope:'successor',time:null});
  await act(async () => respond({outcome:'terminal'}));
  expect(h.apply).not.toHaveBeenCalled();
});
it('uses one deadline timer and bounds repeated pending replies past the deadline', async () => {
  const submit = vi.fn(async (): Promise<CountRelease> => ({outcome:'presentation_pending',presentation_release_at:new Date(origin+5000).toISOString()}));
  const h = setup(submit);
  await act(async () => { h.result.current(); h.result.current(); });
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(5024));
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(submit).toHaveBeenCalledTimes(2);
  for (let attempt = 0; attempt < 5; attempt++) {
    await act(async () => vi.advanceTimersByTimeAsync(1000));
  }
  expect(submit).toHaveBeenCalledTimes(5); // first pending, then four bounded failures
  expect(vi.getTimerCount()).toBe(0);
});
