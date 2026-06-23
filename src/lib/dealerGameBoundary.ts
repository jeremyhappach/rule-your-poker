// Dealer-game lifecycle boundary contract.
//
// A new dealer_games row marks a new participation lifecycle within the
// session. Transient per-hand / per-round gameplay state from the prior
// dealer game must NOT cross this boundary, regardless of game type. Owning
// this contract in one shared helper prevents per-game drift (cribbage,
// holm, gin, yahtzee, horses, scc, 3-5-7 all share it).
//
// Reset (transient gameplay participation state):
//   - current_decision     (per-round decision; stale once round ends)
//   - decision_locked      (per-round lock flag)
//   - auto_fold            (per-round timer-expiry marker)
//   - pre_stay / pre_fold  (per-round pre-action hints)
//   - ante_decision        (per-dealer-game ante choice; new game = new ante)
//   - status               (only 'folded' → 'active'; 3-5-7 elimination must
//                           not survive into a new dealer game)
//
// Preserve (durable identity states — DO NOT touch):
//   - observer  (seat identity)
//   - left      (seat identity)
//   - sitting_out (player-controlled persistent preference)
//   - chips, position, etc.
//
// This helper MUST be invoked once, at the true dealer-game boundary,
// immediately after a successful insert into public.dealer_games and BEFORE
// any per-game bootstrap (startCribbageRound / startHolmRound / etc.).
// It must NOT be invoked from inside individual startXRound paths.

import { supabase } from '@/integrations/supabase/client';
import { recordHolmTeardown } from '@/lib/canonicalShell/cardTransport/holmHandBoundaryForensics';

export interface DealerGameBoundaryResetResult {
  success: boolean;
  resetCount?: number;
  unfoldCount?: number;
  error?: string;
}

export async function sanitizePlayersForNewDealerGame(
  gameId: string
): Promise<DealerGameBoundaryResetResult> {
  if (!gameId) {
    return { success: false, error: 'gameId required' };
  }

  try {
    // Step 1: bulk-clear transient gameplay flags on all non-identity rows.
    // We keep observer/left rows untouched (durable identity).
    const { data: cleared, error: clearError } = await supabase
      .from('players')
      .update({
        current_decision: null,
        decision_locked: false,
        auto_fold: false,
        pre_stay: false,
        pre_fold: false,
        ante_decision: null,
      })
      .eq('game_id', gameId)
      .neq('status', 'observer')
      .neq('status', 'left')
      .select('id');

    if (clearError) {
      console.error('[DEALER_BOUNDARY] Failed to clear transient flags:', clearError);
      return { success: false, error: clearError.message };
    }

    // Step 2: conditionally normalize stale 'folded' → 'active'. This is the
    // only status value that is transient/invalid for a new dealer game
    // (3-5-7 session-elimination). 'observer', 'left', 'active' are all
    // preserved as-is.
    const { data: unfolded, error: unfoldError } = await supabase
      .from('players')
      .update({ status: 'active' })
      .eq('game_id', gameId)
      .eq('status', 'folded')
      .select('id');

    if (unfoldError) {
      console.error('[DEALER_BOUNDARY] Failed to normalize folded→active:', unfoldError);
      return { success: false, error: unfoldError.message };
    }

    const resetCount = cleared?.length ?? 0;
    const unfoldCount = unfolded?.length ?? 0;
    console.log(
      '[DEALER_BOUNDARY] sanitized players for new dealer game',
      { gameId, resetCount, unfoldCount }
    );

    return { success: true, resetCount, unfoldCount };
  } catch (err: any) {
    console.error('[DEALER_BOUNDARY] Unexpected error:', err);
    return { success: false, error: err?.message ?? 'unknown' };
  }
}
