// Cribbage hand archive — observational telemetry only.
//
// SAFETY CONSTRAINTS:
// - Append-only writes to a separate table (cribbage_hand_archive).
// - Never read by gameplay; never blocks gameplay.
// - Idempotent on (dealer_game_id, hand_number).
// - Failures are logged only and swallowed.

import { supabase } from '@/integrations/supabase/client';
import type { CribbageState } from './cribbageTypes';

interface ArchiveArgs {
  gameId: string;
  dealerGameId: string;
  roundId: string | null;
  handNumber: number;
  state: CribbageState;
}

/**
 * Archive a fully-scored cribbage hand.
 *
 * Call AFTER applyHandCountScores has been applied and the hand state is final
 * (i.e. peg + hand + crib totals are all in place). Safe to call from any
 * client; the unique constraint guarantees a single row per hand.
 *
 * Fire-and-forget. Never throws. Never blocks gameplay.
 */
export function archiveCribbageHand(args: ArchiveArgs): void {
  const { gameId, dealerGameId, roundId, handNumber, state } = args;

  if (!dealerGameId || !handNumber || !state) {
    return;
  }

  // Build a fairness-analysis snapshot from the final hand state.
  const dealtHands: Record<string, unknown> = {};
  const handCounts: Record<string, unknown> = {};
  const pegScores: Record<string, number> = {};

  try {
    const playerStates = (state as any).playerStates ?? {};
    for (const [pid, ps] of Object.entries<any>(playerStates)) {
      dealtHands[pid] = {
        hand: ps?.hand ?? [],
        discardedToCrib: ps?.discardedToCrib ?? [],
      };
      if (ps?.lastHandCount !== undefined) {
        handCounts[pid] = ps.lastHandCount;
      }
      if (typeof ps?.pegScore === 'number') {
        pegScores[pid] = ps.pegScore;
      }
    }
  } catch {
    // ignore — we still archive the raw cribbage_state below
  }

  const payload = {
    dealer_game_id: dealerGameId,
    hand_number: handNumber,
    game_id: gameId,
    round_id: roundId,
    dealer_player_id: (state as any).dealerPlayerId ?? null,
    cut_card: (state as any).cutCard ?? null,
    dealt_hands: dealtHands,
    crib: (state as any).crib ?? null,
    hand_counts: handCounts,
    peg_scores: pegScores,
    cribbage_state: JSON.parse(JSON.stringify(state)),
  };

  // Fire-and-forget. Duplicate-key (23505) is expected and silent.
  void supabase
    .from('cribbage_hand_archive')
    .insert(payload as any)
    .then(({ error }) => {
      if (error && error.code !== '23505') {
        console.warn('[CRIBBAGE_ARCHIVE] insert failed (non-blocking):', error.message);
      }
    });
}
