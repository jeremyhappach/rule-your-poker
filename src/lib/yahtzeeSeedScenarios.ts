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
 * player. If a `hostPlayerId` is provided AND present in `state.turnOrder`,
 * preset index 0 (the advantaged "winner" preset for `clear_winner`) is
 * applied to the host and remaining presets are applied to the other
 * players in turnOrder. This guarantees the canonical session host is the
 * scripted winner, identical on every client.
 *
 * When `hostPlayerId` is null/unresolvable, falls back to turnOrder order.
 * `chance` is left open for everyone in all scenarios.
 */
export function applyYahtzeeSeedScenario(
  state: YahtzeeState,
  scenario: YahtzeeSeedScenario,
  hostPlayerId?: string | null,
): void {
  const presets = PRESETS[scenario];
  if (!presets || presets.length === 0) return;

  // Build the assignment order: host first (gets preset[0]), then others in turnOrder.
  const ordered: string[] = [];
  if (hostPlayerId && state.turnOrder.includes(hostPlayerId)) {
    ordered.push(hostPlayerId);
    for (const pid of state.turnOrder) {
      if (pid !== hostPlayerId) ordered.push(pid);
    }
  } else {
    ordered.push(...state.turnOrder);
  }

  ordered.forEach((pid, idx) => {
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

  console.warn(
    `[YAHTZEE_SEED] Applied scenario "${scenario}" — host=${hostPlayerId ?? '(fallback turnOrder)'}`,
  );
}
