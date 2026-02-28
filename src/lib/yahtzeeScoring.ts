/**
 * Yahtzee Scoring Logic
 * 
 * Pure functions for calculating scores in each category.
 * No side effects, fully testable.
 */

import {
  YahtzeeCategory,
  YahtzeeScorecard,
  UPPER_CATEGORIES,
  ALL_CATEGORIES,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_VALUE,
} from './yahtzeeTypes';

/** Count occurrences of each die value (1-6) */
function getCounts(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  dice.forEach(v => counts[v]++);
  return counts;
}

/** Calculate the score for a given category with the given dice */
export function calculateCategoryScore(category: YahtzeeCategory, dice: number[]): number {
  const counts = getCounts(dice);
  const values = Object.values(counts);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (category) {
    // Upper section: sum of matching dice
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;

    // Lower section
    case 'three_of_a_kind':
      return values.some(c => c >= 3) ? sum : 0;

    case 'four_of_a_kind':
      return values.some(c => c >= 4) ? sum : 0;

    case 'full_house':
      return (values.includes(3) && values.includes(2)) ? 25 : 0;

    case 'small_straight': {
      // Need 4 consecutive: 1-2-3-4, 2-3-4-5, or 3-4-5-6
      const unique = new Set(dice);
      const straights = [[1,2,3,4], [2,3,4,5], [3,4,5,6]];
      return straights.some(s => s.every(v => unique.has(v))) ? 30 : 0;
    }

    case 'large_straight': {
      // Need 5 consecutive: 1-2-3-4-5 or 2-3-4-5-6
      const sorted = [...new Set(dice)].sort((a, b) => a - b);
      if (sorted.length !== 5) return 0;
      const isConsecutive = sorted[4] - sorted[0] === 4;
      return isConsecutive ? 40 : 0;
    }

    case 'yahtzee':
      return values.some(c => c === 5) ? 50 : 0;

    case 'chance':
      return sum;

    default:
      return 0;
  }
}

/** Check if dice contain a Yahtzee (all 5 same) */
export function isYahtzee(dice: number[]): boolean {
  return dice.every(d => d === dice[0]);
}

/** Get all available (unscored) categories for a scorecard */
export function getAvailableCategories(scorecard: YahtzeeScorecard): YahtzeeCategory[] {
  return ALL_CATEGORIES.filter(cat => scorecard.scores[cat] === undefined);
}

/** Check if scorecard is complete (all 13 filled) */
export function isScorecardComplete(scorecard: YahtzeeScorecard): boolean {
  return getAvailableCategories(scorecard).length === 0;
}

/** Calculate upper section subtotal */
export function getUpperSubtotal(scorecard: YahtzeeScorecard): number {
  return UPPER_CATEGORIES.reduce((sum, cat) => sum + (scorecard.scores[cat] ?? 0), 0);
}

/** Check if upper bonus is earned (>= 63 in upper section) */
export function hasUpperBonus(scorecard: YahtzeeScorecard): boolean {
  return getUpperSubtotal(scorecard) >= UPPER_BONUS_THRESHOLD;
}

/** Calculate total score including upper bonus and Yahtzee bonuses */
export function getTotalScore(scorecard: YahtzeeScorecard): number {
  let total = 0;

  // Sum all scored categories
  for (const cat of ALL_CATEGORIES) {
    total += scorecard.scores[cat] ?? 0;
  }

  // Upper bonus
  if (hasUpperBonus(scorecard)) {
    total += UPPER_BONUS_VALUE;
  }

  // Yahtzee bonuses (100 each)
  total += scorecard.yahtzeeBonuses * 100;

  return total;
}

/** 
 * Score a category, handling Yahtzee bonus rules.
 * Returns the updated scorecard.
 * 
 * Yahtzee Bonus Rules:
 * - If you roll a Yahtzee and the Yahtzee category already has 50, you get +100 bonus
 *   AND must score in the matching upper category (or any open category if upper is filled)
 * - If Yahtzee category has 0 (was scratched), no bonus
 */
export function scoreCategory(
  scorecard: YahtzeeScorecard,
  category: YahtzeeCategory,
  dice: number[],
): YahtzeeScorecard {
  const newScorecard = {
    scores: { ...scorecard.scores },
    yahtzeeBonuses: scorecard.yahtzeeBonuses,
  };

  // Check for Yahtzee bonus
  if (isYahtzee(dice) && scorecard.scores.yahtzee === 50) {
    newScorecard.yahtzeeBonuses += 1;
  }

  // Score the chosen category
  const score = calculateCategoryScore(category, dice);
  newScorecard.scores[category] = score;

  return newScorecard;
}

/** 
 * Get potential scores for all available categories (preview what you'd get).
 * Returns a map of category -> potential score.
 */
export function getPotentialScores(
  scorecard: YahtzeeScorecard,
  dice: number[],
): Partial<Record<YahtzeeCategory, number>> {
  const available = getAvailableCategories(scorecard);
  const potentials: Partial<Record<YahtzeeCategory, number>> = {};

  for (const cat of available) {
    potentials[cat] = calculateCategoryScore(cat, dice);
  }

  return potentials;
}

/** Create a fresh empty scorecard */
export function createEmptyScorecard(): YahtzeeScorecard {
  return {
    scores: {},
    yahtzeeBonuses: 0,
  };
}
