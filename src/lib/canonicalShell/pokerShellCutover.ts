/**
 * pokerShellCutover — registry for Phase 3.2 (poker-family shell cutover).
 *
 * One-time substrate (3.2a): defines WHICH poker-variant families have
 * had their felt ownership lifted into the shell. Initially empty —
 * adding a family to `POKER_SHELL_FELTLESS_FAMILIES` is the SINGLE
 * routing change required for 3.2b (Holm) / 3.2c (3-5-7) / 3.2d (Horses)
 * / 3.2e (Ship Captain Crew).
 *
 * Behavioral contract
 * -------------------
 * When `isFeltlessPokerFamily(gameType)` returns true, MobileGameTable
 * MUST suppress its local `<CanonicalFeltSurface>` render — the
 * shell-owned felt (already painted behind by `ShellOwnedFeltHost`
 * inside `PersistentTableShell`) becomes the sole `data-canonical-felt-surface`
 * for the session. This satisfies the Phase 3.2 hard invariant:
 *
 *   exactly ONE `data-canonical-felt-surface` node per session lifecycle,
 *   regardless of game family.
 *
 * Until a family is registered here, nothing changes — production behavior
 * is byte-for-byte identical.
 *
 * Validation opt-in
 * -----------------
 * For pre-registry validation, the cutover can be force-enabled per family
 * via URL param or localStorage without a code change:
 *
 *   ?poker_shell_cutover=holm-game
 *   ?poker_shell_cutover=three-five-seven,horses
 *   localStorage `ptp_poker_shell_cutover` = "holm-game,horses"
 *
 * This lets us validate each family wedge in isolation before flipping
 * the registry. Multiple families may be enabled simultaneously
 * (comma-separated).
 *
 * Why a separate registry from `CANONICAL_SEAT_CONSUMERS`?
 * --------------------------------------------------------
 * Seat-anchor consumption and felt ownership are independent concerns:
 *   - `CANONICAL_SEAT_CONSUMERS` controls SeatAnchorLayer wiring.
 *   - `POKER_SHELL_FELTLESS_FAMILIES` controls felt ownership.
 * A family may need to enable one before the other (e.g. felt-only
 * validation pass before migrating seat clusters). They converge as
 * each 3.2b–e wedge completes.
 */

const POKER_VARIANT_GAME_TYPES = new Set<string>([
  'holm-game',
  '3-5-7',
  '3-5-7-game',
  '357',
  'three-five-seven',
  'horses',
  'ship-captain-crew',
]);

/**
 * Registry — poker-variant families that have completed felt cutover.
 * Empty in 3.2a. 3.2b–e each add exactly one entry.
 */
export const POKER_SHELL_FELTLESS_FAMILIES = new Set<string>([
  // 3.2b: 'holm-game',
  // 3.2c: 'three-five-seven', '3-5-7', '3-5-7-game', '357',
  // 3.2d: 'horses',
  // 3.2e: 'ship-captain-crew',
]);

function readDebugCutoverFamilies(): Set<string> {
  const out = new Set<string>();
  if (typeof window === 'undefined') return out;
  const collect = (raw: string | null) => {
    if (!raw) return;
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => out.add(s));
  };
  try {
    collect(new URLSearchParams(window.location.search).get('poker_shell_cutover'));
  } catch {}
  try {
    collect(window.localStorage.getItem('ptp_poker_shell_cutover'));
  } catch {}
  return out;
}

/**
 * True iff `gameType` is a poker-variant family whose felt ownership
 * should be sourced from the shell-owned felt host (i.e. MobileGameTable
 * must suppress its local CanonicalFeltSurface render).
 *
 * Combines the static registry with the URL/localStorage debug opt-in.
 */
export function isFeltlessPokerFamily(
  gameType: string | null | undefined,
): boolean {
  if (!gameType) return false;
  if (!POKER_VARIANT_GAME_TYPES.has(gameType)) return false;
  if (POKER_SHELL_FELTLESS_FAMILIES.has(gameType)) return true;
  return readDebugCutoverFamilies().has(gameType);
}

/**
 * Resolves a MobileGameTable mount's felt-ownership mode. Mount sites in
 * Game.tsx pass this directly to MobileGameTable's `feltOwnership` prop.
 */
export function resolveMobileTableFeltOwnership(
  gameType: string | null | undefined,
): 'self' | 'shell' {
  return isFeltlessPokerFamily(gameType) ? 'shell' : 'self';
}
