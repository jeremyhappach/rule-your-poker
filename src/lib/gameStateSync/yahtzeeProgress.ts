/**
 * Yahtzee progress vector extractor for the anti-regression framework.
 *
 * Vector: [phaseOrd, totalCategoriesFilled, turnIdx, rollsUsed]
 *
 * CRITICAL ORDERING: totalCategoriesFilled MUST come before rollsUsed.
 * When a player scores, rollsUsed resets to 0 (dice reset for next turn),
 * but totalCategoriesFilled increases. If rollsUsed were checked first,
 * the post-score snapshot would look regressive (rollsUsed 2→0) and be
 * rejected, even though the game moved forward (categories 5→6).
 *
 * - phaseOrd:            waiting=0, playing=1, complete=2
 * - totalCategoriesFilled: total categories scored across ALL players (strictly monotonic)
 * - turnIdx:             position of current turn player in turnOrder
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

  // Turn index within turnOrder
  const turnIdx = state.currentTurnPlayerId
    ? state.turnOrder.indexOf(state.currentTurnPlayerId)
    : 0;

  // Rolls used: 0 = hasn't rolled, 3 = all rolls used
  const currentPs = state.currentTurnPlayerId
    ? state.playerStates[state.currentTurnPlayerId]
    : null;
  const rollsUsed = currentPs ? (3 - currentPs.rollsRemaining) : 0;

  return [phaseOrd, totalCategoriesFilled, turnIdx, rollsUsed];
};
