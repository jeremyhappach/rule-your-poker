/**
 * Debug bot logic: always pursue a large straight.
 * 
 * Deterministic hold pattern for reproducing held-dice ordering swaps.
 * Activated via debug flag: ?debug_yahtzee_straight=1
 * 
 * Strategy:
 * - Always target 1-2-3-4-5 or 2-3-4-5-6 (whichever has more matches)
 * - Hold dice that belong to the target sequence
 * - Never stop early (always use all 3 rolls)
 * - Score large_straight if available, else small_straight, else chance
 */

import { YahtzeePlayerState, YahtzeeCategory } from './yahtzeeTypes';
import { getAvailableCategories, getPotentialScores } from './yahtzeeScoring';

const LOW_STRAIGHT = [1, 2, 3, 4, 5];
const HIGH_STRAIGHT = [2, 3, 4, 5, 6];

function countMatches(dice: number[], target: number[]): number {
  const remaining = [...target];
  let count = 0;
  for (const d of dice) {
    const idx = remaining.indexOf(d);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      count++;
    }
  }
  return count;
}

export function getDebugStraightHoldDecision(state: YahtzeePlayerState): boolean[] {
  const dice = state.dice.map(d => d.value);
  
  // Pick whichever straight has more matches; prefer high on tie
  const lowCount = countMatches(dice, LOW_STRAIGHT);
  const highCount = countMatches(dice, HIGH_STRAIGHT);
  const target = highCount >= lowCount ? HIGH_STRAIGHT : LOW_STRAIGHT;
  
  // Hold dice that match the target (one-to-one matching)
  const remainingTarget = [...target];
  const holds = dice.map(d => {
    const idx = remainingTarget.indexOf(d);
    if (idx >= 0) {
      remainingTarget.splice(idx, 1);
      return true;
    }
    return false;
  });
  
  console.log(`[DEBUG STRAIGHT BOT] dice=${JSON.stringify(dice)} target=${JSON.stringify(target)} holds=${JSON.stringify(holds)}`);
  return holds;
}

export function getDebugStraightCategoryChoice(state: YahtzeePlayerState): YahtzeeCategory {
  const available = getAvailableCategories(state.scorecard);
  const diceValues = state.dice.map(d => d.value);
  const potentials = getPotentialScores(state.scorecard, diceValues);
  
  // Prefer large_straight > small_straight > chance > lowest-scoring available
  if (available.includes('large_straight') && (potentials['large_straight'] ?? 0) > 0) return 'large_straight';
  if (available.includes('small_straight') && (potentials['small_straight'] ?? 0) > 0) return 'small_straight';
  if (available.includes('chance')) return 'chance';
  
  // Fall back to lowest-value available category
  const scored = available
    .map(cat => ({ cat, score: potentials[cat] ?? 0 }))
    .sort((a, b) => a.score - b.score);
  return scored[0]?.cat ?? 'chance';
}

export function shouldDebugStraightStopRolling(_state: YahtzeePlayerState): boolean {
  // Never stop early — always use all 3 rolls to maximize held-dice transitions
  return false;
}
