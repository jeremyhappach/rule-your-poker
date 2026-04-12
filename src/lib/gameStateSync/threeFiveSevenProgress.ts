/**
 * 3-5-7 Progress Vector
 *
 * Vector: [handNumber, roundNumber, phaseOrdinal, decidedCount]
 *
 * - handNumber:    rounds.hand_number — increments each new Round 1
 * - roundNumber:   1, 2, or 3 within a hand
 * - phaseOrdinal:  betting=0, completed=1
 * - decidedCount:  count of players with decisionLocked === true
 *
 * Monotonic across the full match lifecycle:
 *   hand transitions advance dim 0,
 *   round transitions advance dim 1,
 *   phase/decision progress advances dims 2-3.
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
  lastRoundResult: string | null;
  awaitingNextRound: boolean;
  buckPosition: number;
  dealerPosition: number;
  cardsDealt: number;
}

// ── Phase ordinal mapping ──────────────────────────────────────

const PHASE_ORDINAL: Record<string, number> = {
  betting: 0,
  completed: 1,
};

// ── Progress vector extraction ─────────────────────────────────

export function getThreeFiveSevenProgress(state: ThreeFiveSevenAuthoritativeSnapshot): ProgressVector {
  const handNumber = state.handNumber;
  const roundNumber = state.roundNumber;
  const phaseOrdinal = PHASE_ORDINAL[state.roundStatus] ?? 0;
  const decidedCount = state.players.filter(p => p.decisionLocked === true).length;

  return [handNumber, roundNumber, phaseOrdinal, decidedCount];
}
