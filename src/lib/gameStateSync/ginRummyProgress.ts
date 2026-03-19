/**
 * Gin Rummy progress vector extractor for the anti-regression framework.
 *
 * Vector: [phaseOrdinal, totalCardsPlayed, discardPileLen, handSizeSum]
 *
 * - phaseOrdinal: monotonically increases as game advances through phases
 * - totalCardsPlayed: sum of actions that have occurred (draws + discards)
 * - discardPileLen: grows with discards, shrinks with discard-draws (secondary signal)
 * - handSizeSum: total cards across both players (changes on draw/discard)
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

  // Total cards in all player hands — changes on every draw/discard
  let handSizeSum = 0;
  for (const ps of Object.values(state.playerStates)) {
    handSizeSum += ps.hand?.length ?? 0;
  }

  const discardLen = state.discardPile?.length ?? 0;
  const stockLen = state.stockPile?.length ?? 0;

  // A composite counter: as the game progresses, cards move from stock → hands → discard.
  // Total cards dealt from stock is a monotonic-ish measure of progress within a phase.
  // Initial stock is 31 (52 - 10 - 10 - 1 upcard), so cardsDealtFromStock = 31 - stockLen.
  const cardsDealtFromStock = Math.max(0, 31 - stockLen);

  return [phaseOrd, cardsDealtFromStock, discardLen, handSizeSum];
};
