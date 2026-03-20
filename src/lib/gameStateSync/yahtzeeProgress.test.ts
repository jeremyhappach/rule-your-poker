import { describe, expect, it } from 'vitest';

import { compareProgress } from './stateProgress';
import { getYahtzeeProgress } from './yahtzeeProgress';
import { ALL_CATEGORIES, type YahtzeeCategory, type YahtzeePlayerState, type YahtzeeState } from '@/lib/yahtzeeTypes';

function buildPlayerState(filledCount: number, rollsRemaining = 3, isComplete = false): YahtzeePlayerState {
  const scores: Partial<Record<YahtzeeCategory, number>> = {};
  ALL_CATEGORIES.slice(0, filledCount).forEach((category, index) => {
    scores[category] = index + 1;
  });

  return {
    dice: Array.from({ length: 5 }, () => ({ value: 0, isHeld: false })),
    rollsRemaining,
    isComplete,
    scorecard: {
      scores,
      yahtzeeBonuses: 0,
    },
  };
}

describe('getYahtzeeProgress', () => {
  it('treats the only remaining player final-turn roll as forward progress', () => {
    const turnStart: YahtzeeState = {
      gamePhase: 'playing',
      currentTurnPlayerId: 'p2',
      turnOrder: ['p1', 'p2'],
      currentRound: 13,
      playerStates: {
        p1: buildPlayerState(13, 3, true),
        p2: buildPlayerState(12, 3, false),
      },
    };

    const rolled: YahtzeeState = {
      ...turnStart,
      playerStates: {
        ...turnStart.playerStates,
        p2: {
          ...turnStart.playerStates.p2,
          dice: [1, 3, 4, 6, 6].map((value) => ({ value, isHeld: false })),
          rollsRemaining: 2,
          rollKey: 1,
        },
      },
    };

    expect(compareProgress(getYahtzeeProgress(turnStart), getYahtzeeProgress(rolled))).toBe(1);
  });

  it('treats scored-then-advanced handoff as forward when completed players are skipped', () => {
    const scoredBeforeHandoff: YahtzeeState = {
      gamePhase: 'playing',
      currentTurnPlayerId: 'p1',
      turnOrder: ['p1', 'p2'],
      currentRound: 13,
      playerStates: {
        p1: buildPlayerState(13, 3, true),
        p2: buildPlayerState(12, 3, false),
      },
    };

    const advancedToRemainingPlayer: YahtzeeState = {
      ...scoredBeforeHandoff,
      currentTurnPlayerId: 'p2',
    };

    expect(compareProgress(getYahtzeeProgress(scoredBeforeHandoff), getYahtzeeProgress(advancedToRemainingPlayer))).toBe(1);
  });
});