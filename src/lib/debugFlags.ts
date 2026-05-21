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
 * Gin Rummy "two-action" debug harness — exercises round-end → next-hand and
 * match-win / chip-transfer flows in two quick human actions.
 *
 * Enable via ?debug_gin_2action=1 or localStorage ptp_debug_gin_2action = "1"
 *
 * When active:
 *  - Match target is forced to 50 points.
 *  - Dealer rotation is suppressed; the player who is dealer in hand 1 stays
 *    dealer for hand 2 (so the same human seat keeps acting second on the upcard).
 *  - Both hands are dealt deterministically:
 *      Dealer (host):   A♠2♠3♠ 4♥5♥6♥ 7♦8♦9♦ K♣  (deadwood K♣ = 10)
 *      Upcard:          10♦                       (completes 7♦8♦9♦10♦ run)
 *      Non-dealer (bot):K♥K♦K♠ A♣A♦ 2♣2♥ 3♦3♥ 4♣ (one set meld + 16 deadwood)
 *  - Bot deadwood (16) is above knock threshold AND 10♦ adds no value, so bot
 *    passes the upcard.
 *  - Host takes upcard → instant gin → 25 + 16 = 41 pts.
 *  - Hand 2 same → host total 82 → match win at 50.
 *
 * Isolated from production deal logic; ignored unless flag is on.
 */
export function isGinTwoActionHarnessEnabled(): boolean {
  return hasQueryFlag('debug_gin_2action') || hasLocalFlag('ptp_debug_gin_2action');
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
 * Debug testing unlock — tester-friendly activation for hosted environments.
 *
 * Activation (one-time per device, normal browser navigation only):
 *   - Enable:  append ?enable_debug_testing=1  to any app URL
 *   - Disable: append ?enable_debug_testing=0  to any app URL
 *
 * Once enabled, persists in localStorage (`ptp_debug_testing_unlock = "1"`)
 * across navigation and reloads until explicitly disabled. Normal users will
 * never accidentally set this — it requires the explicit URL param.
 *
 * Gating mechanism for all opt-in tester harnesses (e.g. Yahtzee seed scenarios).
 */
const DEBUG_UNLOCK_KEY = 'ptp_debug_testing_unlock';

function syncDebugUnlockFromUrl(): void {
  try {
    const v = new URLSearchParams(window.location.search).get('enable_debug_testing');
    if (v === null) return;
    if (v === '0' || v.toLowerCase() === 'false') {
      window.localStorage.removeItem(DEBUG_UNLOCK_KEY);
      console.warn('[DEBUG_TESTING] Disabled — tester harnesses are now off.');
    } else {
      window.localStorage.setItem(DEBUG_UNLOCK_KEY, '1');
      console.warn('[DEBUG_TESTING] Enabled — tester harnesses (e.g. ?debug_yahtzee_seed=...) are now active on this device.');
    }
  } catch {}
}

// Run once at module load so the URL param takes effect on first navigation.
if (typeof window !== 'undefined') {
  syncDebugUnlockFromUrl();
}

export function isDebugTestingUnlocked(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Yahtzee near-end seed scenarios — accelerates end-of-game regression testing.
 *
 * Each scenario pre-fills 12 of 13 categories per player (leaving `chance` open), so
 * one real turn per player triggers the genuine end-of-game lifecycle: real roll flow,
 * real scoring, real winner-overlay, real chip transfer, real settlement.
 *
 * Requires the debug-testing unlock (see `isDebugTestingUnlocked`). Activate once via
 *   ?enable_debug_testing=1
 * then use:
 *   ?debug_yahtzee_seed=clear_winner | tie | close_game
 * or persist via localStorage `ptp_debug_yahtzee_seed`.
 */
export type YahtzeeSeedScenario = 'clear_winner' | 'tie' | 'close_game';

export function getYahtzeeSeedScenario(): YahtzeeSeedScenario | null {
  if (!isDebugTestingUnlocked()) return null;
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



