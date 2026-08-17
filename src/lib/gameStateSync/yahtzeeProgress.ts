/**
 * Yahtzee progress vector extractor for the anti-regression framework.
 *
 * Vector: [roundOrd, phaseOrd, actionSequence, totalCategoriesFilled, handoffPhase, rollsUsed]
 *
 * CRITICAL ORDERING:
 * - roundOrd (most significant) — discriminates cross-Yahtzee-game boundaries.
 *   Sourced from the per-state `__syncRound` stamp set by the controller from
 *   the round row's id/createdAt (NOT from `currentRound`, which is the
 *   scorecard line 1-13 and resets within a game). This prevents a stale
 *   final-state snapshot from a previous match from dominating fresh
 *   first-roll snapshots of a new match — same defect class as the Horses
 *   handNumber bug. Unstamped snapshots fall back to 0.
 * - totalCategoriesFilled MUST come before handoffPhase / rollsUsed because
 *   scoring resets rollsRemaining to 3 while still moving the game forward.
 * - handoffPhase MUST come before rollsUsed because score→turn-advance is a
 *   two-write sequence: first the scorer's category is recorded, then turn
 *   advances to the next player.
 *
 * `turnIdx` alone is NOT safe here because it wraps (e.g. player 2 → player 1),
 * which caused valid turn-advance snapshots to look regressive on observers.
 *
 * NOTE: turnOwnerIndex was previously included to prevent stale-owner equal-
 * progress snapshots; the handoffPhase dim already discriminates that case
 * and including turnOwnerIndex broke legitimate higher→lower index wraps.
 *
 * - roundOrd:            stamped monotonic round ord (new Yahtzee match > old)
 * - phaseOrd:            waiting=0, playing=1, complete=2
 * - actionSequence:      server-owned CAS sequence (every roll/hold/score advances)
 * - totalCategoriesFilled: total categories scored across ALL players (monotonic within a match)
 * - handoffPhase:        0 = scored snapshot before turn handoff, 1 = live turn snapshot
 * - rollsUsed:           3 - rollsRemaining (higher = more advanced within a turn)
 */

import type { YahtzeeState } from '@/lib/yahtzeeTypes';
import type { ProgressVector } from './types';

/**
 * Per-state hand/round-number stamp.
 *
 * The controller MUST stamp every incoming authoritative snapshot with the
 * round ord (e.g. a monotonic counter derived from the round row's createdAt
 * or id sequence) BEFORE feeding it into `receiveAuthoritativeUpdate`. The
 * progress comparator must see the snapshot's OWN round ord — not a closure-
 * captured "latest" value — otherwise the dim cancels across match
 * boundaries and a stale prior-match terminal snapshot can dominate fresh
 * next-match state on the lower dims.
 */
export interface YahtzeeStateForProgress extends YahtzeeState {
  __syncRound?: number;
}

export function getYahtzeeProgress(state: YahtzeeStateForProgress): ProgressVector {
  // roundOrd: prefer state-stamped value. Unstamped legacy snapshots = 0.
  const roundOrd = typeof state.__syncRound === 'number' ? state.__syncRound : 0;

  // Phase ordinal: waiting=0, playing=1, complete=2
  const phaseOrd = state.gamePhase === 'waiting' ? 0 : state.gamePhase === 'complete' ? 2 : 1;
  const actionSequence = Number.isInteger(state.actionSequence) ? state.actionSequence! : 0;

  // Total categories filled across all players (strictly monotonic as game advances)
  let totalCategoriesFilled = 0;
  for (const ps of Object.values(state.playerStates)) {
    totalCategoriesFilled += Object.keys(ps.scorecard.scores).length;
  }

  // Per-player category counts in stable turnOrder. These dims MUST precede
  // the volatile turn-presentation dims (handoffPhase, rollsUsed) so that any
  // opponent scorecard commit is recognised as strictly forward and cannot be
  // masked by a local optimistic snapshot pinning a higher handoffPhase or a
  // lower rollsUsed. Lexicographic comparison stops at the first differing
  // dim; appending these trailing would let the volatile dims mask real
  // opponent progress. Order is stable (turnOrder) so vectors from different
  // clients compare consistently.
  const perPlayerCategoryCounts: number[] = state.turnOrder.map((playerId) => {
    const ps = state.playerStates[playerId];
    return ps ? Object.keys(ps.scorecard.scores).length : 0;
  });

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

  // See the original Yahtzee handoff note: scorecard parity (not modulo math)
  // is required because completed players are skipped by advanceYahtzeeTurn().
  const handoffPhase = (
    minFilledAmongIncomplete !== null
    && currentTurnFilled !== null
    && currentTurnFilled === minFilledAmongIncomplete
  ) ? 1 : 0;

  // Rolls used: 0 = hasn't rolled, 3 = all rolls used
  const rollsUsed = currentTurnPlayerState ? (3 - currentTurnPlayerState.rollsRemaining) : 0;

  return [
    roundOrd,
    phaseOrd,
    actionSequence,
    totalCategoriesFilled,
    ...perPlayerCategoryCounts,
    handoffPhase,
    rollsUsed,
  ];
}
