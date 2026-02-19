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
  // TEMPORARY: always on for testing knock/lay-off flow
  return true;
}
