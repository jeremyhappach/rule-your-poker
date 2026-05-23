/**
 * Debug Harness Profile Registry
 *
 * Permanent QA/debug framework for deterministic test scenarios.
 * Selected per game_type via the Game Defaults UI; persisted on
 * game_defaults.debug_harness as a free-form string id (default 'none').
 *
 * Contract:
 *   - 'none' MUST be a zero-runtime-impact no-op.
 *   - Profile ids are stable strings; runtime consumers branch on id.
 *   - New profiles are additive; never remove or rename ids without
 *     a migration that resets affected rows back to 'none'.
 *   - Profiles are NOT exposed to production end users — they only
 *     surface inside the admin Game Defaults dialog.
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
    { id: 'quick_win', label: 'Quick Win', description: 'Deterministic short path to a non-skunk match win.' },
    { id: 'quick_skunk', label: 'Quick Skunk', description: 'Deterministic short path to a single-skunk match win.' },
    { id: 'quick_double_skunk', label: 'Quick Double Skunk', description: 'Deterministic short path to a double-skunk match win.' },
  ],
  'gin-rummy': [
    NONE_HARNESS,
    { id: 'near_knock', label: 'Near Knock', description: 'Deal/draw stack biased toward an imminent knock.' },
    { id: 'near_gin', label: 'Near Gin', description: 'Deal/draw stack biased toward an imminent gin.' },
  ],
  holm: [
    NONE_HARNESS,
    { id: 'cracked_test', label: 'Cracked Test', description: 'Bots fold and Chucky wins — exercises the cracked overlay path.' },
  ],
  'ship-captain-crew': [
    NONE_HARNESS,
    { id: 'no_qualify', label: 'No Qualify', description: 'Forces a no-qualify outcome to exercise that overlay.' },
    { id: 'midnight', label: 'Midnight', description: 'Forces a midnight (4-5-6) outcome to exercise that overlay.' },
  ],
  horses: [
    NONE_HARNESS,
    { id: 'natural', label: 'Natural', description: 'Forces a natural opening to exercise the natural overlay.' },
  ],
  yahtzee: [
    NONE_HARNESS,
    { id: 'near_win', label: 'Near Win', description: 'Closeout state with one scoring category remaining.' },
  ],
  '3-5-7': [
    NONE_HARNESS,
    { id: 'instant_win', label: 'Instant Win', description: 'Forces an instant-win deal to exercise that overlay.' },
  ],
};

export function getHarnessProfiles(gameType: string): DebugHarnessProfile[] {
  return DEBUG_HARNESS_REGISTRY[gameType] ?? [NONE_HARNESS];
}

export function getHarnessProfile(gameType: string, id: DebugHarnessId | null | undefined): DebugHarnessProfile {
  const list = getHarnessProfiles(gameType);
  return list.find((p) => p.id === id) ?? NONE_HARNESS;
}

export function isHarnessActive(id: DebugHarnessId | null | undefined): boolean {
  return !!id && id !== 'none';
}
