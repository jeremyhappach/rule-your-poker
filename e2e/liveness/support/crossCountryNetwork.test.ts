import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrossCountryNetwork, OrderedDeliveryQueue } from './crossCountryNetwork';
import { createSupabaseRuntimeMatcher } from './supabaseRuntime';
import type { BrowserContext, Route } from '@playwright/test';

describe('Supabase runtime discovery target', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('preserves hosted matching and excludes unconfigured loopback traffic', () => {
    const matches = createSupabaseRuntimeMatcher('');
    expect(matches('https://project.supabase.co/auth/v1/token')).toBe(true);
    expect(matches('wss://project.supabase.co/realtime/v1/websocket')).toBe(true);
    expect(matches('http://127.0.0.1:57321/rest/v1/games')).toBe(false);
    expect(matches('https://project.supabase.co.example.test/rest/v1/games')).toBe(false);
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])('matches only the configured %s origin for HTTP and WebSocket', host => {
    const matches = createSupabaseRuntimeMatcher(`http://${host}:57321`);
    expect(matches(`http://${host}:57321/auth/v1/token?grant_type=password`)).toBe(true);
    expect(matches(`ws://${host}:57321/realtime/v1/websocket`)).toBe(true);
    expect(matches(`http://${host}:5177/auth`)).toBe(false);
    expect(matches(`https://${host}:57321/rest/v1/games`)).toBe(false);
    expect(matches('https://project.supabase.co/rest/v1/games')).toBe(false);
    expect(matches('not a URL')).toBe(false);
  });

  it.each(['https://project.supabase.co', 'http://127.0.0.1:57321/rest/v1',
    'http://user:password@localhost:57321', 'http://localhost:57321?key=value',
    'http://localhost:57321#fragment', 'ws://localhost:57321', 'http://localhost.example.test'])
  ('rejects an invalid local override %s', origin => {
    expect(() => createSupabaseRuntimeMatcher(origin)).toThrow();
  });

  it('discovers the actual request key and keeps response-loss injection and WebSocket routing active', async () => {
    vi.stubEnv('PTOWN_E2E_LOCAL_SUPABASE_ORIGIN', 'http://127.0.0.1:57321');
    let handle!: (route: Route) => Promise<void>;
    let socketMatch!: (url: URL) => boolean;
    const context = {
      route: async (_pattern: string, fn: typeof handle) => { handle = fn; },
      routeWebSocket: async (fn: typeof socketMatch) => { socketMatch = fn; },
    } as unknown as BrowserContext;
    const network = new CrossCountryNetwork(); await network.attach(context);
    const pass = vi.fn(); const fetch = vi.fn(); const abort = vi.fn();
    const route = (key?: string) => ({ request: () => ({ url: () => 'http://127.0.0.1:57321/rest/v1/rpc/submit_ante_decision',
      headers: () => key ? { apikey: key } : {} }), continue: pass, fetch, abort }) as unknown as Route;
    await handle(route()); await expect(network.waitForRuntimeConfig(0)).rejects.toThrow('No Supabase runtime request');
    network.loseNextResponse(/submit_ante_decision/); await handle(route('observed-test-key'));
    expect(await network.waitForRuntimeConfig(0)).toEqual({ url: 'http://127.0.0.1:57321', publishableKey: 'observed-test-key' });
    expect(fetch).toHaveBeenCalledOnce(); expect(abort).toHaveBeenCalledWith('failed');
    expect(pass).toHaveBeenCalledOnce(); expect(network.requestCount('/rest/v1/rpc/submit_ante_decision')).toBe(2);
    expect(socketMatch(new URL('ws://127.0.0.1:57321/realtime/v1/websocket'))).toBe(true);
    expect(socketMatch(new URL('ws://127.0.0.1:5177/'))).toBe(false);
  });
});

describe('cross-country ordered WebSocket delivery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves frame order without adding independent delays cumulatively', async () => {
    vi.useFakeTimers();
    const delivered: string[] = [];
    const pending: number[] = [];
    let pendingCount = 0;
    const queue = new OrderedDeliveryQueue((delta) => {
      pendingCount += delta;
      pending.push(pendingCount);
    });

    queue.enqueue(100, () => delivered.push('first'));
    queue.enqueue(10, () => delivered.push('second'));

    await vi.advanceTimersByTimeAsync(99);
    expect(delivered).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await queue.drain();
    expect(delivered).toEqual(['first', 'second']);
    expect(pending).toEqual([1, 2, 1, 0]);
  });

  it('continues delivering later frames when a closed socket rejects one delivery', async () => {
    const delivered: string[] = [];
    const queue = new OrderedDeliveryQueue();

    queue.enqueue(0, () => { throw new Error('socket closed'); });
    queue.enqueue(0, () => delivered.push('replacement-safe'));
    await queue.drain();

    expect(delivered).toEqual(['replacement-safe']);
  });
});
