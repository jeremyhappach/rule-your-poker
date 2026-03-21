/**
 * Cribbage progress vector extractor for the anti-regression framework.
 *
 * Vector: [handNumber, phaseOrdinal, subPhase]
 *
 * Dimensions (left to right, most significant first):
 *
 *   1. handNumber — match-level monotonic counter. Increments each hand so that
 *      new-hand snapshots (where phase and sub-counters reset) are always treated
 *      as forward progress. Cribbage creates a new roundId per hand which provides
 *      structural mitigation, but we still need handNumber for match-level
 *      monotonicity within a single sync framework lifecycle.
 *
 *   2. phaseOrdinal — monotonically increases through the hand lifecycle:
 *      dealing=0, discarding=1, cutting=2, pegging=3, counting=4, complete=5
 *
 *   3. subPhase — composite intra-phase progress metric:
 *      (playedCards * 1000) + (totalDiscarded * 100) + (cribSize * 10) + totalScore
 *      This ensures every meaningful action within a phase produces forward progress.
 *
 * Hand boundary handling:
 *   Cribbage creates a NEW roundId per hand, so the sync framework's reset()
 *   is called on roundId change. However, handNumber is still included because:
 *   - It's the correct architectural pattern (match-level monotonicity)
 *   - It protects against any delayed cross-hand snapshot delivery
 *   - It matches the Gin Rummy and Yahtzee progress vector design
 */

import type { CribbageState, CribbagePhase } from '@/lib/cribbageTypes';
import type { GetProgressFn, ProgressVector } from './types';

const PHASE_ORDER: Record<CribbagePhase, number> = {
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
}

/**
 * Extract a monotonic progress vector from Cribbage state.
 *
 * @param state The cribbage state snapshot
 * @param handNumber The match-level hand number (from round record, not from state)
 */
export function getCribbageProgress(
  state: CribbageStateForProgress | null,
  handNumber?: number,
): ProgressVector {
  if (!state) return [0, 0, 0];

  const handNum = handNumber ?? (state as any).handNumber ?? 1;
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

  return [handNum, phaseOrd, subPhase];
}

/** Convenience typed version for the sync framework config. */
export const getCribbageProgressFn: GetProgressFn<CribbageState> = (state) => {
  return getCribbageProgress(state);
};
