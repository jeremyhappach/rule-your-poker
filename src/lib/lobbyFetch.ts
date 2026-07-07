/**
 * Lobby games-list fetch helper.
 *
 * Bounded, deterministic replacement for the previous broad
 * `games.select('*, players:players(..., profiles(username)))')` query
 * that fanned into every historical game's players+profiles rows and
 * caused lobby saturation / "Failed to load games" toasts.
 *
 * Bounded shape:
 *   1. `games` — explicit column list, hard `LIMIT 50`, newest first.
 *   2. `session_player_snapshots` — only for the ended `game_id`s
 *      returned by step 1 (for the historical player count).
 *   3. `players` — one `.in('game_id', <returned ids>)` query with
 *      only the fields needed to render active-game standings and
 *      resolve host identity. Bounded by the games LIMIT above.
 *
 * No unbounded nested joins across all historical games.
 * No chat / operation / diagnostic / game-state data.
 * No polling, retries, cron, or telemetry added here.
 */
import { supabase as defaultClient } from '@/integrations/supabase/client';
import { getBotAlias } from '@/lib/botAlias';

export interface LobbyGame {
  id: string;
  name?: string | null;
  status: string;
  buy_in: number;
  pot: number | null;
  created_at: string;
  session_ended_at?: string | null;
  total_hands?: number | null;
  ante_amount?: number | null;
  legs_to_win?: number | null;
  pot_max_enabled?: boolean | null;
  pot_max_value?: number | null;
  game_type?: string | null;
  chucky_cards?: number | null;
  points_to_win?: number | null;
  real_money?: boolean | null;
  is_paused?: boolean | null;
  skunk_enabled?: boolean | null;
  player_count?: number;
  is_creator?: boolean;
  is_player?: boolean;
  host_username?: string;
  duration_minutes?: number;
  players?: Array<{
    id: string;
    username: string;
    chips: number;
    legs: number;
    is_bot: boolean;
    sitting_out: boolean;
  }>;
}

/**
 * Explicit game columns. Narrow list — do not add fields unless the
 * lobby card actually renders them or SessionResults reads them from
 * the passed-in session object.
 */
export const LOBBY_GAME_COLUMNS = [
  'id',
  'name',
  'status',
  'buy_in',
  'pot',
  'created_at',
  'session_ended_at',
  'total_hands',
  'ante_amount',
  'legs_to_win',
  'pot_max_enabled',
  'pot_max_value',
  'game_type',
  'chucky_cards',
  'points_to_win',
  'real_money',
  'is_paused',
  'skunk_enabled',
].join(', ');

/**
 * Narrow player columns for the bounded `.in(game_id, ids)` query.
 * `profiles(username)` is a single bounded join for host + standings
 * display — NOT a per-historical-game nested subquery.
 */
export const LOBBY_PLAYER_COLUMNS =
  'id, user_id, game_id, chips, legs, is_bot, sitting_out, created_at, profiles(username)';

export const LOBBY_GAMES_HARD_LIMIT = 50;

export interface FetchLobbyGamesOptions {
  userId: string;
  signal?: AbortSignal;
  client?: typeof defaultClient;
}

export class LobbyFetchAbortedError extends Error {
  constructor() {
    super('Lobby fetch aborted');
    this.name = 'LobbyFetchAbortedError';
  }
}

function isAbort(signal?: AbortSignal, err?: unknown): boolean {
  if (signal?.aborted) return true;
  if (err && typeof err === 'object') {
    const anyErr = err as { name?: string; message?: string };
    if (anyErr.name === 'AbortError') return true;
    if (typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('abort')) {
      return true;
    }
  }
  return false;
}

export async function fetchLobbyGames({
  userId,
  signal,
  client = defaultClient,
}: FetchLobbyGamesOptions): Promise<LobbyGame[]> {
  // 1. Bounded games query.
  let gamesQuery: any = client
    .from('games')
    .select(LOBBY_GAME_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(LOBBY_GAMES_HARD_LIMIT);
  if (signal && typeof gamesQuery.abortSignal === 'function') {
    gamesQuery = gamesQuery.abortSignal(signal);
  }
  const { data: gamesData, error: gamesError } = await gamesQuery;
  if (signal?.aborted) throw new LobbyFetchAbortedError();
  if (gamesError) {
    if (isAbort(signal, gamesError)) throw new LobbyFetchAbortedError();
    throw gamesError;
  }
  const games = (gamesData ?? []) as any[];
  if (games.length === 0) return [];

  const allIds = games.map((g) => g.id);
  const endedIds = games.filter((g) => g.status === 'session_ended').map((g) => g.id);

  // 2. Bounded snapshot counts for ended games only.
  const snapshotCounts: Record<string, number> = {};
  if (endedIds.length > 0) {
    let snapQuery: any = client
      .from('session_player_snapshots')
      .select('game_id, user_id, player_id, is_bot')
      .in('game_id', endedIds);
    if (signal && typeof snapQuery.abortSignal === 'function') {
      snapQuery = snapQuery.abortSignal(signal);
    }
    const { data: snapshots, error: snapError } = await snapQuery;
    if (signal?.aborted) throw new LobbyFetchAbortedError();
    if (snapError && isAbort(signal, snapError)) throw new LobbyFetchAbortedError();
    if (!snapError && Array.isArray(snapshots)) {
      const perGame = new Map<string, Set<string>>();
      for (const snap of snapshots as any[]) {
        const key = (snap.is_bot ?? false) ? `bot:${snap.player_id}` : `user:${snap.user_id}`;
        const set = perGame.get(snap.game_id) ?? new Set<string>();
        set.add(key);
        perGame.set(snap.game_id, set);
      }
      for (const [gid, set] of perGame.entries()) snapshotCounts[gid] = set.size;
    }
  }

  // 3. One bounded players `.in(...)` query for the returned game ids.
  let playersQuery: any = client
    .from('players')
    .select(LOBBY_PLAYER_COLUMNS)
    .in('game_id', allIds);
  if (signal && typeof playersQuery.abortSignal === 'function') {
    playersQuery = playersQuery.abortSignal(signal);
  }
  const { data: playersData, error: playersError } = await playersQuery;
  if (signal?.aborted) throw new LobbyFetchAbortedError();
  if (playersError && isAbort(signal, playersError)) throw new LobbyFetchAbortedError();
  const playersByGame = new Map<string, any[]>();
  if (!playersError && Array.isArray(playersData)) {
    for (const p of playersData as any[]) {
      const list = playersByGame.get(p.game_id) ?? [];
      list.push(p);
      playersByGame.set(p.game_id, list);
    }
  }

  // 4. Enrichment in memory.
  const now = Date.now();
  return games.map((game): LobbyGame => {
    const players = playersByGame.get(game.id) ?? [];
    const humans = players.filter((p) => !p.is_bot);
    const sorted = [...humans].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
    const host = sorted[0];
    const host_username = host?.profiles?.username || 'Unknown';
    const isCreator = host?.user_id === userId;
    const isPlayer = players.some((p) => p.user_id === userId);
    const durationMinutes = Math.floor((now - new Date(game.created_at).getTime()) / 60000);
    const playerCount =
      game.status === 'session_ended' && snapshotCounts[game.id] !== undefined
        ? snapshotCounts[game.id]
        : players.length;

    return {
      ...game,
      player_count: playerCount,
      is_creator: isCreator,
      is_player: isPlayer,
      host_username,
      duration_minutes: durationMinutes,
      players: players.map((p) => ({
        id: p.id,
        username: p.is_bot
          ? getBotAlias(
              players.map((pd) => ({
                user_id: pd.user_id,
                is_bot: pd.is_bot,
                created_at: pd.created_at,
              })),
              p.user_id,
            )
          : p.profiles?.username || 'Unknown',
        chips: p.chips,
        legs: p.legs,
        is_bot: p.is_bot,
        sitting_out: p.sitting_out,
      })),
    };
  });
}
