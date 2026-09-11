// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLobbyGames } from './useLobbyGames';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), toast: vi.fn(), removeChannel: vi.fn(),
  changes: new Map<string, () => void>(), status: (_status: string) => {},
}));
vi.mock('@/lib/lobbyFetch', () => ({
  fetchLobbyGames: mocks.fetch, LobbyFetchAbortedError: class extends Error {},
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/perf', () => ({ PerfSession: class {
  step(_name: string, fn: () => unknown) { return fn(); }
  done() {}
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: () => {
    const channel = {
      on: (_type: string, filter: { table: string }, callback: () => void) => {
        mocks.changes.set(filter.table, callback);
        return channel;
      },
      subscribe: (callback: (status: string) => void) => { mocks.status = callback; return channel; },
    };
    return channel;
  },
  removeChannel: mocks.removeChannel,
} }));

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const signal = async (fn: () => void) => { act(fn); await flush(); };
function visibility(state: string) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('mounted lobby refresh ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.changes.clear();
    mocks.fetch.mockReset().mockResolvedValue([{ id: 'last-good' }]);
    visibility('visible');
  });
  afterEach(() => vi.useRealTimers());

  it('loads immediately, catches up on subscribe, and reconciles healthy idle once a minute', async () => {
    const { result, unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    expect(result.current.loading).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await signal(() => mocks.status('SUBSCRIBED'));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await advance(59_999);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('refreshes every contributing table and collapses synchronous invalidations', async () => {
    const { unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    expect([...mocks.changes.keys()]).toEqual(['games', 'players', 'session_player_snapshots', 'profiles']);
    for (const callback of mocks.changes.values()) {
      const before = mocks.fetch.mock.calls.length;
      await signal(callback);
      expect(mocks.fetch).toHaveBeenCalledTimes(before + 1);
    }
    const before = mocks.fetch.mock.calls.length;
    await signal(() => mocks.changes.forEach(callback => callback()));
    expect(mocks.fetch).toHaveBeenCalledTimes(before + 1);
    unmount();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('keeps 10-second fallback for %s and catches up on rejoin', async status => {
    const { unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    await advance(10_000); // not subscribed yet
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await signal(() => mocks.status('SUBSCRIBED'));
    await signal(() => mocks.status(status));
    const before = mocks.fetch.mock.calls.length;
    await advance(10_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(before + 1);
    await signal(() => mocks.status('SUBSCRIBED'));
    expect(mocks.fetch).toHaveBeenCalledTimes(before + 2);
    unmount();
  });

  it('does no hidden reads and refreshes on return, focus, and network restoration', async () => {
    const { unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    await signal(() => visibility('hidden'));
    await signal(() => mocks.status('SUBSCRIBED'));
    await signal(() => mocks.changes.get('players')!());
    await signal(() => window.dispatchEvent(new Event('focus')));
    await advance(120_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await signal(() => { visibility('visible'); window.dispatchEvent(new Event('focus')); });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await signal(() => window.dispatchEvent(new Event('online')));
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('keeps one read in flight and follows a mid-read event with a fresh DB read', async () => {
    let resolve!: (rows: unknown[]) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { result, unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    await signal(() => mocks.changes.forEach(callback => callback()));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0].signal.aborted).toBe(false);
    await signal(() => resolve([{ id: 'initial' }]));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.games).toEqual([{ id: 'last-good' }]);
    unmount();
  });

  it('retains the last list and dedupes errors while retrying failed reads at 10 seconds', async () => {
    const { result, unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    await signal(() => mocks.status('SUBSCRIBED'));
    mocks.fetch.mockRejectedValue(new Error('offline'));
    await signal(result.current.refresh);
    await advance(10_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(result.current.games).toEqual([{ id: 'last-good' }]);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValue([{ id: 'recovered' }]);
    await advance(10_000);
    expect(result.current.games).toEqual([{ id: 'recovered' }]);
    await advance(59_999);
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
    unmount();
  });

  it('aborts a wedged read at 12 seconds and clears the initial spinner before retrying', async () => {
    mocks.fetch.mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const { result, unmount } = renderHook(() => useLobbyGames('u1'));
    await flush();
    await advance(12_000);
    expect(result.current.loading).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lobby connection timed out' }));
    await advance(10_000);
    expect(result.current.games).toEqual([{ id: 'last-good' }]);
    unmount();
  });

  it('retires requests, subscriptions and timers across account changes and unmount', async () => {
    let resolve!: (rows: unknown[]) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { result, rerender, unmount } = renderHook(({ user }) => useLobbyGames(user), { initialProps: { user: 'u1' } });
    await flush();
    const oldSignal = mocks.fetch.mock.calls[0][0].signal;
    rerender({ user: 'u2' });
    await flush();
    await signal(() => resolve([{ id: 'retired-user' }]));
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.games).toEqual([{ id: 'last-good' }]);
    expect(mocks.fetch.mock.calls[1][0].userId).toBe('u2');
    unmount();
    await signal(() => window.dispatchEvent(new Event('focus')));
    await advance(120_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(2);
  });
});
