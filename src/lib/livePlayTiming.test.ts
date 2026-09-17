// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), session: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session }, from: () => ({ upsert: mocks.send }) } }));
const identity = { gameId: 'game', roundId: 'round', viewerId: 'viewer', gameType: 'gin-rummy', handNumber: 1 };
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T01:00:00Z')); localStorage.clear();
  mocks.send.mockReset().mockReturnValue({ abortSignal: () => Promise.resolve({ error: null }) });
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'viewer' } } } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('delegates exactly once, stores only allowlisted scalars, and records server timings without awaiting delivery', async () => {
  const t = await import('./livePlayTiming'); t.setLiveTimingContext(identity);
  const response = new Response('{}', { headers: { 'x-ptown-replay-ms': '4.5' } });
  const fetcher = vi.fn().mockResolvedValue(response);
  expect(await t.withLiveTiming(fetcher)('https://project.supabase.co/rest/v1/rpc/gin_rummy_apply_action', { method: 'POST', body: JSON.stringify({ _round_id: 'round', _action: 'discard', _expected_action_count: 4, _card: { rank: 'SECRET', suit: 'SECRET' } }) })).toBe(response);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled();
  t.recordGinResponse('round', 5, 'applied'); t.recordGinTableCommit(identity, 5);
  await vi.advanceTimersByTimeAsync(15_100);
  const payload = mocks.send.mock.calls.flatMap(c => c[0].payload.samples);
  expect(payload.some(s => s.kind === 'gin-rpc' && s.replayMs === 4.5)).toBe(true);
  expect(payload.some(s => s.kind === 'gin-response')).toBe(true);
  expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('SECRET');
});
it('preserves original failures without retrying gameplay', async () => {
  const t = await import('./livePlayTiming'); t.setLiveTimingContext(identity);
  const error = new Error('offline'); const fetcher = vi.fn().mockRejectedValue(error);
  await expect(t.withLiveTiming(fetcher)('https://x/rest/v1/rpc/gin_rummy_settle_game')).rejects.toBe(error);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('caps the batch, expires capture and distinguishes missing server timing from zero', async () => {
  const t = await import('./livePlayTiming');
  for (let i = 0; i < 500; i++) t.recordCardScan(identity, 1);
  await vi.advanceTimersByTimeAsync(15_001);
  expect(mocks.send.mock.calls[0][0].payload.samples.length).toBe(128);
  expect(mocks.send.mock.calls[0][0].payload.dropped).toBeGreaterThan(0);
  expect(t.parseReplayTiming(new Headers())).toBeNull();
  vi.setSystemTime(t.LIVE_TIMING_UNTIL + 1); expect(t.liveTimingEnabled()).toBe(false);
  mocks.send.mockClear(); t.recordCardScan(identity, 1); await vi.advanceTimersByTimeAsync(16_000); expect(mocks.send).not.toHaveBeenCalled();
});
it('retains failed batches with a stable UUID and never uploads another viewer', async () => {
  const t = await import('./livePlayTiming'); mocks.send.mockReturnValue({ abortSignal: () => Promise.resolve({ error: { message: 'offline' } }) });
  t.recordCardScan(identity, 1); await vi.advanceTimersByTimeAsync(15_001);
  const queued = JSON.parse(localStorage.getItem(t.LIVE_TIMING_KEY)!); expect(queued).toHaveLength(1);
  const id = queued[0].id; await t.deliverLiveTiming(); expect(mocks.send.mock.calls[1][0].id).toBe(id);
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'different' } } } });
  mocks.send.mockClear(); await t.deliverLiveTiming(); expect(mocks.send).not.toHaveBeenCalled();
});
