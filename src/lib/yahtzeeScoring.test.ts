import { describe, it, expect } from 'vitest';
import {
  calculateCategoryScore,
  isYahtzee,
  scoreCategory,
  getTotalScore,
  getUpperSubtotal,
  hasUpperBonus,
  getAvailableCategories,
  isScorecardComplete,
  createEmptyScorecard,
  getPotentialScores,
} from './yahtzeeScoring';

describe('calculateCategoryScore', () => {
  // Upper section
  it('scores ones correctly', () => {
    expect(calculateCategoryScore('ones', [1, 1, 3, 4, 5])).toBe(2);
    expect(calculateCategoryScore('ones', [2, 3, 4, 5, 6])).toBe(0);
  });

  it('scores sixes correctly', () => {
    expect(calculateCategoryScore('sixes', [6, 6, 6, 1, 2])).toBe(18);
  });

  // Lower section
  it('scores three of a kind', () => {
    expect(calculateCategoryScore('three_of_a_kind', [3, 3, 3, 4, 5])).toBe(18);
    expect(calculateCategoryScore('three_of_a_kind', [1, 2, 3, 4, 5])).toBe(0);
  });

  it('scores four of a kind', () => {
    expect(calculateCategoryScore('four_of_a_kind', [4, 4, 4, 4, 2])).toBe(18);
    expect(calculateCategoryScore('four_of_a_kind', [3, 3, 3, 4, 5])).toBe(0);
  });

  it('scores full house', () => {
    expect(calculateCategoryScore('full_house', [3, 3, 3, 5, 5])).toBe(25);
    expect(calculateCategoryScore('full_house', [3, 3, 3, 3, 5])).toBe(0);
  });

  it('scores small straight', () => {
    expect(calculateCategoryScore('small_straight', [1, 2, 3, 4, 6])).toBe(30);
    expect(calculateCategoryScore('small_straight', [2, 3, 4, 5, 5])).toBe(30);
    expect(calculateCategoryScore('small_straight', [1, 2, 4, 5, 6])).toBe(0);
  });

  it('scores large straight', () => {
    expect(calculateCategoryScore('large_straight', [1, 2, 3, 4, 5])).toBe(40);
    expect(calculateCategoryScore('large_straight', [2, 3, 4, 5, 6])).toBe(40);
    expect(calculateCategoryScore('large_straight', [1, 2, 3, 4, 6])).toBe(0);
  });

  it('scores yahtzee', () => {
    expect(calculateCategoryScore('yahtzee', [5, 5, 5, 5, 5])).toBe(50);
    expect(calculateCategoryScore('yahtzee', [5, 5, 5, 5, 4])).toBe(0);
  });

  it('scores chance', () => {
    expect(calculateCategoryScore('chance', [1, 2, 3, 4, 5])).toBe(15);
    expect(calculateCategoryScore('chance', [6, 6, 6, 6, 6])).toBe(30);
  });
});

describe('isYahtzee', () => {
  it('detects yahtzee', () => {
    expect(isYahtzee([3, 3, 3, 3, 3])).toBe(true);
    expect(isYahtzee([3, 3, 3, 3, 4])).toBe(false);
  });
});

describe('scoreCategory', () => {
  it('scores a basic category', () => {
    const card = createEmptyScorecard();
    const result = scoreCategory(card, 'ones', [1, 1, 3, 4, 5]);
    expect(result.scores.ones).toBe(2);
  });

  it('awards yahtzee bonus when yahtzee already scored 50', () => {
    const card = createEmptyScorecard();
    card.scores.yahtzee = 50;
    const result = scoreCategory(card, 'sixes', [6, 6, 6, 6, 6]);
    expect(result.yahtzeeBonuses).toBe(1);
    expect(result.scores.sixes).toBe(30);
  });

  it('no yahtzee bonus when yahtzee was scratched (0)', () => {
    const card = createEmptyScorecard();
    card.scores.yahtzee = 0;
    const result = scoreCategory(card, 'sixes', [6, 6, 6, 6, 6]);
    expect(result.yahtzeeBonuses).toBe(0);
  });
});

describe('getTotalScore', () => {
  it('sums all categories', () => {
    const card = createEmptyScorecard();
    card.scores.ones = 3;
    card.scores.chance = 20;
    expect(getTotalScore(card)).toBe(23);
  });

  it('includes upper bonus when >= 63', () => {
    const card = createEmptyScorecard();
    card.scores.ones = 3;
    card.scores.twos = 6;
    card.scores.threes = 9;
    card.scores.fours = 12;
    card.scores.fives = 15;
    card.scores.sixes = 18;
    // Upper subtotal = 63 exactly
    expect(getUpperSubtotal(card)).toBe(63);
    expect(hasUpperBonus(card)).toBe(true);
    expect(getTotalScore(card)).toBe(63 + 35);
  });

  it('includes yahtzee bonuses', () => {
    const card = createEmptyScorecard();
    card.scores.yahtzee = 50;
    card.yahtzeeBonuses = 2;
    expect(getTotalScore(card)).toBe(50 + 200);
  });
});

describe('getAvailableCategories', () => {
  it('returns all 13 for empty scorecard', () => {
    expect(getAvailableCategories(createEmptyScorecard())).toHaveLength(13);
  });

  it('excludes scored categories', () => {
    const card = createEmptyScorecard();
    card.scores.ones = 3;
    card.scores.yahtzee = 50;
    expect(getAvailableCategories(card)).toHaveLength(11);
  });
});

describe('isScorecardComplete', () => {
  it('false for empty', () => {
    expect(isScorecardComplete(createEmptyScorecard())).toBe(false);
  });
});

describe('getPotentialScores', () => {
  it('returns scores for all available categories', () => {
    const card = createEmptyScorecard();
    const potentials = getPotentialScores(card, [1, 2, 3, 4, 5]);
    expect(potentials.ones).toBe(1);
    expect(potentials.small_straight).toBe(30);
    expect(potentials.large_straight).toBe(40);
    expect(potentials.yahtzee).toBe(0);
    expect(potentials.chance).toBe(15);
  });
});
