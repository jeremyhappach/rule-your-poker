/**
 * Yahtzee progress vector extractor for the anti-regression framework.
 *
 * Vector: [currentRound, turnIndex, rollsUsed, categoriesFilled]
 *
 * - currentRound: which round of 13 we're on
 * - turnIndex: position of current turn player in turnOrder (detects turn advance)
 * - rollsUsed: 3 - rollsRemaining (higher = more advanced within a turn)
 * - categoriesFilled: total categories scored across all players (monotonic)
 */

import type { YahtzeeState } from '@/lib/yahtzeeTypes';
import type { GetProgressFn } from './types';

export const getYahtzeeProgress: GetProgressFn<YahtzeeState> = (state) => {
  const round = state.currentRound ?? 0;

  // Turn index within turnOrder
  const turnIdx = state.currentTurnPlayerId
    ? state.turnOrder.indexOf(state.currentTurnPlayerId)
    : 0;

  // Rolls used: 0 = hasn't rolled, 3 = all rolls used
  const currentPs = state.currentTurnPlayerId
    ? state.playerStates[state.currentTurnPlayerId]
    : null;
  const rollsUsed = currentPs ? (3 - currentPs.rollsRemaining) : 0;

  // Total categories filled across all players (strictly monotonic as game advances)
  let totalCategoriesFilled = 0;
  for (const ps of Object.values(state.playerStates)) {
    totalCategoriesFilled += Object.keys(ps.scorecard.scores).length;
  }

  // Phase ordinal: waiting=0, playing=1, complete=2
  const phaseOrd = state.gamePhase === 'waiting' ? 0 : state.gamePhase === 'complete' ? 2 : 1;

  return [phaseOrd, round, turnIdx, rollsUsed, totalCategoriesFilled];
};
