import { describe, expect, it } from 'vitest';
import {
  revealDealerBubbleOrientation,
  revealStackDepthPx,
  reconcileThreeFiveSevenDecisionRevealClock,
  shouldRetireThreeFiveSevenFoldedSeatCardBacks,
} from '@/lib/threeFiveSeven/decisionReveal';

describe('3-5-7 dedicated reveal-stack geometry', () => {
  it('keeps 3, 5, and 7 cards essentially one card-sized object', () => {
    expect(revealStackDepthPx(3)).toBe(2);
    expect(revealStackDepthPx(5)).toBe(4);
    expect(revealStackDepthPx(7)).toBe(6);
  });

  it('selects the canonical self endpoint only for a local dealer', () => {
    expect(revealDealerBubbleOrientation('user-1', 'user-1')).toBe('local');
    expect(revealDealerBubbleOrientation('user-2', 'user-1')).toBe('remote');
  });
});

describe('3-5-7 folded seat-card-back cleanup', () => {
  const hiddenIncomplete = {
    decisionRevealRoundActive: false,
    resultPresentationVisible: false,
  };

  it('keeps folded backs mounted while decisions are hidden or incomplete', () => {
    expect(shouldRetireThreeFiveSevenFoldedSeatCardBacks({
      folded: true,
      ...hiddenIncomplete,
    })).toBe(false);
  });

  it('retires every folded seat after the exact reveal or result boundary', () => {
    const players = [
      { folded: true },
      { folded: true },
      { folded: false },
    ];

    expect(players.map((player) => shouldRetireThreeFiveSevenFoldedSeatCardBacks({
      ...player,
      decisionRevealRoundActive: true,
      resultPresentationVisible: false,
    }))).toEqual([true, true, false]);

    expect(shouldRetireThreeFiveSevenFoldedSeatCardBacks({
      folded: true,
      decisionRevealRoundActive: false,
      resultPresentationVisible: true,
    })).toBe(true);
  });

  it('supports reconnect/replay reconstruction without a live reveal clock', () => {
    expect(shouldRetireThreeFiveSevenFoldedSeatCardBacks({
      folded: true,
      decisionRevealRoundActive: false,
      resultPresentationVisible: true,
    })).toBe(true);
  });

  it('releases the old reveal identity so a new round can deal ordinary backs', () => {
    const oldClock = {
      window: {
        id: 'dealer-1:round-1', gameId: 'game-1', dealerGameId: 'dealer-1',
        roundId: 'round-1', handNumber: 1, roundNumber: 3,
        startedAtMs: 0, countdownAtMs: 1000, dropAtMs: 3700,
        endsAtMs: 5300, continuationAtMs: 9300,
      },
      serverOffsetMs: 0,
    };
    const nextClock = reconcileThreeFiveSevenDecisionRevealClock(oldClock, null, 0, 'round-2');
    expect(nextClock).toBeNull();
    expect(shouldRetireThreeFiveSevenFoldedSeatCardBacks({
      folded: false,
      decisionRevealRoundActive: nextClock !== null,
      resultPresentationVisible: false,
    })).toBe(false);
  });
});
