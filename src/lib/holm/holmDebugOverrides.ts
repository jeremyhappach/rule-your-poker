/**
 * Holm Admin Debug Overrides
 *
 * Backed by the Debug Harness selector (game_defaults.debug_harness for
 * game_type='holm'), gated by Global Debug Mode. RESULT OVERRIDE ONLY —
 * does not bypass Chucky deal, visual reveal, announcement, or
 * win-sequence.
 *
 * Harness ids:
 *   - 'force_player_beats_chucky' → winner = PLAYER
 *   - 'force_chucky_beats_player' → winner = CHUCKY
 */

import {
  getActiveHarnessCached,
  ensureHarnessCacheLoaded,
} from '@/lib/debugHarness/runtimeCache';

export type HolmForcedWinner = 'player' | 'chucky' | null;

// Kick off hydration early so synchronous showdown call sites see a
// populated cache (handleChuckyShowdown runs on the client only).
if (typeof window !== 'undefined') {
  void ensureHarnessCacheLoaded();
}

export function getHolmForcedWinner(): HolmForcedWinner {
  const id = getActiveHarnessCached('holm');
  if (id === 'force_player_beats_chucky') return 'player';
  if (id === 'force_chucky_beats_player') return 'chucky';
  return null;
}
