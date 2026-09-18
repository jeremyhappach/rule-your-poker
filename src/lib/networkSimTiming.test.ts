// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), decision: vi.fn(), status: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'viewer' } } } }) },
  from: () => ({ upsert: mocks.send }),
} }));
vi.mock('./networkSimChaos', () => ({ getChaosRequestDecision: mocks.decision,
  getChaosStatus: mocks.status, recordChaosTransportEvent: vi.fn(),
  getChaosRealtimeDecision: vi.fn(), subscribeChaosStatus: vi.fn(),
}));
const identity = { gameId: 'game', roundId: 'round', viewerId: 'viewer', gameType: 'gin-rummy', handNumber: 1 };
const url = 'https://example.test/rest/v1/rpc/gin_rummy_apply_action';
const init = { method: 'POST', body: JSON.stringify({ _action: 'discard', _round_id: 'round', _card: { rank: 'PRIVATE', suit: 'PRIVATE' } }) };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T21:00:00Z'));
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.spyOn(Math, 'random').mockReturnValue(0);
  localStorage.clear(); mocks.send.mockReset().mockReturnValue({ abortSignal: async () => ({ error: null }) });
  mocks.status.mockReturnValue({ disconnected: false });
  mocks.decision.mockReturnValue({ delayMs: 5000, phaseKind: 'radio-stall', failBeforeSend: false, loseResponseAfterSend: false });
});
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup(mode: 'off' | 'cross_country_chaos' = 'cross_country_chaos') {
  const timing = await import('./livePlayTiming');
  const runtime = await import('./networkSimRuntime'); runtime.updateNetworkSimRuntime({ mode });
  timing.setLiveTimingContext(identity);
  return { timing, runtime, fetch: (await import('./networkSimTransport')).simulatedSupabaseFetch };
}
async function sample() {
  await vi.advanceTimersByTimeAsync(60_001);
  return mocks.send.mock.calls.flatMap(c => c[0].payload.samples).filter(s => s.kind === 'gin-rpc');
}
it('separates a five-second injected wait from a 100 ms native fetch and freezes the dispatch mode', async () => {
  const t = await setup(); const response = new Response('{}', { headers: { 'x-ptown-replay-ms': '3.3' } });
  const native = vi.fn(async () => { await sleep(100); return response; }); vi.stubGlobal('fetch', native);
  const request = t.fetch(url, init);
  await vi.advanceTimersByTimeAsync(2000); t.runtime.updateNetworkSimRuntime({ mode: 'off' });
  expect(native).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(3100);
  expect(await request).toBe(response); expect(native).toHaveBeenCalledExactlyOnceWith(url, init);
  const [s] = await sample();
  expect(s).toMatchObject({ transportTimingVersion: 1, networkSimMode: 'cross_country_chaos', chaosPhase: 'radio-stall',
    injectedDelayPlannedMs: 5000, injectedDelayMs: 5000, nativeFetchMs: 100, responseHeadersMs: 5100, replayMs: 3.3, simulationFailure: null });
  expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('PRIVATE');
});
it('measures ordinary native latency with simulation off', async () => {
  const t = await setup('off'); const native = vi.fn(async () => { await sleep(80); return new Response('{}'); }); vi.stubGlobal('fetch', native);
  const request = t.fetch(url, init); await vi.advanceTimersByTimeAsync(80); await request;
  expect(mocks.decision).not.toHaveBeenCalled();
  expect((await sample())[0]).toMatchObject({ networkSimMode: 'off', injectedDelayMs: 0, injectedDelayPlannedMs: 0, nativeFetchMs: 80, responseHeadersMs: 80, replayMs: null });
});
it('keeps concurrent observations independent', async () => {
  const t = await setup();
  mocks.decision.mockReturnValueOnce({ delayMs: 300, phaseKind: 'healthy' }).mockReturnValueOnce({ delayMs: 1000, phaseKind: 'jitter-burst' });
  const native = vi.fn(async () => { await sleep(50); return new Response('{}'); }); vi.stubGlobal('fetch', native);
  const requests = [t.fetch(url, init), t.fetch(url, init)]; await vi.advanceTimersByTimeAsync(1050); await Promise.all(requests);
  const samples = await sample(); expect(samples.map(s => s.injectedDelayMs)).toEqual([300, 1000]);
  expect(samples.map(s => s.nativeFetchMs)).toEqual([50, 50]); expect(new Set(samples.map(s => s.id)).size).toBe(2);
  expect(native).toHaveBeenCalledTimes(2);
});
it('records a simulated pre-send failure with no invented native timing', async () => {
  const t = await setup(); mocks.decision.mockReturnValue({ delayMs: 0, phaseKind: 'offline', failBeforeSend: true });
  const native = vi.fn(); vi.stubGlobal('fetch', native);
  await expect(t.fetch(url, init)).rejects.toThrow('before send'); expect(native).not.toHaveBeenCalled();
  expect((await sample())[0]).toMatchObject({ failed: true, simulationFailure: 'before-send', nativeFetchMs: null, injectedDelayMs: 0 });
});
it('retains native timing after simulated response loss without retrying the committed write', async () => {
  const t = await setup(); mocks.decision.mockReturnValue({ delayMs: 100, phaseKind: 'response-loss', loseResponseAfterSend: true });
  const native = vi.fn(async () => { await sleep(60); return new Response('{}'); }); vi.stubGlobal('fetch', native);
  const assertion = expect(t.fetch(url, init)).rejects.toThrow('response loss after send');
  await vi.advanceTimersByTimeAsync(160); await assertion;
  expect(native).toHaveBeenCalledTimes(1);
  expect((await sample())[0]).toMatchObject({ failed: true, simulationFailure: 'response-loss', nativeFetchMs: 60, injectedDelayMs: 100 });
});
it('measures a native failure and rethrows the same error without retry', async () => {
  const t = await setup('off'); const error = new TypeError('network unavailable');
  const native = vi.fn(async () => { await sleep(120); throw error; }); vi.stubGlobal('fetch', native);
  const assertion = expect(t.fetch(url, init)).rejects.toBe(error); await vi.advanceTimersByTimeAsync(120); await assertion;
  expect(native).toHaveBeenCalledTimes(1);
  expect((await sample())[0]).toMatchObject({ failed: true, simulationFailure: null, nativeFetchMs: 120, injectedDelayMs: 0 });
});
it('records actual elapsed wait when aborted, preserves the abort, and never sends', async () => {
  const t = await setup(); const native = vi.fn(); vi.stubGlobal('fetch', native); const abort = new AbortController();
  const error = new DOMException('Stopped', 'AbortError');
  const assertion = expect(t.fetch(url, { ...init, signal: abort.signal })).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(40); abort.abort(error); await assertion; expect(native).not.toHaveBeenCalled();
  expect((await sample())[0]).toMatchObject({ failed: true, injectedDelayPlannedMs: 5000, injectedDelayMs: 40, nativeFetchMs: null });
});
it('continues observation after the old expiry while delegating the gameplay request once', async () => {
  const t = await setup('off'); vi.setSystemTime(new Date('2027-01-01'));
  const response = new Response('{}'); const native = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', native);
  expect(await t.fetch(url, init)).toBe(response); expect(native).toHaveBeenCalledExactlyOnceWith(url, init);
  expect(await sample()).toHaveLength(1);
});
