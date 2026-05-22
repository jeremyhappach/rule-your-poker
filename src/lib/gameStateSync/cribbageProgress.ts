/**
 * Cribbage progress vector extractor for the anti-regression framework.
 *
 * Vector (Phase C-prereq, 5-dim):
 *   [handNumber, dealerSelectionCohort, dealerResolved, phaseOrdinal, subPhase]
 *
 * Dimensions (left to right, most significant first):
 *
 *   1. handNumber — match-level monotonic counter. Increments each hand so that
 *      new-hand snapshots (where phase and sub-counters reset) are always treated
 *      as forward progress.
 *
 *   2. dealerSelectionCohort — monotonic per-tie-redraw counter. Increments on
 *      each high-card-draw retry so identity boundaries are clean across ties.
 *      Existing snapshots without the field default to 0, preserving backward
 *      compatibility with pre-Phase-C state.
 *
 *   3. dealerResolved — latch dimension. 0 while phase === 'dealer-select',
 *      1 once the dealer has been definitively chosen and lifecycle has
 *      advanced. Provides forward progress within a cohort even before the
 *      phase ordinal advances. Existing snapshots (phase !== 'dealer-select')
 *      default to 1 — the dealer is implicitly resolved.
 *
 *   4. phaseOrdinal — monotonically increases through the hand lifecycle:
 *      dealer-select=-1, dealing=0, discarding=1, cutting=2, pegging=3,
 *      counting=4, complete=5. The negative dealer-select ordinal preserves
 *      ordering against legacy snapshots that started at `dealing=0`.
 *
 *   5. subPhase — composite intra-phase progress metric:
 *      (playedCards * 1000) + (totalDiscarded * 100) + (cribSize * 10) + totalScore
 *
 * Pegging/counting/match-end dims are intentionally NOT yet included —
 * they will land before their respective surface migrations (per
 * "structural prerequisites for clean canonical migration" rule).
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
}

/**
 * Extract a monotonic progress vector from Cribbage state.
 */
export function getCribbageProgress(
  state: CribbageStateForProgress | null,
  handNumber?: number,
): ProgressVector {
  if (!state) return [0, 0, 0, 0, 0];

  const handNum = handNumber ?? (state as any).handNumber ?? 1;
  const cohort = state.dealerSelectionCohort ?? 0;
  // Default-true semantics: legacy snapshots (phase !== 'dealer-select') are
  // implicitly resolved. Explicit `dealerResolved === false` overrides only
  // when phase is dealer-select.
  const resolved = state.phase === 'dealer-select'
    ? (state.dealerResolved ? 1 : 0)
    : (state.dealerResolved === false ? 0 : 1);
  const phaseOrd = PHASE_ORDER[state.phase] ?? 0;

  const playedCards = state.pegging?.playedCards?.length ?? 0;
  const cribSize = state.crib?.length ?? 0;

  let totalDiscarded = 0;
  let totalScore = 0;
  for (const ps of Object.values(state.playerStates ?? {})) {
    totalDiscarded += ps.discardedToCrib?.length ?? 0;
    totalScore += ps.pegScore ?? 0;
  }

  const subPhase = playedCards * 1000 + totalDiscarded * 100 + cribSize * 10 + totalScore;

  return [handNum, cohort, resolved, phaseOrd, subPhase];
}

/** Convenience typed version for the sync framework config. */
export const getCribbageProgressFn: GetProgressFn<CribbageState> = (state) => {
  return getCribbageProgress(state);
};
