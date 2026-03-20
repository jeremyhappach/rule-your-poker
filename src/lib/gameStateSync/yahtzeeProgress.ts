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

  const playerCount = state.turnOrder.length;
  const currentTurnIdx = state.currentTurnPlayerId
    ? state.turnOrder.indexOf(state.currentTurnPlayerId)
    : -1;

  // Expected turn after all completed scores have handed off.
  // During the split score flow, the scored snapshot still points at the scorer,
  // while the advanced snapshot points at the next player. This flag makes the
  // second snapshot strictly forward even when turn order wraps backwards.
  const expectedTurnIdx = playerCount > 0
    ? totalCategoriesFilled % playerCount
    : -1;
  const handoffPhase = currentTurnIdx === expectedTurnIdx ? 1 : 0;

  // Rolls used: 0 = hasn't rolled, 3 = all rolls used
  const currentPs = state.currentTurnPlayerId
    ? state.playerStates[state.currentTurnPlayerId]
    : null;
  const rollsUsed = currentPs ? (3 - currentPs.rollsRemaining) : 0;

  return [phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed];
};
