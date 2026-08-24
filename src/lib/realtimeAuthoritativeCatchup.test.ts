import { describe, expect, it, vi } from 'vitest';
import {
  createLatestAuthoritativeLoader,
  dispatchAuthoritativeRecoverySnapshot,
  handleAuthoritativeRealtimeStatus,
  isAuthoritativeRealtimeUnavailable,
  subscribeAuthoritativeRecoverySnapshot,
} from './realtimeAuthoritativeCatchup';

describe('authoritative Realtime catch-up', () => {
  it('runs an exact snapshot on every initial or reconnect SUBSCRIBED edge', async () => {
    const catchUp = vi.fn(async () => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    handleAuthoritativeRealtimeStatus('SUBSCRIBED', undefined, { source: 'test', catchUp });
    handleAuthoritativeRealtimeStatus('CHANNEL_ERROR', new Error('offline'), { source: 'test', catchUp });
    handleAuthoritativeRealtimeStatus('SUBSCRIBED', undefined, { source: 'test', catchUp });
    await Promise.resolve();

    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(catchUp).toHaveBeenNthCalledWith(1, 'realtime-subscribed-catchup');
    expect(catchUp).toHaveBeenNthCalledWith(2, 'realtime-subscribed-catchup');
    warn.mockRestore();
  });

  it('classifies every channel-loss status, including CLOSED', () => {
    expect(isAuthoritativeRealtimeUnavailable('CHANNEL_ERROR')).toBe(true);
    expect(isAuthoritativeRealtimeUnavailable('TIMED_OUT')).toBe(true);
    expect(isAuthoritativeRealtimeUnavailable('CLOSED')).toBe(true);
    expect(isAuthoritativeRealtimeUnavailable('SUBSCRIBED')).toBe(false);
  });

  it('allows only the newest authoritative request to apply', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const first = new Promise<string>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<string>((resolve) => { resolveSecond = resolve; });
    const loads = [first, second];
    const applied: string[] = [];
    const loader = createLatestAuthoritativeLoader({
      load: async () => loads.shift()!,
      apply: (value) => applied.push(value),
    });

    const firstRefresh = loader.refresh('initial');
    const secondRefresh = loader.refresh('reconnect');
    resolveSecond('newest');
    await secondRefresh;
    resolveFirst('stale');
    await firstRefresh;

    expect(applied).toEqual(['newest']);
  });

  it('keeps an older successful snapshot when the newer request fails', async () => {
    let resolveFirst!: (value: string) => void;
    let rejectSecond!: (error: Error) => void;
    const first = new Promise<string>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<string>((_resolve, reject) => { rejectSecond = reject; });
    const loads = [first, second];
    const applied: string[] = [];
    const loader = createLatestAuthoritativeLoader({
      load: async () => loads.shift()!,
      apply: (value) => applied.push(value),
    });

    const firstRefresh = loader.refresh('cold-mount');
    const secondRefresh = loader.refresh('reconnect');
    rejectSecond(new Error('transient reconnect failure'));
    expect(await secondRefresh).toBe(false);
    resolveFirst('valid-cold-snapshot');
    expect(await firstRefresh).toBe(true);

    expect(applied).toEqual(['valid-cold-snapshot']);
  });

  it('invalidates an in-flight snapshot when a newer Realtime payload arrives', async () => {
    let resolveLoad!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { resolveLoad = resolve; });
    const apply = vi.fn();
    const loader = createLatestAuthoritativeLoader({ load: async () => pending, apply });

    const refresh = loader.refresh('initial');
    loader.invalidate();
    resolveLoad('older-than-realtime');
    expect(await refresh).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('fans a successful parent recovery snapshot out to supplemental owners', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const listener = vi.fn();
    const unsubscribe = subscribeAuthoritativeRecoverySnapshot(listener);

    dispatchAuthoritativeRecoverySnapshot('realtime_fallback');
    expect(listener).toHaveBeenCalledWith('realtime_fallback');

    unsubscribe();
    dispatchAuthoritativeRecoverySnapshot('focus');
    expect(listener).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
