/**
 * DEV-ONLY Yahtzee near-end scorecard seeds.
 *
 * Each scenario pre-fills 12 of 13 categories per player (leaves `chance` open).
 * Players still roll real dice and score `chance` through the normal pipeline,
 * which then triggers the genuine end-of-game lifecycle: winner overlay,
 * authoritative chip transfer, settlement, round teardown.
 *
 * No "force game over" shortcut — real lifecycle preserved.
 */

import type { YahtzeeSeedScenario } from "./debugFlags";
import type { YahtzeeState, YahtzeeCategory, YahtzeeScorecard } from "./yahtzeeTypes";

type ScorecardPreset = {
  scores: Partial<Record<YahtzeeCategory, number>>;
  yahtzeeBonuses?: number;
};

// All presets fill 12 of 13 categories — `chance` is intentionally omitted.
const PRESETS: Record<YahtzeeSeedScenario, ScorecardPreset[]> = {
  // Lopsided: player A ~263, player B ~31 (before chance roll).
  clear_winner: [
    {
      scores: {
        ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
        three_of_a_kind: 20, four_of_a_kind: 0, full_house: 25,
        small_straight: 30, large_straight: 40, yahtzee: 50,
      },
    },
    {
      scores: {
        ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
        three_of_a_kind: 10, four_of_a_kind: 0, full_house: 0,
        small_straight: 0, large_straight: 0, yahtzee: 0,
      },
    },
  ],
  // Both ~180 before chance. Final winner decided by chance roll.
  close_game: [
    {
      scores: {
        ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
        three_of_a_kind: 18, four_of_a_kind: 0, full_house: 25,
        small_straight: 30, large_straight: 0, yahtzee: 0,
      },
    },
    {
      scores: {
        ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
        three_of_a_kind: 0, four_of_a_kind: 20, full_house: 0,
        small_straight: 30, large_straight: 40, yahtzee: 0,
      },
    },
  ],
  // Both seeded identically — tie unless `chance` rolls differ.
  tie: [
    {
      scores: {
        ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
        three_of_a_kind: 18, four_of_a_kind: 0, full_house: 25,
        small_straight: 30, large_straight: 40, yahtzee: 0,
      },
    },
    {
      scores: {
        ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
        three_of_a_kind: 18, four_of_a_kind: 0, full_house: 25,
        small_straight: 30, large_straight: 40, yahtzee: 0,
      },
    },
  ],
};

/**
 * Mutates `state.playerStates` in-place, applying the scenario preset to each
 * player in turnOrder. If there are more players than presets, the last
 * preset is reused. `chance` is left open for everyone.
 */
export function applyYahtzeeSeedScenario(
  state: YahtzeeState,
  scenario: YahtzeeSeedScenario,
): void {
  const presets = PRESETS[scenario];
  if (!presets || presets.length === 0) return;

  state.turnOrder.forEach((pid, idx) => {
    const ps = state.playerStates[pid];
    if (!ps) return;
    const preset = presets[Math.min(idx, presets.length - 1)];
    const scorecard: YahtzeeScorecard = {
      scores: { ...preset.scores },
      yahtzeeBonuses: preset.yahtzeeBonuses ?? 0,
    };
    state.playerStates[pid] = {
      ...ps,
      scorecard,
      isComplete: false, // exactly 1 category (`chance`) remains
    };
  });

  console.warn(`[YAHTZEE_SEED] Applied scenario "${scenario}" — chance open for all players`);
}
