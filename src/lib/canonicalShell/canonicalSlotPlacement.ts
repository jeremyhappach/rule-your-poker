/**
 * canonicalSlotPlacement — single source of truth for ergonomic seat-anchor
 * placement on the table surface.
 *
 * One module, one set of Tailwind placement classes per CanonicalSlot, used
 * by every consumer that draws seat-anchored chrome over the felt:
 *   - per-seat chip bubbles (name + chip stack)
 *   - chip-transport endpoints (data-chip-center markers)
 *   - turn spotlight targets
 *   - future per-seat overlays (chat bubbles, status pips, etc.)
 *
 * Design contract:
 *   - Bubbles for HOME / FACE_TO_FACE (center-bottom / center-top) sit on
 *     the table RAIL, NOT inside the active felt play zone. They must not
 *     intrude on stock/discard, pegboards, or center-stack overlays.
 *   - Perimeter slots (corners + mid-sides) sit at the felt edge, far
 *     enough out to align with the rail rather than the inner play area.
 *   - Bottom perimeter slots anchor by their FULL seat envelope bottom,
 *     not by an old chip point. The cluster may add cards, HUD rings,
 *     emoticons, or hidden-chip placeholders without spilling into the
 *     announcement rail / HUDStack below the play region.
 *   - Identical for active-canonical and observer-absolute projections —
 *     the projection layer (seatAnchors.ts) decides which seat maps to
 *     which slot; this module decides where each slot paints.
 */

import type { CanonicalSlot } from './seatAnchors';

export interface CanonicalSlotPlacement {
  className: string;
}

/**
 * Returns Tailwind classes that absolutely-position a seat-anchored
 * element relative to the table-surface container (the same container
 * that hosts canonical felt). Intended for `flex flex-col items-*`
 * stacks (name above, chip circle below).
 */
export function getCanonicalSlotPlacement(
  slot: CanonicalSlot | null | undefined,
  variant: 'occupied' | 'open-seat' | 'occupied-observer' | 'occupied-2p-face' = 'occupied',
): CanonicalSlotPlacement {
  // Percentage-based anchors that hug the elliptical felt rail.
  switch (slot) {
    case -2: return { className: 'top-[4%] left-1/2 -translate-x-1/2 items-center' };
    case -1:
      // HOME (-1) is normally the local viewer's seat and is
      // self-suppressed in active-canonical projection. In observer-2P
      // canonicalization (Cribbage / Gin / Yahtzee with two seated
      // players viewed by an unjoined observer), the lower-positioned
      // opponent is intentionally projected to HOME to mirror the
      // active-canonical layout. In that case the cluster must NOT sit
      // at the central bottom rail — it overlaps the pegging count,
      // played-card row, and other gameplay artifacts. Shift it to the
      // bottom-left perimeter rail instead.
      return variant === 'occupied-observer'
        ? { className: 'bottom-[1%] left-[6%] items-start scale-90' }
        : { className: 'bottom-[4%] left-1/2 -translate-x-1/2 items-center' };
    // BOTTOM_RAIL — observer-only anchor for absolute "south" (pos 4).
    case -3:
      return variant === 'open-seat'
        ? { className: 'bottom-[4%] left-1/2 -translate-x-1/2 items-center' }
        : { className: 'bottom-[1%] right-[6%] items-end scale-90' };
    case 0:  return { className: 'bottom-[2%] left-[2%] items-start' };
    case 1:  return { className: 'top-[50%] left-[1%] -translate-y-1/2 items-start' };
    // Slot 2 (upper-left perimeter). Default sits on the outer rail
    // so the seat clears community cards / top branding. Multi-player
    // observer projections retain the in-felt default below.
    case 2:  return variant === 'occupied-2p-face'
      ? { className: 'top-[2%] left-[1%] items-start scale-90' }
      : { className: 'top-[6%] left-[4%] items-start' };
    case 3:  return variant === 'occupied-2p-face'
      ? { className: 'top-[2%] right-[1%] items-end scale-90' }
      : { className: 'top-[6%] right-[4%] items-end' };
    case 4:  return { className: 'top-[50%] right-[1%] -translate-y-1/2 items-end' };
    case 5:  return { className: 'bottom-[2%] right-[2%] items-end' };

    // canonicalization the opponent lives here in BOTH active-canonical
    // (always slot 2 for the single opponent) and observer-absolute
    // (lower-positioned seat projected to HOME, higher to slot 2).
    // Default coords (top-[14%] left-[12%]) sit inside the felt and
    // collide with the top branding band, peg-board score bars, and
    // any title text. Push the 2P face-to-face cluster out to the
    // upper-left rail so it clears gameplay HUD. Multi-player observer
    // projections keep the default in-felt anchor.
    case 2:  return variant === 'occupied-2p-face'
      ? { className: 'top-[2%] left-[1%] items-start scale-90' }
      : { className: 'top-[14%] left-[12%] items-start' };
    case 3:  return variant === 'occupied-2p-face'
      ? { className: 'top-[2%] right-[1%] items-end scale-90' }
      : { className: 'top-[14%] right-[12%] items-end' };
    case 4:  return { className: 'top-[50%] right-[4%] -translate-y-1/2 items-end' };
    case 5:  return { className: 'bottom-[4%] right-[10%] items-end' };
    default: return { className: 'top-2 left-2 items-start' };
  }
}

/**
 * Returns true if the slot lives on the visual right half of the felt
 * (mid-/top-/bottom-right). Used by `CanonicalSeatCluster` to resolve
 * inner-vs-outer decorator side without requiring callers to know the
 * geometry: inner decorations (toward table center) flip side based on
 * which half of the table the seat sits on; outer decorations
 * (dealer pip, etc.) sit on the opposite side. This is the SINGLE
 * source of truth for that mapping.
 */
export function isRightSideCanonicalSlot(
  slot: CanonicalSlot | null | undefined,
): boolean {
  return slot === 3 || slot === 4 || slot === 5;
}

/**
 * Additional vertical offset applied on top of `getCanonicalSlotPlacement`
 * when a seat needs to be raised for ergonomic reasons — currently the
 * Holm multi-player showdown raise that lifts mid-side and top-corner
 * seats so exposed cards do not overlap the community-card lane.
 *
 * Centralizing the raise here keeps the choreography in the projection
 * layer (per the canonical-shell contract) instead of leaking back into
 * MobileGameTable. Returns an empty string when no raise is required
 * for the given slot, so callers can unconditionally concatenate.
 *
 * Magnitudes mirror the previous bespoke MGT classes:
 *   - mid-left (1) / mid-right (4): translate up ~10% of container
 *   - top-left (2) / top-right (3): shift `top-4` → `top-8`
 *
 * Corner perimeter slots (0/5), HOME, FACE_TO_FACE, and BOTTOM_RAIL
 * never raise: their authoritative MGT geometry does not need it.
 */
export function getCanonicalSlotRaiseClass(
  slot: CanonicalSlot | null | undefined,
): string {
  switch (slot) {
    case 1:
    case 4:
      // Override the base `top-1/2` with `top-[40%]` (~10% lift).
      return '!top-[40%]';
    case 2:
    case 3:
      // Override the base `top-[14%]` with `top-[18%]` (~4% lift).
      return '!top-[18%]';
    default:
      return '';
  }
}


