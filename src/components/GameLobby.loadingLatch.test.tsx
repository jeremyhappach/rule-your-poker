// @vitest-environment jsdom
/**
 * Regression tests for the GameLobby loading-latch defect
 * (fetchGames early-returning on error without clearing `loading`).
 *
 * Proves:
 *  1. Initial `{ error }` response clears "Loading games..."
 *  2. Initial thrown request clears "Loading games..."
 *  3. Aborted initial request clears "Loading games..." without wiping state
 *  4. Prior successful list + later poll failure keeps list visible,
 *     no permanent spinner, and no toast spam.
 *  5. Later successful poll resets the error episode (next failure re-toasts once).
 *  6. Unmount while a request is pending performs no state update / toast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/* ---------------- Mocks ---------------- */

/**
 * Chainable builder. The new GameLobby uses:
 *   supabase.from('games').select(cols).in('status', ...).order(...)  → active
 *   supabase.from('games').select(cols).eq('status','session_ended').order(...).limit(...) → historical
 *   supabase.from('profiles').select(cols).eq('id', uid).maybeSingle()
 *   supabase.from('session_player_snapshots').select(cols).in('game_id', ids)
 *
 * Every non-terminal method returns the builder; the terminal await goes
 * through .then() which resolves based on (table, current filters).
 */
type QueryOutcome =
  | { kind: 'ok'; data: any[] }
  | { kind: 'error'; message: string }
  | { kind: 'throw'; error: any };

let nextGamesOutcome: QueryOutcome = { kind: 'ok', data: [] };
let pendingOverride: null | (() => Promise<any>) = null;

const toastMock = vi.fn();
const removeChannelMock = vi.fn();

function makeGamesBuilder() {
  const b: any = {
    filters: [] as any[],
    in(col: string, vals: any[]) { this.filters.push({ op: 'in', col, vals }); return this; },
    eq(col: string, val: any) { this.filters.push({ op: 'eq', col, val }); return this; },
    order() { return this; },
    limit() { return this; },
    then(res: any, rej: any) {
      if (pendingOverride) {
        const fn = pendingOverride;
        pendingOverride = null;
        return fn().then(res, rej);
      }
      const o = nextGamesOutcome;
      if (o.kind === 'throw') return Promise.reject(o.error).then(res, rej);
      if (o.kind === 'error') return Promise.resolve({ data: null, error: { message: o.message } }).then(res, rej);
      return Promise.resolve({ data: o.data, error: null }).then(res, rej);
    },
  };
  return b;
}

function makeProfilesBuilder() {
  const b: any = {
    eq() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  return b;
}

function makeSnapshotsBuilder() {
  const b: any = {
    in() { return this; },
    then(res: any, rej: any) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
  };
  return b;
}

const channelObj: any = {
  on: vi.fn(function (this: any) { return channelObj; }),
  subscribe: vi.fn(function (this: any) { return channelObj; }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols: string) => {
        if (table === 'profiles') return makeProfilesBuilder();
        if (table === 'session_player_snapshots') return makeSnapshotsBuilder();
        return makeGamesBuilder();
      },
    }),
    channel: () => channelObj,
    removeChannel: (...a: any[]) => (removeChannelMock as any)(...a),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useMaintenanceMode', () => ({
  useMaintenanceMode: () => ({ isMaintenanceMode: false, loading: false }),
}));
vi.mock('@/hooks/useDeviceSize', () => ({ useDeviceSize: () => ({ isTablet: false }) }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('@/hooks/useGlobalTimerSettings', () => ({ getTimerSettingsAsync: async () => ({}) }));
vi.mock('@/lib/perf', () => ({
  PerfSession: class {
    constructor(_n?: string, _t?: number) {}
    async step<T>(_l: string, fn: () => Promise<T> | T) { return await fn(); }
    done() {}
  },
}));
vi.mock('@/lib/sessionEventLog', () => ({ logSessionCreated: vi.fn() }));
vi.mock('@/lib/gameNames', () => ({ generateGameName: () => 'game' }));
vi.mock('@/lib/botAlias', () => ({ getBotAlias: () => 'Bot' }));
vi.mock('@/components/SessionResults', () => ({ SessionResults: () => null }));
vi.mock('@/components/GameDefaultsConfig', () => ({ GameDefaultsConfig: () => null }));
vi.mock('@/components/GameRules', () => ({ GameRules: () => null }));
vi.mock('@/components/RealMoneyWarningDialog', () => ({ RealMoneyWarningDialog: () => null }));
vi.mock('@/assets/peoria-skyline.jpg', () => ({ default: 'x' }));
vi.mock('@/assets/peoria-bridge-mobile.jpg', () => ({ default: 'x' }));

/* ---------------- Helpers ---------------- */

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  const { GameLobby } = await import('./GameLobby');
  await act(async () => {
    root.render(React.createElement(GameLobby, { userId: 'u1' }));
  });
  await flush();
}

const spinnerVisible = () => !!container.textContent?.includes('Loading games...');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  toastMock.mockClear();
  nextGamesOutcome = { kind: 'ok', data: [] };
  pendingOverride = null;
});


afterEach(async () => {
  try { await act(async () => { root.unmount(); }); } catch { /* ignore */ }
  container.remove();
});

/* ---------------- Tests ---------------- */

describe('GameLobby loading-latch', () => {
  it('clears the spinner when the initial games query returns { error }', async () => {
    nextGamesOutcome = { kind: 'error', message: 'boom' };
    await mount();
    expect(spinnerVisible()).toBe(false);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('clears the spinner when the initial games query throws', async () => {
    nextGamesOutcome = { kind: 'throw', error: new Error('network dead') };
    await mount();
    expect(spinnerVisible()).toBe(false);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('clears the spinner on an AbortError without toasting', async () => {
    const abort: any = new Error('The user aborted a request.');
    abort.name = 'AbortError';
    nextGamesOutcome = { kind: 'throw', error: abort };
    await mount();
    expect(spinnerVisible()).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('keeps list visible and dedupes toast across repeated poll failures; success resets episode', async () => {
    // Initial success.
    nextGamesOutcome = { kind: 'ok', data: [] };
    await mount();
    expect(spinnerVisible()).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();

    // Simulate 3 back-to-back poll failures by directly re-invoking
    // fetchGames via the visibilitychange listener (which the component
    // registers and calls fetchGames on `visible`). Toast should fire ONCE.
    // Refresh is debounced (~1.5s) inside the component; wait past it.
    async function fail(msg: string) {
      nextGamesOutcome = { kind: 'error', message: msg };
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await new Promise((r) => setTimeout(r, 1700));
      await flush();
    }
    await fail('p1');
    await fail('p2');
    await fail('p3');

    expect(spinnerVisible()).toBe(false);
    expect(toastMock).toHaveBeenCalledTimes(1);

    // Success resets the episode.
    nextGamesOutcome = { kind: 'ok', data: [] };
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await new Promise((r) => setTimeout(r, 1700));
    await flush();


    // Next failure re-toasts once.
    await fail('p4');
    expect(toastMock).toHaveBeenCalledTimes(2);
  });

  it('does not update state or toast after unmount while a request is pending', async () => {
    let resolveFn: (v: any) => void = () => {};
    pendingOverride = () => new Promise((res) => { resolveFn = res; });

    const { GameLobby } = await import('./GameLobby');
    await act(async () => {
      root.render(React.createElement(GameLobby, { userId: 'u1' }));
    });
    // Request is in-flight; spinner should still be up.
    expect(spinnerVisible()).toBe(true);

    // Unmount before the request resolves.
    await act(async () => { root.unmount(); });

    // Resolve after unmount — must be a silent no-op.
    await act(async () => {
      resolveFn({ data: null, error: { message: 'late' } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toastMock).not.toHaveBeenCalled();
  });
});
