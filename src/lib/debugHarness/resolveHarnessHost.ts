/**
 * Canonical "session host" resolver for debug harnesses.
 *
 * All near-X / scripted-winner harnesses (Cribbage near-double-skunk,
 * Gin near-gin, Yahtzee near-win, …) MUST direct the advantaged player
 * to the canonical SESSION HOST — never to the local viewer, the
 * current crib dealer, the dealer-game chooser, or whichever client
 * happens to initialize first.
 *
 * Definition (deterministic, identical on every client):
 *   1. `games.current_host` (user_id) — the explicit host pointer.
 *      Resolve to the non-bot player row with matching user_id.
 *   2. Fallback when current_host is null/unresolvable:
 *      earliest non-bot player by `players.created_at`
 *      (this matches the host rule used elsewhere in Game.tsx).
 *   3. Fallback when no humans exist at all:
 *      earliest player by `created_at` (so harnesses still degrade
 *      gracefully in bot-only debug sessions).
 *
 * Derived from persisted canonical session data only — no localStorage,
 * no auth.uid(), no render-timing, no init race.
 */

import { supabase } from '@/integrations/supabase/client';

export interface HarnessHostPlayer {
  id: string;
  user_id?: string | null;
  is_bot?: boolean | null;
  created_at?: string | null;
}

export function resolveSessionHostPlayerId(
  game: { current_host?: string | null } | null | undefined,
  players: HarnessHostPlayer[],
): string | null {
  if (!players || players.length === 0) return null;

  const humans = players.filter((p) => !p.is_bot);

  const currentHost = game?.current_host ?? null;
  if (currentHost) {
    const match = humans.find((p) => p.user_id === currentHost);
    if (match) return match.id;
  }

  const byCreated = (a: HarnessHostPlayer, b: HarnessHostPlayer) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();

  const earliestHuman = [...humans].sort(byCreated)[0];
  if (earliestHuman) return earliestHuman.id;

  const earliestAny = [...players].sort(byCreated)[0];
  return earliestAny?.id ?? null;
}

/**
 * Async variant: fetches `games.current_host` when the caller only has
 * `gameId` + players in hand. Use from components that don't already
 * have the games row loaded (e.g. CribbageMobileGameTable init).
 */
export async function fetchSessionHostPlayerId(
  gameId: string,
  players: HarnessHostPlayer[],
): Promise<string | null> {
  try {
    // Always fetch authoritative rows from DB. The caller's `players` array
    // may be missing `created_at` and/or `is_bot` (different parents shape
    // the array differently), which silently breaks the non-bot tiebreaker
    // and causes the harness advantage to land on a bot instead of the
    // human session host. See mem://constraints/canonical-harness-host-rule.
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select('current_host').eq('id', gameId).maybeSingle(),
      supabase
        .from('players')
        .select('id,user_id,is_bot,created_at')
        .eq('game_id', gameId),
    ]);
    const currentHost =
      (gameRes.data as { current_host?: string | null } | null)?.current_host ?? null;
    const dbPlayers = (playersRes.data ?? []) as HarnessHostPlayer[];
    // Prefer DB rows when present; fall back to caller-provided players.
    const merged = dbPlayers.length > 0 ? dbPlayers : players;
    return resolveSessionHostPlayerId({ current_host: currentHost }, merged);
  } catch {
    return resolveSessionHostPlayerId(null, players);
  }
}
