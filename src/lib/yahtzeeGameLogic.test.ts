import { describe, expect, it } from 'vitest';
import { buildYahtzeeScoreTransition } from './yahtzeeGameLogic';
import { ALL_CATEGORIES, type YahtzeePlayerState, type YahtzeeState } from './yahtzeeTypes';

function playerStateWithOpenChance(): YahtzeePlayerState {
  return {
    dice: Array.from({ length: 5 }, () => ({ value: 6, isHeld: false })),
    rollsRemaining: 0,
    isComplete: false,
    scorecard: {
      scores: Object.fromEntries(
        ALL_CATEGORIES
          .filter(category => category !== 'chance')
          .map(category => [category, 0]),
      ),
      yahtzeeBonuses: 0,
    },
  };
}

function completedPlayerState(): YahtzeePlayerState {
  return {
    ...playerStateWithOpenChance(),
    isComplete: true,
    scorecard: {
      scores: Object.fromEntries(ALL_CATEGORIES.map(category => [category, 0])),
      yahtzeeBonuses: 0,
    },
  };
}

function stateForFinalScore(finalActorId: 'human' | 'bot'): YahtzeeState {
  const otherId = finalActorId === 'human' ? 'bot' : 'human';
  return {
    currentTurnPlayerId: finalActorId,
    playerStates: {
      [finalActorId]: playerStateWithOpenChance(),
      [otherId]: completedPlayerState(),
    },
    gamePhase: 'playing',
    turnOrder: ['human', 'bot'],
    currentRound: 13,
  };
}

describe('buildYahtzeeScoreTransition', () => {
  it.each(['human', 'bot'] as const)(
    'persists the final %s score and terminal phase in the same snapshot',
    (finalActorId) => {
      const transition = buildYahtzeeScoreTransition(
        stateForFinalScore(finalActorId),
        finalActorId,
        'chance',
      );

      expect(transition.isTerminalScore).toBe(true);
      expect(transition.scoredState.gamePhase).toBe('playing');
      expect(transition.authoritativeScoreState.gamePhase).toBe('complete');
      expect(transition.authoritativeScoreState.currentTurnPlayerId).toBeNull();
      expect(transition.authoritativeScoreState.playerStates[finalActorId].isComplete).toBe(true);
      expect(transition.authoritativeScoreState.playerStates[finalActorId].scorecard.scores.chance).toBe(30);
    },
  );

  it('preserves the existing two-stage handoff for a nonterminal score', () => {
    const state = stateForFinalScore('human');
    state.playerStates.bot = playerStateWithOpenChance();

    const transition = buildYahtzeeScoreTransition(state, 'human', 'chance');

    expect(transition.isTerminalScore).toBe(false);
    expect(transition.authoritativeScoreState).toBe(transition.scoredState);
    expect(transition.authoritativeScoreState.currentTurnPlayerId).toBe('human');
    expect(transition.advancedState.currentTurnPlayerId).toBe('bot');
  });
});
