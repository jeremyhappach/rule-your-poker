/**
 * Yahtzee Bot Logic
 * 
 * Smarter heuristic bot for Yahtzee:
 * - Evaluates all available (open) categories when deciding holds and when to stop
 * - Only stops rolling early when the current hand is already maximal for an open category
 * - Hold decisions target the best open category achievable
 */

import { YahtzeePlayerState, YahtzeeCategory, UPPER_CATEGORIES } from './yahtzeeTypes';
import { getPotentialScores, getAvailableCategories, calculateCategoryScore } from './yahtzeeScoring';

/** Max possible score for a category (used to judge "is this hand already perfect?") */
const MAX_CATEGORY_SCORE: Partial<Record<YahtzeeCategory, number>> = {
  ones: 5,
  twos: 10,
  threes: 15,
  fours: 20,
  fives: 25,
  sixes: 30,
  three_of_a_kind: 30, // 5×6
  four_of_a_kind: 30,  // 5×6
  full_house: 25,
  small_straight: 30,
  large_straight: 40,
  yahtzee: 50,
  chance: 30,
};

/**
 * Decide which dice to hold between rolls.
 * Strategy: look at what open categories exist, then hold dice that
 * best target the highest-value open opportunity.
 */
export function getBotHoldDecision(state: YahtzeePlayerState): boolean[] {
  const dice = state.dice.map(d => d.value);
  const available = getAvailableCategories(state.scorecard);
  const potentials = getPotentialScores(state.scorecard, dice);
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

  // Check if multi-of-a-kind categories are open and worth pursuing
  const multiKindOpen = available.some(c =>
    ['three_of_a_kind', 'four_of_a_kind', 'yahtzee', 'full_house'].includes(c)
  );

  // Check if straight categories are open
  const straightOpen = available.some(c =>
    ['small_straight', 'large_straight'].includes(c)
  );

  // If we have 4+ of a kind and yahtzee is open, go for it
  if (bestCount >= 4 && available.includes('yahtzee')) {
    return dice.map(d => d === bestValue);
  }

  // If we have 3+ of a kind and multi-kind categories are open, hold those
  if (bestCount >= 3 && multiKindOpen) {
    // If full_house is open and we have a pair of another value, hold both sets
    if (available.includes('full_house')) {
      const otherPair = Object.entries(counts).find(
        ([v, c]) => Number(v) !== bestValue && c >= 2
      );
      if (otherPair) {
        const pairValue = Number(otherPair[0]);
        return dice.map(d => d === bestValue || d === pairValue);
      }
    }
    return dice.map(d => d === bestValue);
  }

  // Check for straight potential if straight categories are open
  const unique = new Set(dice);
  if (straightOpen && unique.size >= 4) {
    // Only hold for straight if the unique values form a near-consecutive run
    // (i.e., the span of unique values is at most 5, meaning a straight is achievable)
    const sorted = [...unique].sort((a, b) => a - b);
    const span = sorted[sorted.length - 1] - sorted[0];
    // A valid straight attempt needs span <= 4 (e.g., 2-3-4-5 span=3, 1-3-4-5 span=4)
    // Also check we have at least 3 consecutive values in the run
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < sorted.length; i++) {
      curRun = sorted[i] === sorted[i - 1] + 1 ? curRun + 1 : 1;
      maxRun = Math.max(maxRun, curRun);
    }
    
    if (span <= 4 && maxRun >= 3) {
      // Hold all unique dice for straight attempt
      const seen = new Set<number>();
      return dice.map(d => {
        if (seen.has(d)) return false;
        seen.add(d);
        return true;
      });
    }
  }

  // If upper categories matching our best value are open, hold those
  const upperMap: Record<number, YahtzeeCategory> = {
    1: 'ones', 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes',
  };
  if (bestCount >= 2 && available.includes(upperMap[bestValue])) {
    return dice.map(d => d === bestValue);
  }

  // Hold pairs of the highest value if any multi-kind category is open
  if (bestCount >= 2 && multiKindOpen) {
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
 * 
 * Only stop if the current dice already achieve the maximum possible score
 * for the best available open category. Otherwise keep rolling to improve.
 */
export function shouldBotStopRolling(state: YahtzeePlayerState): boolean {
  const diceValues = state.dice.map(d => d.value);
  const available = getAvailableCategories(state.scorecard);
  
  // Always stop on Yahtzee
  if (diceValues.every(d => d === diceValues[0])) return true;

  // Find the best score among open categories
  const potentials = getPotentialScores(state.scorecard, diceValues);
  let bestCat: YahtzeeCategory | null = null;
  let bestScore = 0;
  for (const cat of available) {
    const s = potentials[cat] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      bestCat = cat;
    }
  }

  if (!bestCat || bestScore === 0) return false;

  // Only stop if we've already hit the max possible for that category
  const maxForCat = MAX_CATEGORY_SCORE[bestCat] ?? 50;
  if (bestScore >= maxForCat) return true;

  // For large straight (40) — already covered above since max is 40
  // For small straight (30) — already covered

  return false;
}
