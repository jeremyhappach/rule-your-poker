/**
 * Yahtzee progress vector extractor for the anti-regression framework.
 *
 * Vector: [phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed]
 *
 * CRITICAL ORDERING:
 * - totalCategoriesFilled MUST come before handoffPhase / rollsUsed because
 *   scoring resets rollsRemaining to 3 while still moving the game forward.
 * - handoffPhase MUST come before rollsUsed because score→turn-advance is a
 *   two-write sequence: first the scorer's category is recorded, then turn
 *   advances to the next player.
 *
 * `turnIdx` alone is NOT safe here because it wraps (e.g. player 2 → player 1),
 * which caused valid turn-advance snapshots to look regressive on observers.
 *
 * NOTE: turnOwnerIndex was previously included as a 5th dimension to prevent
 * stale-owner snapshots from being treated as equal-progress. However, the sync
 * gate accepts equal-progress snapshots (`isProgressForwardOrEqual`), so the
 * discriminator is unnecessary. Worse, it caused legitimate turn handoffs where
 * the turnOrder index wraps from a higher index back to 0 (e.g. human at
 * index 1 → bot at index 0) to be falsely rejected as regressive when all
 * other dimensions were tied (equal-parity category counts). The handoffPhase
 * dimension already correctly distinguishes scored-before-handoff (0) from
 * live-turn-after-handoff (1), making turnOwnerIndex redundant.
 *
 * - phaseOrd:            waiting=0, playing=1, complete=2
 * - totalCategoriesFilled: total categories scored across ALL players (strictly monotonic)
 * - handoffPhase:        0 = scored snapshot before turn handoff, 1 = live turn snapshot
 * - rollsUsed:           3 - rollsRemaining (higher = more advanced within a turn)
 */

import type { YahtzeeState } from '@/lib/yahtzeeTypes';
import type { GetProgressFn } from './types';

export const getYahtzeeProgress: GetProgressFn<YahtzeeState> = (state) => {
  // Phase ordinal: waiting=0, playing=1, complete=2
  const phaseOrd = state.gamePhase === 'waiting' ? 0 : state.gamePhase === 'complete' ? 2 : 1;

  // Total categories filled across all players (strictly monotonic as game advances)
  let totalCategoriesFilled = 0;
  for (const ps of Object.values(state.playerStates)) {
    totalCategoriesFilled += Object.keys(ps.scorecard.scores).length;
  }

  const incompletePlayers = state.turnOrder
    .map((playerId) => state.playerStates[playerId])
    .filter((ps): ps is NonNullable<typeof ps> => Boolean(ps) && !ps.isComplete);

  const minFilledAmongIncomplete = incompletePlayers.length > 0
    ? Math.min(...incompletePlayers.map((ps) => Object.keys(ps.scorecard.scores).length))
    : null;

  const currentTurnPlayerState = state.currentTurnPlayerId
    ? state.playerStates[state.currentTurnPlayerId]
    : null;
  const currentTurnFilled = currentTurnPlayerState
    ? Object.keys(currentTurnPlayerState.scorecard.scores).length
    : null;

  // IMPORTANT:
  // We cannot derive handoff from totalCategoriesFilled % turnOrder.length because
  // completed players are skipped during advanceYahtzeeTurn(). In the final-turn
  // edge case (one player already complete, one player still active), modulo-based
  // math can mark the sole remaining player's live turn as "pre-handoff", causing
  // valid post-handoff / post-roll snapshots to compare incorrectly.
  //
  // Instead, use scorecard parity among INCOMPLETE players:
  // - scored snapshot before handoff: current player has one more filled category
  //   than at least one other incomplete player → handoffPhase = 0
  // - live turn snapshot after handoff: current player is one of the players with
  //   the minimum filled-count among incomplete players → handoffPhase = 1
  // - when only one incomplete player remains (final-turn case), that player is
  //   always the live turn holder, so handoffPhase stays 1 and rolls can progress.
  const handoffPhase = (
    minFilledAmongIncomplete !== null
    && currentTurnFilled !== null
    && currentTurnFilled === minFilledAmongIncomplete
  ) ? 1 : 0;

  // Rolls used: 0 = hasn't rolled, 3 = all rolls used
  const rollsUsed = currentTurnPlayerState ? (3 - currentTurnPlayerState.rollsRemaining) : 0;

  return [phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed];
};
