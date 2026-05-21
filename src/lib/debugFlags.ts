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
 * CONTRACT (do not violate):
 *  1. DEFAULT OFF. Activate ONLY via:
 *       - URL: ?debug_gin_2action=1
 *       - localStorage: ptp_debug_gin_2action = "1"
 *     Never hardcode `return true`. Never global-force.
 *
 *  2. The harness produces a FULLY LEGAL deterministic Gin state — not a
 *     scripted cinematic. The deal hands out real 10-card hands, a real
 *     upcard, and a real 31-card stockpile. All standard legal actions
 *     remain valid continuations:
 *       - non-dealer takes upcard / passes
 *       - dealer takes upcard / passes
 *       - either side draws stock, plays, knocks, lays off, etc.
 *     The *content* of the cards is what enables the fast happy path; it
 *     does NOT restrict legality of any other branch.
 *
 *  3. Flag is read at decision time only — no flags/refs/scores persist
 *     across dealer games. When the flag flips off, the next dealer game
 *     uses normal rotation, normal target, normal deck.
 *
 *  4. While ON, by explicit harness requirement:
 *       - Match target = 50 (so two gins ≈ 41 + 41 close out the match)
 *       - Dealer rotation suppressed within that dealer game (host stays
 *         dealer so both gins resolve to host). This is gated at the call
 *         site by this flag — toggling the flag off restores normal rotation
 *         on the next hand.
 *
 *  Happy path: bot passes upcard → host takes upcard → instant gin (41 pts).
 *  Repeated for hand 2 → match win at 82.
 *  Off-path (host passes, etc.): game continues legally via the normal
 *  Gin engine — the deterministic deal supports it.
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



