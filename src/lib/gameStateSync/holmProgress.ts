/**
 * Holm Progress Vector
 *
 * Vector: [handNumber, phaseOrdinal, turnSequence, decidedCount, decisionDeadlineEpoch,
 *          communityCardsRevealed,
 *          chuckyActiveOrd, chuckyCardsRevealed]
 *
 * - handNumber:              rounds.hand_number — increments per deal
 * - phaseOrdinal:            derived from rounds.status (betting=0, processing=1, showdown=2, completed=3)
 * - turnSequence:            rounds.holm_turn_sequence; increments in the same transaction as
 *                            every accepted decision/turn/deadline transition
 * - decidedCount:            count of players where decisionLocked === true
 * - decisionDeadlineEpoch:   exact server deadline in epoch milliseconds. This only
 *                            changes for the same turn on an explicit pause/resume;
 *                            a later resume must dominate the pre-pause deadline.
 * - communityCardsRevealed:  rounds.community_cards_revealed (0–4 during showdown)
 * - chuckyActiveOrd:         0 when chucky_active is false, 1 when true. Chucky activates
 *                            strictly after community reveal completes and never deactivates
 *                            within a hand (cleared only on next-hand creation), so it is
 *                            monotonic within an identity.
 * - chuckyCardsRevealed:     rounds.chucky_cards_revealed (0–N stepped reveal). Authoritative
 *                            DB writes step this 0→N monotonically within a hand.
 *
 * decidedCount uses decision_locked (not current_decision) because it is
 * set atomically by the turn-advance logic and is never unset within a hand,
 * making it truly irreversible and safe for monotonic progress.
 *
 * chucky_* are progression-significant (not cosmetic): two snapshots with
 * identical hand/phase/decidedCount/communityCardsRevealed but different
 * chucky reveal state represent meaningfully different authoritative states.
 * Without these dims, late-arriving stale snapshots that have not yet
 * observed a chucky reveal would compare equal-progress and could shadow
 * a fresher snapshot via equal-tie semantics.
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
  _authorityRevision?: number;
  _authorityScope?: string;
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
  roundStatus: 'dealing' | 'betting' | 'processing' | 'showdown' | 'completed';

  // Players & decisions
  players: HolmPlayerSnapshot[];

  // Turn
  turnSequence: number;
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
  chipTransferCursor: number;
  lastRoundResult: string | null;
  buckPosition: number;
  dealerPosition: number;
}

// ── Phase ordinal mapping ──────────────────────────────────────

const PHASE_ORDINAL: Record<string, number> = {
  dealing: -1,
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
  const turnSequence = state.turnSequence ?? 0;
  const decidedCount = state.players.filter(p => p.decisionLocked === true).length;
  const parsedDeadline = state.decisionDeadline ? Date.parse(state.decisionDeadline) : 0;
  const decisionDeadlineEpoch = Number.isFinite(parsedDeadline) ? parsedDeadline : 0;
  const communityCardsRevealed = state.communityCardsRevealed ?? 0;
  const chuckyActiveOrd = state.chuckyActive ? 1 : 0;
  const chuckyCardsRevealed = state.chuckyCardsRevealed ?? 0;

  return [handNumber, phaseOrdinal, turnSequence, decidedCount, decisionDeadlineEpoch, communityCardsRevealed, chuckyActiveOrd, chuckyCardsRevealed];
}
