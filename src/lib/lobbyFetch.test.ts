// @vitest-environment jsdom
/**
 * Lobby games-list bounded-query + request-lifecycle regression gate.
 *
 * Guards against re-introducing:
 *   - broad nested `players(..., profiles(username))` joins across
 *     every historical game (the containment defect);
 *   - request-lifecycle latch bugs where a failure never clears
 *     `loading`, or refresh noise cancels every initial request.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchLobbyGames, LobbyFetchAbortedError, LOBBY_GAMES_HARD_LIMIT } from '@/lib/lobbyFetch';

type Recorded = {
  table: string;
  select: string;
  op: string;
  limit?: number;
  order?: { column: string; ascending?: boolean };
  inColumn?: string;
  inValues?: any[];
  aborted?: boolean;
};

function makeClient(opts: {
  games?: any[];
  gamesError?: any;
  players?: any[];
  playersError?: any;
  snapshots?: any[];
  snapshotsError?: any;
  onGamesAwait?: () => Promise<void>;
} = {}) {
  const recorded: Recorded[] = [];
  const {
    games = [],
    players = [],
    snapshots = [],
    gamesError = null,
    playersError = null,
    snapshotsError = null,
    onGamesAwait,
  } = opts;

  function builder(table: string) {
    const rec: Recorded = { table, select: '', op: '' };
    recorded.push(rec);
    let signal: AbortSignal | undefined;

    const chain: any = {
      select: (cols: string) => {
        rec.select = cols;
        rec.op = 'select';
        return chain;
      },
      order: (column: string, o?: any) => {
        rec.order = { column, ascending: o?.ascending };
        return chain;
      },
      limit: (n: number) => {
        rec.limit = n;
        return chain;
      },
      in: (column: string, values: any[]) => {
        rec.inColumn = column;
        rec.inValues = values;
        return chain;
      },
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return chain;
      },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    };

    async function execute() {
      if (table === 'games' && onGamesAwait) await onGamesAwait();
      if (signal?.aborted) {
        rec.aborted = true;
        return { data: null, error: { name: 'AbortError', message: 'aborted' } };
      }
      if (table === 'games') return { data: games, error: gamesError };
      if (table === 'players') return { data: players, error: playersError };
      if (table === 'session_player_snapshots') return { data: snapshots, error: snapshotsError };
      return { data: null, error: { message: `unexpected table ${table}` } };
    }

    return chain;
  }

  const client = {
    from: (table: string) => builder(table),
  } as any;

  return { client, recorded };
}

describe('fetchLobbyGames — bounded query shape', () => {
  it('uses an explicit narrow column list and hard LIMIT, with no nested players/profiles join on games', async () => {
    const { client, recorded } = makeClient({
      games: [{ id: 'g1', status: 'waiting', created_at: '2025-01-01T00:00:00Z' }],
      players: [],
    });
    await fetchLobbyGames({ userId: 'u1', client });

    const gamesReq = recorded.find((r) => r.table === 'games');
    expect(gamesReq).toBeDefined();
    // Narrow, explicit column list — no wildcard.
    expect(gamesReq!.select).not.toContain('*');
    // No nested players(...) or profiles(...) subselect embedded in games.
    expect(gamesReq!.select).not.toMatch(/players\s*[:(]/);
    expect(gamesReq!.select).not.toMatch(/profiles\s*\(/);
    // Hard bound.
    expect(gamesReq!.limit).toBe(LOBBY_GAMES_HARD_LIMIT);
    expect(gamesReq!.order?.column).toBe('created_at');
  });

  it('fetches players via a single bounded .in(game_id, ids) query — not per historical game', async () => {
    const { client, recorded } = makeClient({
      games: [
        { id: 'a', status: 'session_ended', created_at: '2025-01-02T00:00:00Z' },
        { id: 'b', status: 'waiting', created_at: '2025-01-01T00:00:00Z' },
      ],
      players: [],
    });
    await fetchLobbyGames({ userId: 'u1', client });

    const playersReqs = recorded.filter((r) => r.table === 'players');
    expect(playersReqs).toHaveLength(1);
    expect(playersReqs[0].inColumn).toBe('game_id');
    expect(new Set(playersReqs[0].inValues)).toEqual(new Set(['a', 'b']));
  });

  it('short-circuits when no games are returned — no players/snapshot queries', async () => {
    const { client, recorded } = makeClient({ games: [] });
    const out = await fetchLobbyGames({ userId: 'u1', client });
    expect(out).toEqual([]);
    expect(recorded.filter((r) => r.table === 'players')).toHaveLength(0);
    expect(recorded.filter((r) => r.table === 'session_player_snapshots')).toHaveLength(0);
  });

  it('throws LobbyFetchAbortedError when the signal is aborted mid-flight', async () => {
    const ac = new AbortController();
    const { client } = makeClient({
      games: [{ id: 'g1', status: 'waiting', created_at: 'now' }],
      onGamesAwait: async () => {
        ac.abort();
      },
    });
    await expect(fetchLobbyGames({ userId: 'u1', client, signal: ac.signal })).rejects.toBeInstanceOf(
      LobbyFetchAbortedError,
    );
  });

  it('propagates a real (non-abort) games error so the caller can surface it', async () => {
    const { client } = makeClient({
      gamesError: { code: '42P01', message: 'boom' },
    });
    await expect(fetchLobbyGames({ userId: 'u1', client })).rejects.toMatchObject({ message: 'boom' });
  });
});

/* ------------------------------------------------------------------ */
/* Request-lifecycle guard: mirrors the GameLobby single-flight pattern. */
/* ------------------------------------------------------------------ */
type LifecycleState = {
  games: any[];
  loading: boolean;
  errorShown: number;
};

/**
 * Minimal reproduction of GameLobby.fetchGames' single-flight pattern.
 * Tests target the request owner, not the component tree.
 */
function makeLobbyController(fetchImpl: (opts: { signal: AbortSignal }) => Promise<any[]>) {
  const state: LifecycleState = { games: [{ id: 'last-good' }], loading: false, errorShown: 0 };
  let activeCtrl: AbortController | null = null;
  let refreshQueued = false;
  let lastErrKey: string | null = null;

  async function fetchOnce() {
    if (activeCtrl) {
      refreshQueued = true;
      return;
    }

    const ctrl = new AbortController();
    activeCtrl = ctrl;
    state.loading = true;
    try {
      const rows = await fetchImpl({ signal: ctrl.signal });
      state.games = rows;
      lastErrKey = null;
    } catch (err: any) {
      if (err instanceof LobbyFetchAbortedError || ctrl.signal.aborted) return;
      const key = err?.code || err?.message || 'unknown';
      if (lastErrKey !== key) {
        lastErrKey = key;
        state.errorShown += 1;
      }
    } finally {
      if (activeCtrl !== ctrl) return;
      activeCtrl = null;
      state.loading = false;
      if (refreshQueued) {
        refreshQueued = false;
        void fetchOnce();
      }
    }
  }

  return { state, fetchOnce };
}

describe('GameLobby fetch lifecycle', () => {
  it('clears loading and populates games on a successful initial load', async () => {
    const rows = [{ id: 'g1' }];
    const { state, fetchOnce } = makeLobbyController(async () => rows as any);
    await fetchOnce();
    expect(state.loading).toBe(false);
    expect(state.games).toEqual(rows);
    expect(state.errorShown).toBe(0);
  });

  it('clears loading and retains the last-good list on a real failure', async () => {
    const { state, fetchOnce } = makeLobbyController(async () => {
      throw Object.assign(new Error('network down'), { code: 'NET' });
    });
    await fetchOnce();
    expect(state.loading).toBe(false);
    expect(state.games).toEqual([{ id: 'last-good' }]);
    expect(state.errorShown).toBe(1);
    // Same error again → deduped.
    await fetchOnce();
    expect(state.errorShown).toBe(1);
  });

  it('coalesces overlapping refreshes instead of aborting the initial request', async () => {
    let resolveSlow!: (v: any) => void;
    const slow = new Promise<any>((r) => {
      resolveSlow = r;
    });
    let calls = 0;
    const { state, fetchOnce } = makeLobbyController(async ({ signal }) => {
      calls += 1;
      if (calls === 1) {
        // Slow initial request: a refresh arrives while it is in flight.
        await slow;
        expect(signal.aborted).toBe(false);
        return [{ id: 'INITIAL' }];
      }
      return [{ id: 'FRESH' }];
    });

    const p1 = fetchOnce();
    void fetchOnce();
    expect(calls).toBe(1);

    resolveSlow([{ id: 'INITIAL' }]);
    await p1;
    await Promise.resolve();

    expect(calls).toBe(2);
    expect(state.games).toEqual([{ id: 'FRESH' }]);
    expect(state.errorShown).toBe(0);
    expect(state.loading).toBe(false);
  });
});
