/**
 * CanonicalOpponentSeat — Wave 3C.1 substrate.
 *
 * Forward-facing name for the shell-owned per-seat primitive. The
 * implementation lives in `CanonicalSeatCluster` and is unchanged by
 * the rename; this module exposes the new name plus its type alias
 * so consumers can migrate at their own pace.
 *
 * Wave 3C ownership target: this primitive owns the OPPONENT seat
 * presentation across waiting, interstitial, and gameplay:
 *
 *   - background plate (felt-toned pill)
 *   - avatar slot                       (Wave 3C.1 — additive prop)
 *   - player name + dealer pip          (existing)
 *   - chip counter                      (existing, data-chip-center)
 *   - status ring                       (Wave 3C.1 — additive prop)
 *   - emoticon slot                     (existing — chipOverlay)
 *   - optional game-specific artifact   (existing — children +
 *                                        innerDecoration +
 *                                        outerDecoration)
 *
 * 3C.1 ships avatar + statusRing as opt-in additive slots. Passive
 * consumers (waiting / interstitial / Cribbage / Gin) pass-through
 * statusRing derived from their existing `status` value; 'active'
 * resolves to no ring so no visible change for current screens.
 *
 * 3C.3 (separate wave) will retire the MGT gameplay `hideChipBubble`
 * carve-out and decompose `renderPlayerChip` onto these slots.
 */

export {
  CanonicalSeatCluster as CanonicalOpponentSeat,
} from './CanonicalSeatCluster';
export type {
  CanonicalSeatClusterProps as CanonicalOpponentSeatProps,
} from './CanonicalSeatCluster';
