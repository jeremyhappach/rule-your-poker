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
  ],
  'gin-rummy': [
    NONE_HARNESS,
    {
      id: 'near_gin',
      label: 'Near Gin',
      description: 'Deterministic two-action gin-on-upcard with match target lowered to 50.',
    },
  ],
  yahtzee: [
    NONE_HARNESS,
    {
      id: 'near_win',
      label: 'Near Win',
      description: '12 of 13 categories pre-filled — one chance roll triggers real end-of-game.',
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
  ],
  // Game types intentionally absent below have no existing harness to wrap yet.
};

export function getHarnessProfiles(gameType: string): DebugHarnessProfile[] {
  return DEBUG_HARNESS_REGISTRY[gameType] ?? [NONE_HARNESS];
}

export function getHarnessProfile(
  gameType: string,
  id: DebugHarnessId | null | undefined,
): DebugHarnessProfile {
  const list = getHarnessProfiles(gameType);
  return list.find((p) => p.id === id) ?? NONE_HARNESS;
}

export function isHarnessActive(id: DebugHarnessId | null | undefined): boolean {
  return !!id && id !== 'none';
}
