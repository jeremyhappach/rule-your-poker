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
]);

export function isCanonicalShellFamily(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return CANONICAL_SHELL_FAMILY.has(gameType);
}
