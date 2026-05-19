/**
 * Debug flags (client-side).
 *
 * These are intentionally simple + reload-based, so we can quickly isolate races.
 *
 * Enable via either:
 * - URL params:
 *   - ?debug_disable_enforcement=1
 *   - ?debug_disable_safety_polls=1
 * - localStorage:
 *   - ptp_debug_disable_enforcement = "1"
 *   - ptp_debug_disable_safety_polls = "1"
 */

function hasQueryFlag(name: string): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(name);
    if (v === null) return false;
    return v === '' || v === '1' || v.toLowerCase() === 'true';
  } catch {
    return false;
  }
}

function hasLocalFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Disables client-side calls to the deadline-enforcer backend function.
 * (Does NOT affect realtime subscriptions.)
 */
export function isClientDeadlineEnforcementDisabled(): boolean {
  return (
    hasQueryFlag('debug_disable_enforcement') ||
    hasLocalFlag('ptp_debug_disable_enforcement')
  );
}

/**
 * Disables non-essential client-side safety polling loops that are meant to prevent
 * stuck states when realtime misses updates.
 */
export function isSafetyPollingDisabled(): boolean {
  return (
    hasQueryFlag('debug_disable_enforcement') ||
    hasQueryFlag('debug_disable_safety_polls') ||
    hasLocalFlag('ptp_debug_disable_enforcement') ||
    hasLocalFlag('ptp_debug_disable_safety_polls')
  );
}

/**
 * Forces Gin Rummy to deal rigged hands for testing knock/lay-off flow.
 * Enable via ?debug_gin_rigged=1 or localStorage ptp_debug_gin_rigged = "1"
 *
 * Dealer gets: A♠ 2♠ 3♠ (run meld) + 4♥ 5♥ 6♥ (run meld) + 7♦ 8♦ 9♦ (run meld) + A♥ (1 deadwood) → can knock
 * Non-dealer gets: 4♠ 5♣ + rest are high deadwood, but 4♠ lays off on dealer's run if extended, and 10♦ lays off too
 */
export function isGinRiggedDealEnabled(): boolean {
  // To re-enable for testing: set localStorage ptp_debug_gin_rigged = "1" or use ?debug_gin_rigged=1
  return hasQueryFlag('debug_gin_rigged') || hasLocalFlag('ptp_debug_gin_rigged');
}

/**
 * Forces Yahtzee bot to always pursue a large straight (1-2-3-4-5 or 2-3-4-5-6).
 * This creates deterministic selective hold patterns for debugging held-dice ordering.
 * Enable via ?debug_yahtzee_straight=1 or localStorage ptp_debug_yahtzee_straight = "1"
 */
export function isYahtzeeStraightDebugEnabled(): boolean {
  return hasQueryFlag('debug_yahtzee_straight') || hasLocalFlag('ptp_debug_yahtzee_straight');
}

/**
 * DEV-ONLY Yahtzee near-end seed scenarios — accelerates end-of-game regression testing.
 *
 * Each scenario pre-fills 12 of 13 categories per player (leaving `chance` open), so
 * one real turn per player triggers the genuine end-of-game lifecycle: real roll flow,
 * real scoring, real winner-overlay, real chip transfer, real settlement.
 *
 * Enable via:
 *  - URL: ?debug_yahtzee_seed=clear_winner | tie | close_game
 *  - localStorage: ptp_debug_yahtzee_seed = "clear_winner" | "tie" | "close_game"
 *
 * Gated to import.meta.env.DEV — no-op in production builds.
 */
export type YahtzeeSeedScenario = 'clear_winner' | 'tie' | 'close_game';

export function getYahtzeeSeedScenario(): YahtzeeSeedScenario | null {
  if (!import.meta.env.DEV) return null;
  const valid = (v: string | null): YahtzeeSeedScenario | null =>
    v === 'clear_winner' || v === 'tie' || v === 'close_game' ? v : null;
  try {
    const fromUrl = valid(new URLSearchParams(window.location.search).get('debug_yahtzee_seed'));
    if (fromUrl) return fromUrl;
  } catch {}
  try {
    const fromLocal = valid(window.localStorage.getItem('ptp_debug_yahtzee_seed'));
    if (fromLocal) return fromLocal;
  } catch {}
  return null;
}

