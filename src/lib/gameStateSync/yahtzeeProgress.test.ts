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

  it('treats equal-parity turn handoff from higher index to lower index as forward (not regressive)', () => {
    // This is the exact bug scenario: human (index 1) scores, both players
    // now have equal filled counts, turn advances to bot (index 0).
    // Previously the turnOwnerIndex dimension (1→0) caused false regression.

    // Human just scored their 1st category, bot has 1 category too.
    // Scored snapshot before handoff: human is current, has 2 filled, bot has 1.
    const scoredBeforeHandoff: YahtzeeState = {
      gamePhase: 'playing',
      currentTurnPlayerId: 'human',  // index 1
      turnOrder: ['bot', 'human'],
      currentRound: 2,
      playerStates: {
        bot: buildPlayerState(1, 3, false),
        human: buildPlayerState(2, 3, false),
      },
    };

    // Turn advances to bot: bot has 1 filled, human has 2.
    const advancedToBot: YahtzeeState = {
      ...scoredBeforeHandoff,
      currentTurnPlayerId: 'bot',  // index 0 — wraps DOWN
    };

    const before = getYahtzeeProgress(scoredBeforeHandoff);
    const after = getYahtzeeProgress(advancedToBot);

    // handoffPhase should handle this: scored snapshot has handoffPhase=0,
    // advanced snapshot has handoffPhase=1, so it's forward.
    expect(compareProgress(before, after)).toBe(1);
  });

  it('vector has exactly 4 dimensions (no turnOwnerIndex)', () => {
    const state: YahtzeeState = {
      gamePhase: 'playing',
      currentTurnPlayerId: 'p1',
      turnOrder: ['p1', 'p2'],
      currentRound: 1,
      playerStates: {
        p1: buildPlayerState(0, 3, false),
        p2: buildPlayerState(0, 3, false),
      },
    };
    expect(getYahtzeeProgress(state)).toHaveLength(4);
  });
});
