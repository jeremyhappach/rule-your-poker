/**
 * Yahtzee Game Logic
 * 
 * Pure game logic functions for Yahtzee dice game.
 * Handles dice rolling, holding, and turn management.
 */

import { YahtzeeDie, YahtzeePlayerState, YahtzeeState, YahtzeeCategory } from './yahtzeeTypes';
import { createEmptyScorecard, scoreCategory, isScorecardComplete } from './yahtzeeScoring';

/** Create initial dice (5 unrolled dice) */
export function createInitialYahtzeeDice(): YahtzeeDie[] {
  return Array.from({ length: 5 }, () => ({ value: 0, isHeld: false }));
}

/** Create initial player state */
export function createInitialPlayerState(): YahtzeePlayerState {
  return {
    dice: createInitialYahtzeeDice(),
    rollsRemaining: 3,
    isComplete: false,
    scorecard: createEmptyScorecard(),
  };
}

/** Roll a single die (1-6) */
function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Roll all unheld dice */
export function rollYahtzeeDice(state: YahtzeePlayerState): YahtzeePlayerState {
  if (state.rollsRemaining <= 0) return state;

  const newDice = state.dice.map(die => ({
    value: die.isHeld ? die.value : rollDie(),
    isHeld: die.isHeld,
  }));

  return {
    ...state,
    dice: newDice,
    rollsRemaining: state.rollsRemaining - 1,
    rollKey: (state.rollKey ?? 0) + 1,
  };
}

/** Toggle hold on a die (only between rolls, not before first roll) */
export function toggleYahtzeeHold(state: YahtzeePlayerState, dieIndex: number): YahtzeePlayerState {
  if (state.rollsRemaining === 3 || state.rollsRemaining === 0) return state;

  const newDice = state.dice.map((die, idx) => ({
    ...die,
    isHeld: idx === dieIndex ? !die.isHeld : die.isHeld,
  }));

  return { ...state, dice: newDice };
}

/** Score a category and check if player is done */
export function scoreYahtzeeCategory(
  state: YahtzeePlayerState,
  category: YahtzeeCategory,
): YahtzeePlayerState {
  if (state.rollsRemaining === 3) return state; // Must roll at least once
  if (state.scorecard.scores[category] !== undefined) return state; // Already scored

  const diceValues = state.dice.map(d => d.value);
  const newScorecard = scoreCategory(state.scorecard, category, diceValues);

  return {
    ...state,
    scorecard: newScorecard,
    isComplete: isScorecardComplete(newScorecard),
    // Reset dice for next turn
    dice: createInitialYahtzeeDice(),
    rollsRemaining: 3,
  };
}

/** Advance to the next player's turn. Returns updated YahtzeeState. */
export function advanceYahtzeeTurn(gameState: YahtzeeState): YahtzeeState {
  const { turnOrder, currentTurnPlayerId, playerStates } = gameState;
  
  // Check if all players are complete
  const allComplete = turnOrder.every(pid => playerStates[pid]?.isComplete);
  if (allComplete) {
    return {
      ...gameState,
      currentTurnPlayerId: null,
      gamePhase: 'complete',
    };
  }

  // Find next player who isn't complete
  const currentIdx = turnOrder.indexOf(currentTurnPlayerId || '');
  for (let i = 1; i <= turnOrder.length; i++) {
    const nextIdx = (currentIdx + i) % turnOrder.length;
    const nextPid = turnOrder[nextIdx];
    if (!playerStates[nextPid]?.isComplete) {
      return {
        ...gameState,
        currentTurnPlayerId: nextPid,
      };
    }
  }

  // Shouldn't reach here, but fallback
  return { ...gameState, currentTurnPlayerId: null, gamePhase: 'complete' };
}
