import { describe, expect, it } from 'vitest';
import {
  captureHolmAdmittedTransferPresentation,
  canCompleteHolmAllFoldPresentation,
  getHolmPresentationHandKey,
  getHolmPresentationIdentityKey,
  isSameHolmPresentationHand,
  latchHolmPresentationBarrier,
  reconcileHolmPresentationBarrierFromEvidence,
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

  it('captures the admitted H1 transfer identity even if mutable props later advance to H2', () => {
    const first = hand('round-1', 1, 6);
    const second = hand('round-2', 2, 7);
    const captured = captureHolmAdmittedTransferPresentation(
      first,
      first.transferCursor,
      'showdown-replacement-pot',
    );

    expect(captured).toEqual({
      stage: 'showdown-replacement-pot',
      completion: { ...first, stage: 'showdown-replacement-pot' },
    });
    expect(captured.completion && isSameHolmPresentationHand(captured.completion, second)).toBe(false);
  });

  it('reconciles completion evidence whether it arrives before or after the barrier', () => {
    const first = hand('round-1', 1, 6);
    const completion = { ...first, stage: 'chucky-loss' as const };
    const evidence = new Map([[getHolmPresentationIdentityKey(first), completion]]);

    expect(reconcileHolmPresentationBarrierFromEvidence(null, evidence)).toEqual({
      barrier: null,
      completion: null,
      released: false,
    });
    expect(reconcileHolmPresentationBarrierFromEvidence(first, evidence)).toEqual({
      barrier: null,
      completion,
      released: true,
    });
  });

  it('does not release H1 from H2 evidence or a different transfer cursor', () => {
    const first = hand('round-1', 1, 6);
    const hiddenSecond = hand('round-2', 2, 7);
    const wrongCursor = hand('round-1', 1, 8);
    const evidence = new Map([
      [getHolmPresentationIdentityKey(hiddenSecond), { ...hiddenSecond, stage: 'pussy-tax' as const }],
      [getHolmPresentationIdentityKey(wrongCursor), { ...wrongCursor, stage: 'zero-transfer' as const }],
    ]);

    expect(reconcileHolmPresentationBarrierFromEvidence(first, evidence)).toEqual({
      barrier: first,
      completion: null,
      released: false,
    });
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
