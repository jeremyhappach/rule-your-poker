// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { audioHarness } from '@/lib/audio/audioTestHarness';
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/audio/platformAudio', () => ({ platformAudio: mock }));
import { useRun21Bell } from './useRun21Bell';

let h: ReturnType<typeof audioHarness>;
beforeEach(async () => {
  vi.useFakeTimers(); sessionStorage.clear(); h = audioHarness();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  mock.request.mockImplementation(event => h.manager.request(event));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
});
afterEach(() => { cleanup(); h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); mock.request.mockReset(); });

it('rings twice for Round 1 after pregame unlock, survives strict remounts, and rings for each next identity', () => {
  h.manager.unlock();
  const first = renderHook(({id}) => useRun21Bell('user', id, 2500), {initialProps: {id: 'session:game:hand:round1:player1'}, wrapper: StrictMode});
  expect(h.starts()).toHaveLength(8);
  first.rerender({id: 'session:game:hand:round1:player1'}); first.unmount();
  const second = renderHook(({id}) => useRun21Bell('user', id, 2500), {initialProps: {id: 'session:game:hand:round1:player1'}});
  expect(h.starts()).toHaveLength(8);
  for (const id of ['session:game:hand:round1:player2','session:game:hand:round2:player1','session:game:hand:round3:player1']) second.rerender({id});
  expect(h.starts()).toHaveLength(32); expect(h.createContext).toHaveBeenCalledTimes(1);
});

it('withdraws a still-blocked cue when the intro disappears', () => {
  h.ctx.state = 'suspended';
  const hook = renderHook(({id}: {id: string | null}) => useRun21Bell('user', id, 2500), {initialProps: {id: 'round1' as string | null}});
  hook.rerender({id: null}); h.state('running'); expect(h.starts()).toEqual([]);
});

it('repeated snapshots do not extend an expired window', () => {
  h.ctx.state = 'suspended';
  const hook = renderHook(({remaining}) => useRun21Bell('user', 'round1', remaining), {initialProps: {remaining: 2500}});
  vi.advanceTimersByTime(2400); hook.rerender({remaining: 2500});
  vi.advanceTimersByTime(101); h.state('running'); expect(h.starts()).toEqual([]);
});

it('a spectator first observing an eligible round uses the same two-strike path', () => {
  renderHook(() => useRun21Bell('user', 'session:game:hand:round1:another-player', 2000));
  expect(h.starts()).toEqual([10,10,10,10,10.32,10.32,10.32,10.32]);
});
