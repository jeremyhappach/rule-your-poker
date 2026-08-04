/**
 * Cribbage progress vector extractor for the anti-regression framework.
 *
 * Vector (Phase E-prereq, 8-dim):
 *   [matchCompleteLatch, handNumber, dealerSelectionCohort, dealerResolved,
 *    phaseOrdinal, peggingEventSequence, countingProgress, subPhase]
 *
 *   1. matchCompleteLatch — terminal latch. 0 until phase first reaches
 *      'complete', 1 thereafter. Top-bit guards reconnecting clients
 *      from regressing out of a terminal snapshot, and provides
 *      canonical `match_win` announcement sequencing a presentation-safe
 *      identity. Reset only at dealerGame boundary.
 *
 *   2. handNumber — match-level monotonic counter.
 *   3. dealerSelectionCohort — monotonic per-tie-redraw counter.
 *   4. dealerResolved — 0 in dealer-select pre-resolution, 1 thereafter.
 *   5. phaseOrdinal — dealer-select=-1, dealing=0, discarding=1,
 *      cutting=2, pegging=3, counting=4, complete=5.
 *   6. subPhase — (playedCards * 1000) + (totalDiscarded * 100) +
 *      (cribSize * 10) + totalScore.
 *
 * Pegging/counting ownership dims (peggingTurnOwner, peggingTurnSeq,
 * countOwner, handCompleteLatch) are intentionally NOT yet included —
 * they will land before their respective surface migrations.
 */

import type { CribbageState, CribbagePhase } from '@/lib/cribbageTypes';
import type { GetProgressFn, ProgressVector } from './types';

const PHASE_ORDER: Record<CribbagePhase, number> = {
  'dealer-select': -1,
  dealing: 0,
  discarding: 1,
  cutting: 2,
  pegging: 3,
  counting: 4,
  complete: 5,
};

export interface CribbageStateForProgress {
  phase: CribbagePhase;
  pegging: {
    playedCards: unknown[];
    eventSequence?: number;
  };
  crib: unknown[];
  playerStates: Record<string, {
    discardedToCrib?: unknown[];
    pegScore?: number;
  }>;
  /** Match-level hand number — must be provided by the caller. */
  handNumber?: number;
  /** Phase C prereq: monotonic tie-redraw cohort counter. */
  dealerSelectionCohort?: number;
  /** Phase C prereq: latch — true once dealer has been resolved. */
  dealerResolved?: boolean;
  /** Phase E prereq: terminal latch — true once match has completed. */
  matchCompleteLatch?: boolean;
  countingTargetIndex?: number | null;
  countingBeatIndex?: number | null;
}

/**
 * Extract a monotonic progress vector from Cribbage state.
 */
export function getCribbageProgress(
  state: CribbageStateForProgress | null,
  handNumber?: number,
): ProgressVector {
  if (!state) return [0, 0, 0, 0, 0, 0, 0, 0];

  const handNum = handNumber ?? (state as any).handNumber ?? 1;
  const cohort = state.dealerSelectionCohort ?? 0;
  const resolved = state.phase === 'dealer-select'
    ? (state.dealerResolved ? 1 : 0)
    : (state.dealerResolved === false ? 0 : 1);
  const phaseOrd = PHASE_ORDER[state.phase] ?? 0;
  // Default-true semantics: if phase is 'complete' the latch is implicitly
  // set even if upstream state didn't carry the field (legacy snapshots).
  const matchLatch = state.matchCompleteLatch
    ? 1
    : state.phase === 'complete'
      ? 1
      : 0;

  const playedCards = state.pegging?.playedCards?.length ?? 0;
  const peggingEventSequence = state.pegging?.eventSequence ?? 0;
  const countingTargetIndex = state.phase === 'counting'
    ? (state.countingTargetIndex ?? 0)
    : 0;
  const countingBeatIndex = state.phase === 'counting'
    ? (state.countingBeatIndex ?? -1)
    : -1;
  const countingProgress = (countingTargetIndex * 1000) + (countingBeatIndex + 1);
  const cribSize = state.crib?.length ?? 0;

  let totalDiscarded = 0;
  let totalScore = 0;
  for (const ps of Object.values(state.playerStates ?? {})) {
    totalDiscarded += ps.discardedToCrib?.length ?? 0;
    totalScore += ps.pegScore ?? 0;
  }

  const subPhase = playedCards * 1000 + totalDiscarded * 100 + cribSize * 10 + totalScore;

  return [
    matchLatch,
    handNum,
    cohort,
    resolved,
    phaseOrd,
    peggingEventSequence,
    countingProgress,
    subPhase,
  ];
}

/** Convenience typed version for the sync framework config. */
export const getCribbageProgressFn: GetProgressFn<CribbageState> = (state) => {
  return getCribbageProgress(state);
};
