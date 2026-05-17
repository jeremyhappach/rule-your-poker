/**
 * Holm Progress Vector
 *
 * Vector: [handNumber, phaseOrdinal, decidedCount, communityCardsRevealed]
 *
 * - handNumber:              rounds.hand_number — increments per deal
 * - phaseOrdinal:            derived from rounds.status (betting=0, processing=1, showdown=2, completed=3)
 * - decidedCount:            count of players where decisionLocked === true
 * - communityCardsRevealed:  rounds.community_cards_revealed (0–4 during showdown)
 *
 * decidedCount uses decision_locked (not current_decision) because it is
 * set atomically by the turn-advance logic and is never unset within a hand,
 * making it truly irreversible and safe for monotonic progress.
 */

import type { ProgressVector } from './types';

// ── Authoritative snapshot shape ───────────────────────────────

export interface HolmPlayerSnapshot {
  playerId: string;
  userId: string;
  position: number;
  decision: string | null;
  decisionLocked: boolean;
  autoFold: boolean;
  sittingOut: boolean;
}

export interface HolmAuthoritativeSnapshot {
  // Identity
  roundId: string;
  handNumber: number;
  dealerGameId: string;

  /**
   * Defensive stamp mirroring the Horses P0 #2 fix.
   *
   * The handNumber field above is already sourced authoritatively from the
   * round row (not a closure-captured "latest"), so getHolmProgress is safe
   * by construction. We still allow callers to stamp `__syncHandNumber`
   * onto every incoming snapshot so cross-hand transitions are provably
   * dominant on the most-significant progress dim even if a future code
   * path starts feeding partially-derived snapshots.
   */
  __syncHandNumber?: number;

  // Phase
  roundStatus: 'betting' | 'processing' | 'showdown' | 'completed';

  // Players & decisions
  players: HolmPlayerSnapshot[];

  // Turn
  currentTurnPosition: number | null;
  decisionDeadline: string | null;

  // Table
  communityCards: unknown[];
  communityCardsRevealed: number;
  chuckyCards: unknown[];
  chuckyActive: boolean;
  chuckyCardsRevealed: number;

  // Pot & game context
  pot: number;
  lastRoundResult: string | null;
  buckPosition: number;
  dealerPosition: number;
}

// ── Phase ordinal mapping ──────────────────────────────────────

const PHASE_ORDINAL: Record<string, number> = {
  betting: 0,
  processing: 1,
  showdown: 2,
  completed: 3,
};

// ── Progress vector extraction ─────────────────────────────────

export function getHolmProgress(state: HolmAuthoritativeSnapshot): ProgressVector {
  // Prefer the explicit stamp when present (defensive: state.handNumber
  // is already authoritative-sourced today, but the stamp guarantees that
  // any future divergence between snapshot.handNumber and the round's
  // authoritative hand_number cannot cancel the most-significant dim).
  const handNumber = state.__syncHandNumber ?? state.handNumber;
  const phaseOrdinal = PHASE_ORDINAL[state.roundStatus] ?? 0;
  const decidedCount = state.players.filter(p => p.decisionLocked === true).length;
  const communityCardsRevealed = state.communityCardsRevealed ?? 0;

  return [handNumber, phaseOrdinal, decidedCount, communityCardsRevealed];
}
