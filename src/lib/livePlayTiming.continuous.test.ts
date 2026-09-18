// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'viewer' } } } }) },
  from: () => ({ upsert: mocks.send }),
} }));
const context = { gameId: 'game', roundId: 'round', viewerId: 'viewer', gameType: 'gin-rummy', handNumber: 1 };
const url = 'https://x/rest/v1/rpc/gin_rummy_apply_action';
const init = { body: JSON.stringify({ _action: 'discard', _expected_action_count: 0, _round_id: 'round' }) };
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2027-01-01')); localStorage.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  mocks.send.mockReset().mockReturnValue({ abortSignal: async () => ({ error: null }) });
});
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); });
const rows = () => mocks.send.mock.calls.flatMap(c => c[0].payload.samples);
it('samples normal requests and keeps slow/error/lifecycle observations separately', async () => {
  const t = await import('./livePlayTiming'); t.setLiveTimingContext(context);
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  const fetch = t.withLiveTiming(fetcher);
  await fetch(url, init); // Not selected: no response/paint telemetry either.
  t.recordGinResponse('round', 1, 'applied'); t.recordGinTableCommit(context, 1);
  vi.mocked(Math.random).mockReturnValueOnce(0.1);
  await fetch(url, init);
  fetcher.mockImplementationOnce(async () => { vi.setSystemTime(Date.now() + 1100); return new Response('{}'); });
  await fetch(url, init);
  fetcher.mockResolvedValueOnce(new Response('{}', { status: 500 })); await fetch(url, init);
  await fetch(url, { body: JSON.stringify({ _action: 'knock' }) });
  await vi.advanceTimersByTimeAsync(60_001);
  expect(rows().filter(s => s.kind === 'gin-rpc').map(s => s.sampleClass)).toEqual(['random', 'slow', 'error', 'lifecycle']);
  expect(rows().filter(s => s.kind === 'gin-response' || s.kind === 'gin-paint-opportunity')).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it('keeps hand changes in memory and writes bounded storage only when flushing', async () => {
  const t = await import('./livePlayTiming'); const write = vi.spyOn(Storage.prototype, 'setItem');
  for (let hand = 1; hand <= 40; hand++) t.setLiveTimingContext({ ...context, roundId: `round-${hand}`, handNumber: hand });
  t.clearLiveTimingContext({ ...context, roundId: 'round-40' });
  expect(write.mock.calls.filter(c => c[0] === t.LIVE_TIMING_KEY)).toHaveLength(0);
  mocks.send.mockReturnValue({ abortSignal: async () => ({ error: 'offline' }) });
  await vi.advanceTimersByTimeAsync(60_001);
  expect(JSON.parse(localStorage.getItem(t.LIVE_TIMING_KEY)!)).toHaveLength(8);
  expect(mocks.send).toHaveBeenCalledTimes(2);
});
it('throttles ordinary scan samples but retains a slow scan', async () => {
  const t = await import('./livePlayTiming');
  for (let i = 0; i < 100; i++) t.recordCardScan(context, 1);
  t.recordCardScan(context, 12);
  await vi.advanceTimersByTimeAsync(60_001);
  expect(rows().filter(s => s.kind === 'card-scan').map(s => s.sampleClass)).toEqual(['periodic', 'slow']);
});
it('does not attach timing to another game or read RPCs', async () => {
  const t = await import('./livePlayTiming'); const native = vi.fn().mockResolvedValue(new Response('{}'));
  t.setLiveTimingContext({ ...context, gameType: 'holm' }); await t.withLiveTiming(native)(url, init);
  t.setLiveTimingContext(context); await t.withLiveTiming(native)('https://x/rest/v1/rpc/gin_rummy_get_state');
  expect(native.mock.calls.every(c => c.length === 2)).toBe(true);
  await vi.advanceTimersByTimeAsync(60_001);
  expect(rows().some(s => s.kind === 'gin-rpc')).toBe(false);
});
