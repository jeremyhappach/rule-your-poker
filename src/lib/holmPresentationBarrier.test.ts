import { describe, expect, it } from 'vitest';
import {
  canCompleteHolmAllFoldPresentation,
  getHolmPresentationHandKey,
  latchHolmPresentationBarrier,
  releaseHolmPresentationBarrier,
  shouldHoldHolmAuthoritativeSuccessor,
  type HolmPresentationIdentity,
} from './holmPresentationBarrier';

const hand = (
  roundId: string,
  handNumber: number,
  transferCursor: number,
): HolmPresentationIdentity => ({
  dealerGameId: 'dealer-game',
  roundId,
  handNumber,
  transferCursor,
});

describe('Holm presented-hand barrier', () => {
  it('latches only a hand this client observed in presented live betting', () => {
    const first = hand('round-1', 1, 2);
    expect(latchHolmPresentationBarrier({
      current: null,
      presented: first,
      observedLive: false,
      alreadyReleased: false,
      roundCompleted: true,
      hasResult: true,
    })).toBeNull();

    expect(latchHolmPresentationBarrier({
      current: null,
      presented: first,
      observedLive: true,
      alreadyReleased: false,
      roundCompleted: true,
      hasResult: true,
    })).toEqual(first);
  });

  it('never lets hidden H2 overwrite an active H1 predecessor', () => {
    const first = hand('round-1', 1, 2);
    const hiddenSecond = hand('round-2', 2, 3);
    expect(latchHolmPresentationBarrier({
      current: first,
      presented: hiddenSecond,
      observedLive: true,
      alreadyReleased: false,
      roundCompleted: true,
      hasResult: true,
    })).toEqual(first);
  });

  it('holds the authoritative successor while its exact predecessor is presented', () => {
    const first = hand('round-1', 1, 2);
    expect(shouldHoldHolmAuthoritativeSuccessor({
      barrier: first,
      presentedRoundId: first.roundId,
      incoming: hand('round-2', 2, 3),
    })).toBe(true);
  });

  it('rejects a completion from hidden H2 and releases only exact H1', () => {
    const first = hand('round-1', 1, 2);
    const hiddenSecond = hand('round-2', 2, 3);

    expect(releaseHolmPresentationBarrier(first, {
      ...hiddenSecond,
      stage: 'pussy-tax',
    })).toEqual({ barrier: first, released: false });

    expect(releaseHolmPresentationBarrier(first, {
      ...first,
      stage: 'pussy-tax',
    })).toEqual({ barrier: null, released: true });
  });

  it('cannot relatch an already released presentation hand', () => {
    const first = hand('round-1', 1, 2);
    const released = new Set([getHolmPresentationHandKey(first)]);
    expect(latchHolmPresentationBarrier({
      current: null,
      presented: first,
      observedLive: true,
      alreadyReleased: released.has(getHolmPresentationHandKey(first)),
      roundCompleted: true,
      hasResult: true,
    })).toBeNull();
  });

  it('joins Rabbit Hunt paint/reveal and Pussy Tax settlement in either arrival order', () => {
    const base = {
      result: 'Pussy Tax!',
      resultPainted: true,
      rabbitHuntRequired: true,
      rabbitRevealComplete: false,
      pussyTaxSettled: true,
    };
    expect(canCompleteHolmAllFoldPresentation(base)).toBe(false);
    expect(canCompleteHolmAllFoldPresentation({
      ...base,
      rabbitRevealComplete: true,
      pussyTaxSettled: false,
    })).toBe(false);
    expect(canCompleteHolmAllFoldPresentation({
      ...base,
      rabbitRevealComplete: true,
    })).toBe(true);
  });

  it('completes no-penalty all-fold without inventing a transfer', () => {
    expect(canCompleteHolmAllFoldPresentation({
      result: 'Everyone folded! No penalty.',
      resultPainted: true,
      rabbitHuntRequired: true,
      rabbitRevealComplete: true,
      pussyTaxSettled: false,
    })).toBe(true);
  });
});
