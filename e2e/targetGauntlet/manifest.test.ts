import { describe, expect, it } from 'vitest';

import { TARGET_GAUNTLET_MANIFEST, validateTargetGauntletManifest } from './manifest';

describe('target rule gauntlet manifest', () => {
  it('locks all deterministic target rows without duplicate identities', () => {
    expect(() => validateTargetGauntletManifest()).not.toThrow();
    expect(TARGET_GAUNTLET_MANIFEST).toHaveLength(45);
    expect(TARGET_GAUNTLET_MANIFEST.filter((row) => row.gameType === 'yahtzee')).toHaveLength(18);
    expect(TARGET_GAUNTLET_MANIFEST.filter((row) => row.gameType === 'holm-game')).toHaveLength(15);
    expect(TARGET_GAUNTLET_MANIFEST.filter((row) => row.gameType === '3-5-7')).toHaveLength(12);
  });

  it('gives every Yahtzee category an exact score-selection row', () => {
    const categories = TARGET_GAUNTLET_MANIFEST
      .filter((row) => row.id.startsWith('yahtzee-category-'))
      .map((row) => row.yahtzeeCategory);
    expect(categories).toEqual([
      'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
      'three_of_a_kind', 'four_of_a_kind', 'full_house',
      'small_straight', 'large_straight', 'yahtzee', 'chance',
    ]);
  });

  it('keeps every exact fixture scoped to one supported target game', () => {
    for (const row of TARGET_GAUNTLET_MANIFEST.filter((candidate) => candidate.fixtureProfile)) {
      const fixtureGame = row.fixtureProfile?.split(':')[0];
      expect(fixtureGame).toBe(row.gameType === 'holm-game' ? 'holm' : row.gameType === '3-5-7' ? '357' : 'yahtzee');
    }
  });
});
