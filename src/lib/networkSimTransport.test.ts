import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveChaosProfile, startChaosSession, stopChaosSession } from './networkSimChaos';
import { updateNetworkSimRuntime } from './networkSimRuntime';
import { NetworkSimWebSocket, simulatedSupabaseFetch } from './networkSimTransport';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  protocol = '';
  extensions = '';
  readyState = FakeWebSocket.CONNECTING;
  bufferedAmount = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  send = vi.fn();
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(Object.assign(new Event('close'), { code: code ?? 1000, reason: reason ?? '', wasClean: true }) as CloseEvent);
  });

  constructor(url: string | URL) {
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
  }
}

function offlinePhase() {
  const phase = getActiveChaosProfile()?.phases.find((candidate) => candidate.kind === 'offline');
  if (!phase) throw new Error('Chaos profile must include an offline phase');
  return phase;
}

function responseLossPhase() {
  const phase = getActiveChaosProfile()?.phases.find((candidate) => candidate.kind === 'response-loss');
  if (!phase) throw new Error('Chaos profile must include a response-loss phase');
  return phase;
}

describe('Supabase network simulation transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T02:00:00Z'));
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    updateNetworkSimRuntime({ mode: 'cross_country_chaos' });
    startChaosSession({ seed: 5150, clientKey: 'transport-client', role: 'host' });
  });

  afterEach(() => {
    stopChaosSession();
    updateNetworkSimRuntime({ mode: 'off' });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('closes the actual Realtime socket offline and defers reconnect attempts until recovery', async () => {
    const wrapped = new NetworkSimWebSocket('wss://example.test/realtime/v1');
    const closeSpy = vi.fn();
    wrapped.onclose = closeSpy;
    expect(FakeWebSocket.instances).toHaveLength(1);

    const offline = offlinePhase();
    await vi.advanceTimersByTimeAsync(offline.startMs);

    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledWith(4001, 'cross-country-chaos-offline');
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const deferred = new NetworkSimWebSocket('wss://example.test/realtime/v1');
    expect(deferred.readyState).toBe(NetworkSimWebSocket.CONNECTING);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(offline.endMs - offline.startMs);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('fails offline requests before send while leaving the control path available', async () => {
    const nativeFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    await vi.advanceTimersByTimeAsync(offlinePhase().startMs);

    await expect(simulatedSupabaseFetch('https://example.test/rest/v1/game_rounds', { method: 'POST' })).rejects.toThrow(
      'simulated request failure before send',
    );
    expect(nativeFetch).not.toHaveBeenCalled();

    await simulatedSupabaseFetch('https://example.test/rest/v1/profiles?id=eq.test', { method: 'PATCH' });
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('delays a write but delegates it exactly once', async () => {
    const nativeFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);

    const request = simulatedSupabaseFetch('https://example.test/rest/v1/game_rounds', { method: 'POST' });
    expect(nativeFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await request;

    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('simulates an ambiguous committed write by losing only its response', async () => {
    const nativeFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', nativeFetch);
    const phase = responseLossPhase();
    await vi.advanceTimersByTimeAsync(phase.startMs);

    const request = simulatedSupabaseFetch('https://example.test/rest/v1/rounds', { method: 'PATCH' });
    const assertion = expect(request).rejects.toThrow('response loss after send');
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;

    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('retains WebSocket frame order while applying independent jitter decisions', async () => {
    const wrapped = new NetworkSimWebSocket('wss://example.test/realtime/v1');
    const delivered: string[] = [];
    wrapped.onmessage = (event) => delivered.push(event.data as string);

    FakeWebSocket.instances[0].onmessage?.(Object.assign(new Event('message'), { data: 'first' }) as MessageEvent);
    FakeWebSocket.instances[0].onmessage?.(Object.assign(new Event('message'), { data: 'second' }) as MessageEvent);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(delivered).toEqual(['first', 'second']);
  });
});
