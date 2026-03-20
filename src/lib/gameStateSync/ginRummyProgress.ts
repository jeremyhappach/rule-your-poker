/**
 * Gin Rummy progress vector extractor for the anti-regression framework.
 *
 * Vector: [phaseOrdinal, actionCount]
 *
 * - phaseOrdinal: monotonically increases as game advances through phases
 * - actionCount: explicit monotonic counter incremented on every player action
 *
 * Previous vector used discardPileLen which is NON-monotonic (decreases on
 * discard-pile draws), causing the framework to reject valid draw-from-discard
 * snapshots as "regressive" and leaving the UI stuck on stale state.
 */

import type { GinRummyState, GinRummyPhase } from '@/lib/ginRummyTypes';
import type { GetProgressFn } from './types';

const PHASE_ORDER: Record<GinRummyPhase, number> = {
  dealing: 0,
  first_draw: 1,
  playing: 2,
  knocking: 3,
  laying_off: 4,
  scoring: 5,
  complete: 6,
};

export const getGinRummyProgress: GetProgressFn<GinRummyState> = (state) => {
  const phaseOrd = PHASE_ORDER[state.phase] ?? 0;
  const actionCount = state.actionCount ?? 0;

  return [phaseOrd, actionCount];
};
