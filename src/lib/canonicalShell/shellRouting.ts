/**
 * shellRouting — pure selector for which game_type families participate
 * in the canonical PersistentTableShell ownership boundary (Phase 5).
 *
 * Poker-variant family routes through MobileGameTable across multiple
 * lifecycle phases and is the target of the Phase 5 outer-shell lift.
 *
 * Cribbage / Gin Rummy / Yahtzee / Trivia already render through their
 * own unified persistent game tables and are explicitly excluded; their
 * persistence semantics are owned by those components today and are
 * untouched by this phase.
 */

export const POKER_VARIANT_FAMILY = new Set<string>([
  'holm-game',
  '3-5-7',
  '3-5-7-game',
  '357',
  'horses',
  'ship-captain-crew',
]);

export function isPokerVariantFamily(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return POKER_VARIANT_FAMILY.has(gameType);
}

/**
 * P9.4 (re-scoped): broader family of game types that participate in the
 * canonical shell runtime path (PersistentTableShell + PlayfieldSlotController
 * + shell-owned SeatAnchorLayer). Keeps `isPokerVariantFamily` untouched —
 * other call sites depend on poker-specific semantics (bots, scoring, ante
 * orchestration). Use `isCanonicalShellFamily` only for shell ownership
 * decisions (mount, identity tracking, neutral interstitial, seat anchors).
 */
export const CANONICAL_SHELL_FAMILY = new Set<string>([
  ...POKER_VARIANT_FAMILY,
  'gin-rummy',
  'cribbage',
]);

export function isCanonicalShellFamily(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return CANONICAL_SHELL_FAMILY.has(gameType);
}

/**
 * Registry of game_types that consume shell-owned canonical seat
 * primitives (SeatAnchorLayer, CanonicalSeatCluster, chip-transport
 * endpoints). EVERY entry here MUST also be in `CANONICAL_SHELL_FAMILY`,
 * otherwise the consumer mounts without an anchor provider and renders
 * empty seat clusters silently.
 *
 * This registry exists specifically to prevent the failure class we hit
 * during both Gin Rummy and Cribbage migrations: a game began consuming
 * canonical seat anchors before being added to CANONICAL_SHELL_FAMILY,
 * SeatAnchorLayer never mounted, useSeatAnchorsOptional() returned null,
 * every slot resolved to null, and chip stacks / dealer pips / chip-
 * transport endpoints silently disappeared. Hours of downstream symptom
 * debugging followed.
 *
 * Onboarding contract: when a game starts consuming canonical seat
 * primitives, add its game_type here AND to CANONICAL_SHELL_FAMILY in
 * the same change. The startup invariant (asserted on module load and
 * by shellRouting.test.ts) will fail loudly if the two diverge.
 *
 * See .lovable/canonical-shell-onboarding-checklist.md.
 */
export const CANONICAL_SEAT_CONSUMERS = new Set<string>([
  'gin-rummy',
  'cribbage',
]);

/** Whether this game_type is registered as a canonical seat-anchor consumer. */
export function isCanonicalSeatConsumer(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return CANONICAL_SEAT_CONSUMERS.has(gameType);
}

/**
 * Module-load invariant: any registered canonical seat consumer MUST
 * also be a member of CANONICAL_SHELL_FAMILY (which is what gates
 * SeatAnchorLayer mounting in Game.tsx). Diverging the two sets is the
 * exact bug class this module exists to prevent, so we fail loudly at
 * load time rather than silently at render time.
 */
const _missingFamily = [...CANONICAL_SEAT_CONSUMERS].filter(
  gt => !CANONICAL_SHELL_FAMILY.has(gt),
);
if (_missingFamily.length > 0) {
  // Throwing on module evaluation surfaces the misconfiguration
  // immediately on app boot AND in unit tests, instead of waiting for a
  // user to load a specific game and notice missing chrome.
  throw new Error(
    `[shellRouting] CANONICAL_SEAT_CONSUMERS contains game_types missing ` +
      `from CANONICAL_SHELL_FAMILY: ${_missingFamily.join(', ')}. ` +
      `Add them to CANONICAL_SHELL_FAMILY (see ` +
      `.lovable/canonical-shell-onboarding-checklist.md).`,
  );
}

