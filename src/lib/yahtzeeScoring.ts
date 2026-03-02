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
  LOWER_CATEGORIES,
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
  const rolledYahtzee = isYahtzee(dice) && dice[0] !== 0;
  if (rolledYahtzee && scorecard.scores.yahtzee === 50) {
    newScorecard.yahtzeeBonuses += 1;
  }

  // Use Joker scoring for lower categories when applicable
  const jokerActive = rolledYahtzee && scorecard.scores.yahtzee === 50;
  const score = jokerActive ? getJokerScore(category, dice) : calculateCategoryScore(category, dice);
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

/**
 * Official Yahtzee Joker Rules:
 * When rolling a Yahtzee and the Yahtzee category already has 50 (bonus earned):
 * 1. Must score in the matching upper category (e.g., all 3s → Threes) if open
 * 2. If that upper category is filled, may score in ANY open lower category with full value
 *    (Full House = 25, Sm Straight = 30, Lg Straight = 40 regardless of dice)
 * 3. If all lower categories are filled, may score in any open upper category (normal score)
 * 4. If Yahtzee was scratched (scored 0), no bonus and normal rules apply
 */
export function getJokerValidCategories(
  scorecard: YahtzeeScorecard,
  dice: number[],
): YahtzeeCategory[] | null {
  // Only applies when dice are a Yahtzee AND the Yahtzee category already has 50
  if (!isYahtzee(dice) || dice[0] === 0) return null;
  if (scorecard.scores.yahtzee !== 50) return null;

  const available = getAvailableCategories(scorecard);
  const matchingUpper = UPPER_CATEGORIES[dice[0] - 1]; // ones=0, twos=1, etc.

  // Rule 1: Must use matching upper if open
  if (available.includes(matchingUpper)) {
    return [matchingUpper];
  }

  // Rule 2: Any open lower category (with forced full value — handled in scoreJokerCategory)
  const openLower = available.filter(c => LOWER_CATEGORIES.includes(c));
  if (openLower.length > 0) return openLower;

  // Rule 3: Any open upper category
  const openUpper = available.filter(c => UPPER_CATEGORIES.includes(c));
  if (openUpper.length > 0) return openUpper;

  return available; // fallback
}

/**
 * Score a Joker Yahtzee in a lower category with forced full values.
 * Per official rules, when using a Joker in lower section:
 * Full House = 25, Small Straight = 30, Large Straight = 40, regardless of dice.
 */
export function getJokerScore(category: YahtzeeCategory, dice: number[]): number {
  switch (category) {
    case 'full_house': return 25;
    case 'small_straight': return 30;
    case 'large_straight': return 40;
    default: return calculateCategoryScore(category, dice);
  }
}

/** Create a fresh empty scorecard */
export function createEmptyScorecard(): YahtzeeScorecard {
  return {
    scores: {},
    yahtzeeBonuses: 0,
  };
}
