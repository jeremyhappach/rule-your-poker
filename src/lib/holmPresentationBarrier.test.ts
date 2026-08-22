import { describe, expect, it } from 'vitest';
import {
  captureHolmAdmittedTransferPresentation,
  canCompleteHolmAllFoldPresentation,
  classifyHolmRouteEntryMode,
  getHolmPresentationHandKey,
  getHolmPresentationIdentityKey,
  getHolmShowdownDurablePresentationAction,
  getHolmShowdownPresentationCursors,
  isHolmPreHandRouteStatus,
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

describe('Holm route-entry provenance', () => {
  const first = {
    dealerGameId: 'dealer-game-1',
    roundId: 'round-1',
    handNumber: 1,
  };

  it('arms only during phases that precede an active dealer-game hand', () => {
    expect([
      'waiting',
      'waiting_for_players',
      'dealer_selection',
      'game_selection',
      'configuring',
      'ante_decision',
    ].every(isHolmPreHandRouteStatus)).toBe(true);
    expect(isHolmPreHandRouteStatus('in_progress')).toBe(false);
    expect(isHolmPreHandRouteStatus('game_over')).toBe(false);
    expect(isHolmPreHandRouteStatus('session_ended')).toBe(false);
  });

  it('treats DG1H1 created after this route observed ante as live', () => {
    expect(classifyHolmRouteEntryMode({
      baseline: first,
      current: first,
      roundStatus: 'betting',
      observedPreHandLifecycle: true,
    })).toBe('live-transition');
  });

  it('keeps a cold mount into an already-active H1 historical', () => {
    expect(classifyHolmRouteEntryMode({
      baseline: first,
      current: first,
      roundStatus: 'betting',
      observedPreHandLifecycle: false,
    })).toBe('historical-entry');
  });

  it('treats later hands and dealer games as live identity transitions', () => {
    expect(classifyHolmRouteEntryMode({
      baseline: first,
      current: { ...first, roundId: 'round-2', handNumber: 2 },
      roundStatus: 'betting',
      observedPreHandLifecycle: false,
    })).toBe('live-transition');
    expect(classifyHolmRouteEntryMode({
      baseline: first,
      current: { dealerGameId: 'dealer-game-2', roundId: 'round-3', handNumber: 1 },
      roundStatus: 'betting',
      observedPreHandLifecycle: false,
    })).toBe('live-transition');
  });

  it('preserves the explicit server dealing phase as live', () => {
    expect(classifyHolmRouteEntryMode({
      baseline: first,
      current: first,
      roundStatus: 'dealing',
      observedPreHandLifecycle: false,
    })).toBe('live-transition');
  });
});

describe('Holm presented-hand barrier', () => {
  it('derives the exact adjacent showdown cursors from the final transfer identity', () => {
    expect(getHolmShowdownPresentationCursors(hand('round-1', 1, 12))).toEqual({
      potAwardCursor: 11,
      replacementPotCursor: 12,
    });
    expect(getHolmShowdownPresentationCursors(hand('round-1', 1, 1))).toBeNull();
    expect(getHolmShowdownPresentationCursors(null)).toBeNull();
  });

  it('drains a missed showdown callback from durable exact-cursor receipts', () => {
    expect(getHolmShowdownDurablePresentationAction({
      phase: 'pot-to-winner',
      potAwardCursorState: 'settled',
      replacementPotCursorState: 'queued',
    })).toBe('advance-to-replacement-pot');
    expect(getHolmShowdownDurablePresentationAction({
      phase: 'losers-to-pot',
      potAwardCursorState: 'settled',
      replacementPotCursorState: 'settled',
    })).toBe('complete-replacement-pot');
  });

  it('treats authoritative reconciliation as terminal without replaying money', () => {
    expect(getHolmShowdownDurablePresentationAction({
      phase: 'pot-to-winner',
      potAwardCursorState: 'reconciled',
      replacementPotCursorState: 'reconciled',
    })).toBe('advance-to-replacement-pot');
    expect(getHolmShowdownDurablePresentationAction({
      phase: 'losers-to-pot',
      potAwardCursorState: 'reconciled',
      replacementPotCursorState: 'reconciled',
    })).toBe('complete-replacement-pot');
  });

  it('does not advance from incomplete cursors or the wrong phase', () => {
    for (const state of ['unknown', 'queued', 'running', 'reconciling'] as const) {
      expect(getHolmShowdownDurablePresentationAction({
        phase: 'pot-to-winner',
        potAwardCursorState: state,
        replacementPotCursorState: 'settled',
      })).toBeNull();
    }
    expect(getHolmShowdownDurablePresentationAction({
      phase: 'idle',
      potAwardCursorState: 'settled',
      replacementPotCursorState: 'settled',
    })).toBeNull();
  });

  it('separates stable hand-plan identity from exact transfer completion identity', () => {
    const firstShowdownBatch = hand('round-1', 1, 8);
    const secondShowdownBatch = hand('round-1', 1, 9);
    const nextHand = hand('round-2', 2, 10);

    expect(getHolmPresentationHandKey(firstShowdownBatch))
      .toBe(getHolmPresentationHandKey(secondShowdownBatch));
    expect(getHolmPresentationIdentityKey(firstShowdownBatch))
      .not.toBe(getHolmPresentationIdentityKey(secondShowdownBatch));
    expect(getHolmPresentationHandKey(nextHand))
      .not.toBe(getHolmPresentationHandKey(firstShowdownBatch));
  });

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
      rabbitPostRevealDwellComplete: false,
      pussyTaxSettled: true,
    };
    expect(canCompleteHolmAllFoldPresentation(base)).toBe(false);
    expect(canCompleteHolmAllFoldPresentation({
      ...base,
      rabbitRevealComplete: true,
      rabbitPostRevealDwellComplete: true,
      pussyTaxSettled: false,
    })).toBe(false);
    expect(canCompleteHolmAllFoldPresentation({
      ...base,
      rabbitRevealComplete: true,
      rabbitPostRevealDwellComplete: true,
    })).toBe(true);
  });

  it('holds next-hand continuation during the post-Rabbit reading dwell', () => {
    expect(canCompleteHolmAllFoldPresentation({
      result: 'Pussy Tax!',
      resultPainted: true,
      rabbitHuntRequired: true,
      rabbitRevealComplete: true,
      rabbitPostRevealDwellComplete: false,
      pussyTaxSettled: true,
    })).toBe(false);
  });

  it('completes no-penalty all-fold without inventing a transfer', () => {
    expect(canCompleteHolmAllFoldPresentation({
      result: 'Everyone folded! No penalty.',
      resultPainted: true,
      rabbitHuntRequired: true,
      rabbitRevealComplete: true,
      rabbitPostRevealDwellComplete: true,
      pussyTaxSettled: false,
    })).toBe(true);
  });
});
