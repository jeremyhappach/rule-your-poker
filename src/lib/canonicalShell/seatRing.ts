/**
 * Canonical Seat Ring — single shared contract for seat-order math.
 *
 * BACKGROUND
 * ──────────
 * Before this module existed, every game (Holm, 3-5-7, Horses, SCC, Gin,
 * Cribbage, dealer-rotation) carried its own inline `sort + indexOf + (i+1)%n`
 * implementation of "the next player clockwise". Each one independently
 * decided whether `position + 1` meant LEFT or RIGHT of the dealer.
 *
 * Holm assumed: `position + 1` = LEFT of dealer (action passes left, poker
 * convention) → buck = dealer's next-HIGHER occupied position.
 *
 * The canonical seat anchors (`seatAnchors.ts`) map: a viewer at HOME sees
 * `position + 1` at the BOTTOM-RIGHT slot. That places "dealer + 1" visually
 * to the dealer's RIGHT, the opposite of Holm's assumption.
 *
 * Result: hand-1 buck rendered on the wrong side of the dealer and the
 * spotlight followed the wrong arc.
 *
 * CONTRACT
 * ────────
 * "Clockwise" in this module means the POKER convention — the direction
 * action passes around the table, which is "to the left of dealer" from the
 * dealer's seated perspective. With the existing canonical seat-anchor
 * mapping, "left of HOME viewer" = bottom-LEFT slot = `clockwiseDistance 6`
 * = position D-1 (mod occupied ring).
 *
 *   nextClockwise(D, occupied) = nearest LOWER occupied position (wrap to highest)
 *
 * This means Holm and every future consumer must rotate by descending
 * position number (wrapping), NOT by ascending position number. Render-side
 * `seatAnchors.ts` is unchanged; this module is the bridge.
 *
 * RULES (enforced by code review, not the type system)
 * ────────────────────────────────────────────────────
 * - No game module may compute next/previous seat with raw `sort + indexOf
 *   + (i±1) % n` against a positions array. Use `nextClockwise` /
 *   `previousClockwise` instead.
 * - No game module may independently decide whether `+1` is left or right.
 *   The answer lives here, once.
 * - Shell visual ordering and game turn ordering MUST consume the same
 *   primitives. Slot resolution (`positionToRelativeSlot`) defers to
 *   `seatAnchors` so rendering and gameplay cannot disagree.
 */

import {
  activeSlotForDistance,
  clockwiseDistance,
  SLOT,
  type CanonicalSlot,
} from './seatAnchors';

// ── Ring helpers ──────────────────────────────────────────────

/** Returns the occupied positions sorted ascending. Empty in → empty out. */
export function getOccupiedSeatRing(occupiedPositions: readonly number[]): number[] {
  return [...occupiedPositions].sort((a, b) => a - b);
}

function assertOccupied(position: number, ring: number[]): number {
  const idx = ring.indexOf(position);
  if (idx === -1) {
    throw new Error(
      `[seatRing] position ${position} not present in occupied ring [${ring.join(',')}]`,
    );
  }
  return idx;
}

/**
 * The next seat in action-passing order (poker "clockwise" = left of dealer).
 *
 * Maps to: nearest LOWER occupied position, wrapping from the lowest back to
 * the highest. This is the direction that places the next seat at the
 * bottom-LEFT slot (relative to a HOME viewer) under the canonical anchor map.
 */
export function nextClockwise(position: number, occupiedPositions: readonly number[]): number {
  const ring = getOccupiedSeatRing(occupiedPositions);
  if (ring.length === 0) {
    throw new Error('[seatRing] nextClockwise called with empty occupied ring');
  }
  if (ring.length === 1) return ring[0];
  const idx = assertOccupied(position, ring);
  const nextIdx = (idx - 1 + ring.length) % ring.length;
  return ring[nextIdx];
}

/** Inverse of nextClockwise — the seat that just acted before `position`. */
export function previousClockwise(
  position: number,
  occupiedPositions: readonly number[],
): number {
  const ring = getOccupiedSeatRing(occupiedPositions);
  if (ring.length === 0) {
    throw new Error('[seatRing] previousClockwise called with empty occupied ring');
  }
  if (ring.length === 1) return ring[0];
  const idx = assertOccupied(position, ring);
  const prevIdx = (idx + 1) % ring.length;
  return ring[prevIdx];
}

// ── Slot resolution (defers to canonical seat anchors) ────────

/**
 * Resolve an authoritative position to its visual slot relative to the viewer.
 *
 * Defers to `seatAnchors.clockwiseDistance` / `activeSlotForDistance` so
 * rendering and gameplay logic cannot drift. `occupiedPositions` is accepted
 * for API symmetry / future ring-aware projection modes; the active-canonical
 * resolver currently consumes only viewer and target positions.
 */
export function positionToRelativeSlot(
  position: number,
  viewerPosition: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _occupiedPositions: readonly number[],
): CanonicalSlot | null {
  if (position === viewerPosition) return SLOT.HOME;
  const distance = clockwiseDistance(viewerPosition, position);
  return activeSlotForDistance(distance);
}

/**
 * Inverse: which authoritative position is currently rendered at `slot` for
 * `viewerPosition`? Walks the active distance map to find the position that
 * resolves to the target slot. Returns null if no occupied seat matches.
 */
export function relativeSlotToPosition(
  slot: CanonicalSlot,
  viewerPosition: number,
  occupiedPositions: readonly number[],
): number | null {
  if (slot === SLOT.HOME) {
    return occupiedPositions.includes(viewerPosition) ? viewerPosition : null;
  }
  for (const pos of occupiedPositions) {
    if (pos === viewerPosition) continue;
    if (positionToRelativeSlot(pos, viewerPosition, occupiedPositions) === slot) {
      return pos;
    }
  }
  return null;
}

// ── Game-rule helpers ─────────────────────────────────────────

export type SeatRingDirection = 'clockwise' | 'counter-clockwise';

/**
 * The seat that should act first after the dealer under poker convention
 * (action passes clockwise = to dealer's left).
 *
 * Pass `direction: 'counter-clockwise'` only for games that explicitly
 * reverse action order. Default is the standard poker-clockwise direction.
 */
export function getFirstActorAfterDealer(
  dealerPosition: number,
  occupiedPositions: readonly number[],
  direction: SeatRingDirection = 'clockwise',
): number {
  return direction === 'clockwise'
    ? nextClockwise(dealerPosition, occupiedPositions)
    : previousClockwise(dealerPosition, occupiedPositions);
}

/**
 * Where the buck starts on a fresh dealer game / first hand: one seat
 * clockwise (left) of the dealer.
 */
export function getBuckStartPosition(
  dealerPosition: number,
  occupiedPositions: readonly number[],
): number {
  return nextClockwise(dealerPosition, occupiedPositions);
}
