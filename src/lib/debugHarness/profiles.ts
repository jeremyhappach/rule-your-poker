/**
 * Debug Harness Profile Registry
 *
 * Permanent QA/debug framework that productizes pre-existing deterministic
 * test scenarios behind a persistent dropdown in Game Defaults.
 *
 * Phase 1 wiring (current): only profiles backed by an existing harness
 * implementation are exposed. Each id below maps 1:1 to a real runtime
 * branch:
 *
 *   cribbage / near_double_skunk
 *     → src/lib/cribbageGameLogic.ts (createInitialCribbageState seeds
 *       host=119, others=10).
 *
 *   gin-rummy / near_gin
 *     → src/lib/debugFlags.ts (isGinTwoActionHarnessEnabled) drives
 *       deterministic gin-on-upcard + match target = 50 in
 *       ginRummyGameLogic / ginRummyRoundLogic.
 *
 *   yahtzee / near_win
 *     → src/lib/debugFlags.ts (getYahtzeeSeedScenario) returns
 *       'clear_winner' so applyYahtzeeSeedScenario fills 12/13 categories
 *       and the real end-of-game lifecycle fires off one more turn.
 *
 * Profiles intentionally NOT listed yet (no existing implementation to
 * wrap — would require greenfield logic and belong in a later phase):
 *   - Holm: Cracked Test
 *   - Ship Captain Crew: No Qualify, Midnight
 *   - Horses: Natural
 *   - 3-5-7: Instant Win
 *   - Cribbage: Quick Win, Quick Skunk
 *
 * Contract:
 *   - 'none' MUST be a zero-runtime-impact no-op.
 *   - Profile ids are stable strings; runtime consumers branch on id.
 *   - Adding a new profile requires a real implementation behind it AND
 *     a registry entry here — never one without the other.
 */

export type DebugHarnessId = string;

export interface DebugHarnessProfile {
  id: DebugHarnessId;
  label: string;
  description: string;
}

export const NONE_HARNESS: DebugHarnessProfile = {
  id: 'none',
  label: 'None',
  description: 'Normal runtime. No deterministic overrides.',
};

/** Per-game-type harness registry. Game-type keys mirror game_defaults.game_type. */
export const DEBUG_HARNESS_REGISTRY: Record<string, DebugHarnessProfile[]> = {
  cribbage: [
    NONE_HARNESS,
    {
      id: 'near_double_skunk',
      label: 'Near Double Skunk',
      description: 'Host seeded to 119, opponents to 10 — one hand to a real double-skunk match win.',
    },
    {
      id: 'max_pegging_fan',
      label: 'Max Pegging Fan',
      description: 'Deterministic legal deal of low cards (A/2/3 ×2 suits each) — guarantees both players play all 8 cards without breaking 31, producing a maximum-length pegging row.',
    },
  ],
  'gin-rummy': [
    NONE_HARNESS,
    {
      id: 'near_gin',
      label: 'Near Gin',
      description: 'Deterministic two-action gin-on-upcard with match target lowered to 50.',
    },
    {
      id: 'non_dealer_near_knock',
      label: 'Non-Dealer Near Knock',
      description:
        'EVERY hand of the dealer game: the authoritative NON-DEALER is dealt a near-knock hand (3♦4♦5♦ / 9♠9♥9♦ / 2♣3♣ / A♠ / K♥ with 4♣ upcard) and knocks at the first legal opportunity; the authoritative DEALER is dealt the layoff-test hand (2♦, A♣, 9♣ + isolated fillers). Roles are resolved from dealer identity per hand, never from the viewing client.',
    },
  ],

  yahtzee: [
    NONE_HARNESS,
    {
      id: 'near_win',
      label: 'Near Win',
      description: '12 of 13 categories pre-filled — one chance roll triggers real end-of-game.',
    },
    {
      id: 'reorder_probe',
      label: 'Reorder Probe',
      description: 'Non-host deterministic 3-roll sequence exercising real hold/reroll/render path: roll1=[5,2,3,4,2], hold first four, roll2 rerolls die4→2, roll3 rerolls die4→1. Emits YAHTZEE_DIE_PRESENTATION trace with violation detection.',
    },
  ],

  'ship-captain-crew': [
    NONE_HARNESS,
    {
      id: 'force_no_qualify',
      label: 'Force No Qualify',
      description: 'All dice forced to 1–3 every roll — both players guaranteed NQ, exercises rollover/re-ante.',
    },
  ],
  horses: [
    NONE_HARNESS,
    {
      id: 'force_tie',
      label: 'Force Tie',
      description: 'All dice forced to 1 (wild) every roll — both players land Five 1s, guaranteed tie/re-roll path.',
    },
  ],
  holm: [
    NONE_HARNESS,
    {
      id: 'force_player_beats_chucky',
      label: 'Force Player Beats Chucky',
      description: 'Solo vs Chucky → winner = PLAYER after natural reveal. Deal, reveal, announcement, pot transfer all run naturally.',
    },
    {
      id: 'force_chucky_beats_player',
      label: 'Force Chucky Beats Player',
      description: 'Solo vs Chucky → winner = CHUCKY after natural reveal. Deal, reveal, announcement, pot transfer all run naturally.',
    },
    {
      id: 'pause_showdown_freeze',
      label: 'Showdown Freeze',
      description: 'Pause once on the first real Holm multiplayer showdown (≥1 stayed opponent). Leaves awaiting_next_round=true after exposed cards visually settle; no auto-proceed, no release button. Solo/Chucky outcomes are excluded.',
    },
  ],
  '3-5-7': [
    NONE_HARNESS,
    {
      id: 'instant_win',
      label: 'Instant 3-5-7 Win',
      description: 'Session host is dealt 3♣ 5♦ 7♥ on Round 1 of the next normally-created 3-5-7 dealer game. Deal, transport, one-card-at-a-time animation, and has357Hand detection all run through the normal authoritative path — the rule is not bypassed. Remains active until Harness Profile is changed.',
    },
    {
      id: 'pause_r1_showdown',
      label: 'R1 Showdown Pause',
      description: 'Pause once on the first real opponent-exposed showdown that resolves in Round 1 of the current dealer game. Leaves awaiting_next_round=true; no auto-proceed, no release button.',
    },
    {
      id: 'pause_r2_showdown',
      label: 'R2 Showdown Pause',
      description: 'Pause once on the first real opponent-exposed showdown that resolves in Round 2 of the current dealer game. Leaves awaiting_next_round=true; no auto-proceed, no release button.',
    },
    {
      id: 'pause_r3_showdown',
      label: 'R3 Showdown Pause',
      description: 'Pause once on the first real opponent-exposed showdown that resolves in Round 3 of the current dealer game. Leaves awaiting_next_round=true; no auto-proceed, no release button.',
    },
  ],
  // Game types intentionally absent below have no existing harness to wrap yet.
};

/**
 * Legacy persisted harness ids → canonical id.
 *
 * Read-only compatibility: nothing writes these keys any more, but a
 * `game_defaults.debug_harness` row persisted before the rename must
 * still resolve to the canonical profile instead of silently
 * degrading to 'none'.
 */
export const LEGACY_HARNESS_ALIASES: Record<string, DebugHarnessId> = {
  opponent_instant_knock: 'non_dealer_near_knock',
};

/** Map a possibly-legacy persisted id to its canonical id. */
export function canonicalizeHarnessId(
  id: DebugHarnessId | null | undefined,
): DebugHarnessId {
  if (!id) return 'none';
  return LEGACY_HARNESS_ALIASES[id] ?? id;
}

export function getHarnessProfiles(gameType: string): DebugHarnessProfile[] {
  return DEBUG_HARNESS_REGISTRY[gameType] ?? [NONE_HARNESS];
}

export function getHarnessProfile(
  gameType: string,
  id: DebugHarnessId | null | undefined,
): DebugHarnessProfile {
  const list = getHarnessProfiles(gameType);
  const canonical = canonicalizeHarnessId(id);
  return list.find((p) => p.id === canonical) ?? NONE_HARNESS;
}


export function isHarnessActive(id: DebugHarnessId | null | undefined): boolean {
  return !!id && id !== 'none';
}
