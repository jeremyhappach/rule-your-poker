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
  'three-five-seven',
  'horses',
  'ship-captain-crew',
]);

export function isPokerVariantFamily(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return POKER_VARIANT_FAMILY.has(gameType);
}
