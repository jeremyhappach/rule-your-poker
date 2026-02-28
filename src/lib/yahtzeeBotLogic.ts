/**
 * Yahtzee Bot Logic
 * 
 * Simple heuristic bot for Yahtzee:
 * - Evaluates all available categories
 * - After final roll, picks the highest-scoring open category
 * - For intermediate rolls, uses simple hold heuristics
 */

import { YahtzeePlayerState, YahtzeeCategory } from './yahtzeeTypes';
import { getPotentialScores, getAvailableCategories, calculateCategoryScore } from './yahtzeeScoring';

/**
 * Decide which dice to hold between rolls.
 * Simple strategy: find the most frequent value and hold those dice.
 */
export function getBotHoldDecision(state: YahtzeePlayerState): boolean[] {
  const dice = state.dice.map(d => d.value);
  const counts: Record<number, number> = {};
  dice.forEach(v => { counts[v] = (counts[v] || 0) + 1; });

  // Find the value with the most occurrences (prefer higher values on tie)
  let bestValue = 0;
  let bestCount = 0;
  for (let v = 6; v >= 1; v--) {
    if ((counts[v] || 0) > bestCount) {
      bestCount = counts[v] || 0;
      bestValue = v;
    }
  }

  // If we have 3+ of a kind, hold those
  if (bestCount >= 3) {
    return dice.map(d => d === bestValue);
  }

  // Check for straight potential
  const unique = new Set(dice);
  if (unique.size >= 4) {
    // Hold all unique dice for straight attempt
    const seen = new Set<number>();
    return dice.map(d => {
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }

  // Otherwise hold pairs of the highest value
  if (bestCount >= 2) {
    return dice.map(d => d === bestValue);
  }

  // Hold nothing (full reroll)
  return [false, false, false, false, false];
}

/**
 * Choose which category to score.
 * Strategy: pick the category that gives the highest score,
 * with a small bias toward upper section to chase the bonus.
 */
export function getBotCategoryChoice(state: YahtzeePlayerState): YahtzeeCategory {
  const diceValues = state.dice.map(d => d.value);
  const potentials = getPotentialScores(state.scorecard, diceValues);
  const available = getAvailableCategories(state.scorecard);

  if (available.length === 0) {
    return 'chance'; // Shouldn't happen, but fallback
  }

  // Sort by score descending, with preference for non-zero scores
  const scored = available
    .map(cat => ({ cat, score: potentials[cat] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  // If best score is 0, we need to sacrifice a category
  // Prefer sacrificing the lowest-value upper category we haven't filled
  if (scored[0].score === 0) {
    const upperSacrifice = scored.find(s => 
      ['ones', 'twos', 'threes'].includes(s.cat) && s.score === 0
    );
    if (upperSacrifice) return upperSacrifice.cat;
  }

  return scored[0].cat;
}

/**
 * Should the bot stop rolling early?
 * Yes if we have a Yahtzee, large straight, or high-scoring hand.
 */
export function shouldBotStopRolling(state: YahtzeePlayerState): boolean {
  const diceValues = state.dice.map(d => d.value);
  
  // Always stop if all dice are the same (Yahtzee!)
  if (diceValues.every(d => d === diceValues[0])) return true;
  
  // Stop on large straight
  if (calculateCategoryScore('large_straight', diceValues) > 0) return true;
  
  // Stop on full house
  if (calculateCategoryScore('full_house', diceValues) > 0 && state.rollsRemaining <= 1) return true;
  
  return false;
}
