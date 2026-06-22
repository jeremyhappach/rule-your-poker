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
  getConfiguredHarnessCached,
  ensureHarnessCacheLoaded,
  isHarnessCacheLoaded,
} from '@/lib/debugHarness/runtimeCache';
import { supabase } from '@/integrations/supabase/client';

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
 * Synchronous read (cache). Uses CONFIGURED (not gated) selection so the
 * Holm override applies whenever an admin has picked it — independent of
 * the Global Debug Mode master switch. Returns null when the cache has
 * not hydrated yet; callers in async paths should prefer
 * getHolmForcedWinnerAsync() for a guaranteed fresh read.
 */
export function getHolmForcedWinner(): HolmForcedWinner {
  if (!isHarnessCacheLoaded()) return null;
  return idToWinner(getConfiguredHarnessCached('holm'));
}

/**
 * Authoritative async read — queries game_defaults directly so a result
 * override never depends on cache hydration timing.
 */
export async function getHolmForcedWinnerAsync(): Promise<HolmForcedWinner> {
  try {
    const { data } = await supabase
      .from('game_defaults')
      .select('debug_harness')
      .eq('game_type', 'holm')
      .maybeSingle();
    const id = (data as { debug_harness?: string | null } | null)?.debug_harness ?? null;
    return idToWinner(id);
  } catch {
    return null;
  }
}

