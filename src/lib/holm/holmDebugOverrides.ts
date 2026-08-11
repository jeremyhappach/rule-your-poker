/**
 * Holm Admin Debug Overrides
 *
 * Backed by the Debug Harness selector (game_defaults.debug_harness for
 * game_type='holm'). RESULT OVERRIDE ONLY — does not bypass Chucky deal,
 * visual reveal, announcement, or win-sequence.
 *
 * Harness ids:
 *   - 'force_player_beats_chucky' → winner = PLAYER
 *   - 'force_chucky_beats_player' → winner = CHUCKY
 */

import {
  getActiveHarnessCached,
  ensureHarnessCacheLoaded,
  isHarnessCacheLoaded,
  refreshHarnessCache,
} from '@/lib/debugHarness/runtimeCache';

export type HolmForcedWinner = 'player' | 'chucky' | null;

// Kick off hydration early so synchronous showdown call sites see a
// populated cache (handleChuckyShowdown runs on the client only).
if (typeof window !== 'undefined') {
  void ensureHarnessCacheLoaded();
}

function idToWinner(id: string | null | undefined): HolmForcedWinner {
  if (id === 'force_player_beats_chucky') return 'player';
  if (id === 'force_chucky_beats_player') return 'chucky';
  return null;
}

/**
 * Synchronous read of the executable harness. A configured profile alone
 * must never alter a real hand: return null until the cache is available and
 * the Harnesses Mode master gate is on.
 */
export function getHolmForcedWinner(): HolmForcedWinner {
  if (!isHarnessCacheLoaded()) return null;
  return idToWinner(getActiveHarnessCached('holm'));
}

/**
 * Fresh async read of the full execution boundary. Refreshing both the
 * profile and master gate prevents a stale configured profile from forcing a
 * result after Harnesses Mode was disabled.
 */
export async function getHolmForcedWinnerAsync(): Promise<HolmForcedWinner> {
  try {
    const refreshed = await refreshHarnessCache();
    if (!refreshed) return null;
    return getHolmForcedWinner();
  } catch {
    return null;
  }
}
