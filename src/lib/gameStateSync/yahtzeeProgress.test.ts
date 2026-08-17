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

  it('includes the server action sequence before the per-player and volatile dimensions', () => {
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
    const vector = getYahtzeeProgress({ ...state, actionSequence: 7 });
    expect(vector).toHaveLength(8);
    expect(vector.slice(0, 3)).toEqual([0, 1, 7]);
  });

  it('treats a committed hold toggle as forward progress', () => {
    const before: YahtzeeState = {
      gamePhase: 'playing',
      currentTurnPlayerId: 'p1',
      turnOrder: ['p1', 'p2'],
      currentRound: 1,
      actionSequence: 3,
      playerStates: {
        p1: buildPlayerState(0, 2, false),
        p2: buildPlayerState(0, 3, false),
      },
    };
    const after: YahtzeeState = {
      ...before,
      actionSequence: 4,
      playerStates: {
        ...before.playerStates,
        p1: {
          ...before.playerStates.p1,
          dice: before.playerStates.p1.dice.map((die, index) => ({
            ...die,
            isHeld: index === 0,
          })),
        },
      },
    };
    expect(compareProgress(getYahtzeeProgress(before), getYahtzeeProgress(after))).toBe(1);
  });

  it('stamped __syncRound dominates lower dims across match boundary', () => {
    // Prior match terminal snapshot: 26 categories filled, complete phase.
    const priorMatchTerminal = {
      gamePhase: 'complete' as const,
      currentTurnPlayerId: null,
      turnOrder: ['p1', 'p2'],
      currentRound: 13,
      playerStates: {
        p1: buildPlayerState(13, 3, true),
        p2: buildPlayerState(13, 3, true),
      },
      __syncRound: 1,
    };

    // Fresh next-match first snapshot: 0 categories, waiting phase, but
    // __syncRound=2. Without the roundOrd dim this would be regressive on
    // every lower dim. With the stamp, it MUST be forward.
    const nextMatchFirst = {
      gamePhase: 'waiting' as const,
      currentTurnPlayerId: null,
      turnOrder: ['p1', 'p2'],
      currentRound: 1,
      playerStates: {
        p1: buildPlayerState(0, 3, false),
        p2: buildPlayerState(0, 3, false),
      },
      __syncRound: 2,
    };

    expect(compareProgress(getYahtzeeProgress(priorMatchTerminal), getYahtzeeProgress(nextMatchFirst))).toBe(1);
  });

  it('unstamped snapshot falls back to roundOrd=0 (legacy behavior preserved)', () => {
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
    expect(getYahtzeeProgress(state)[0]).toBe(0);
  });
});
