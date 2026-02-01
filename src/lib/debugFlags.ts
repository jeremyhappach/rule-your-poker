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
