/**
 * 3-5-7 Progress Vector
 *
 * Vector (6 dims):
 *   [handNumber, roundNumber, phaseOrdinal, decidedCount,
 *    resultRevealedOrd, awaitingNextRoundOrd]
 *
 * - handNumber:           rounds.hand_number — increments each new Round 1.
 *                         Prefer `__syncHandNumber` stamp when present so a
 *                         cross-hand identity advance cannot be canceled by a
 *                         closure-captured stale snapshot (mirrors Holm /
 *                         Horses framework cutover fix).
 * - roundNumber:          1, 2, or 3 within a hand.
 * - phaseOrdinal:         betting=0, completed=1.
 * - decidedCount:         players with decisionLocked === true.
 * - resultRevealedOrd:    0 until last_round_result is populated for this
 *                         completed round, 1 afterwards. Prevents a
 *                         result-revealed snapshot from being clobbered by
 *                         a same-phase pre-result snapshot under equal-progress
 *                         identical-state semantics.
 * - awaitingNextRoundOrd: 0 until awaiting_next_round is true, 1 afterwards.
 *                         Captures the chip-award / payout progression step
 *                         that fires after the result reveal.
 *
 * Monotonic across the full match lifecycle:
 *   hand transitions advance dim 0,
 *   round transitions advance dim 1,
 *   phase/decision progress advances dims 2-3,
 *   showdown reveal advances dim 4,
 *   payout/handoff advances dim 5.
 *
 * Dims 4-5 reset cleanly at round/hand boundaries dominated by dims 0-1.
 */

import type { ProgressVector } from './types';

// ── Authoritative snapshot shape ───────────────────────────────

export interface ThreeFiveSevenPlayerSnapshot {
  playerId: string;
  userId: string;
  position: number;
  decision: string | null;
  decisionLocked: boolean;
  autoFold: boolean;
  sittingOut: boolean;
}

export interface ThreeFiveSevenAuthoritativeSnapshot {
  _authorityRevision?: number;
  _authorityScope?: string;
  // Identity
  roundId: string;
  handNumber: number;
  roundNumber: number;
  dealerGameId: string;

  // Phase
  roundStatus: 'betting' | 'completed';

  // Players & decisions
  players: ThreeFiveSevenPlayerSnapshot[];

  // Turn
  currentTurnPosition: number | null;
  decisionDeadline: string | null;

  // Game context
  pot: number;
  chipTransferCursor: number;
  lastRoundResult: string | null;
  awaitingNextRound: boolean;
  buckPosition: number;
  dealerPosition: number;
  cardsDealt: number;

  /**
   * Defensive monotonicity stamp. The writer (`buildThreeFiveSevenSnapshot`)
   * sets this to the round's hand number at snapshot-build time. The progress
   * vector prefers this value so a stale closure-captured snapshot cannot
   * regress the hand dim across a hand boundary.
   */
  __syncHandNumber?: number;
}

// ── Phase ordinal mapping ──────────────────────────────────────

const PHASE_ORDINAL: Record<string, number> = {
  betting: 0,
  completed: 1,
};

// ── Progress vector extraction ─────────────────────────────────

export function getThreeFiveSevenProgress(state: ThreeFiveSevenAuthoritativeSnapshot): ProgressVector {
  const handNumber = state.__syncHandNumber ?? state.handNumber;
  const roundNumber = state.roundNumber;
  const phaseOrdinal = PHASE_ORDINAL[state.roundStatus] ?? 0;
  const decidedCount = state.players.filter(p => p.decisionLocked === true).length;
  const resultRevealedOrd = state.lastRoundResult && state.lastRoundResult.length > 0 ? 1 : 0;
  const awaitingNextRoundOrd = state.awaitingNextRound ? 1 : 0;

  return [
    handNumber,
    roundNumber,
    phaseOrdinal,
    decidedCount,
    resultRevealedOrd,
    awaitingNextRoundOrd,
  ];
}
