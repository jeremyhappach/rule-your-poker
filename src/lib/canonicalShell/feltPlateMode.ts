/**
 * feltPlateMode — explicit, narrow contract for the shell felt's plate.
 *
 * The shell felt MUST NOT infer plate state from `isWaitingPhase` (which
 * legitimately means "HUD lobby grid / animation gating / gameplay
 * suppression" elsewhere). Publishers explicitly declare which plate the
 * felt should paint via this enum.
 *
 *   BRAND — render the "P-Town Poker" branding plate. No committed
 *           dealer-game (waiting_for_players, game_selection, post-game
 *           teardown, fresh waiting, abandoned, etc).
 *   GAME  — render the committed game-name plate
 *           ($X CRIBBAGE / HORSES / etc). A dealer game has been
 *           committed (dealer_selection, cribbage_dealer_selection,
 *           ante_decision, in_progress, game_over).
 *
 * Consumers (CanonicalFeltSurface) read THIS field only. Legacy
 * `isWaitingPhase` cannot influence plate selection when feltPlateMode
 * is provided.
 */

export type FeltPlateMode = 'BRAND' | 'GAME';

/**
 * Server status -> felt plate mode. Single authority for the mapping
 * so every publisher uses identical semantics.
 */
const GAME_PLATE_STATUSES: ReadonlySet<string> = new Set([
  'dealer_selection',
  'cribbage_dealer_selection',
  'ante_decision',
  'in_progress',
  'game_over',
]);

export function deriveFeltPlateMode(
  status: string | null | undefined,
): FeltPlateMode {
  if (!status) return 'BRAND';
  return GAME_PLATE_STATUSES.has(status) ? 'GAME' : 'BRAND';
}
