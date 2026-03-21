/**
 * Gin Rummy progress vector extractor for the anti-regression framework.
 *
 * Vector: [handNumber, phaseOrdinal, actionCount]
 *
 * - handNumber: match-level monotonic counter — increments each hand so that
 *   new-hand snapshots (where phase and actionCount reset) are always treated
 *   as forward progress by the sync framework.
 * - phaseOrdinal: monotonically increases as game advances through phases
 *   within a single hand.
 * - actionCount: explicit monotonic counter incremented on every player action
 *   within a single hand.
 *
 * Previous vector [phaseOrdinal, actionCount] lacked a match-level dimension,
 * causing the framework to reject valid new-hand snapshots as "regressive"
 * after the terminal complete phase of the prior hand.
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
  const handNum = state.handNumber ?? 1;
  const phaseOrd = PHASE_ORDER[state.phase] ?? 0;
  const actionCount = state.actionCount ?? 0;

  return [handNum, phaseOrd, actionCount];
};
