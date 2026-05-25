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
 * that hosts CanonicalFeltSurface). Intended for `flex flex-col items-*`
 * stacks (name above, chip circle below).
 */
export function getCanonicalSlotPlacement(
  slot: CanonicalSlot | null | undefined,
  variant: 'occupied' | 'open-seat' = 'occupied',
): CanonicalSlotPlacement {
  // Percentage-based anchors that hug the elliptical felt rail.
  switch (slot) {
    case -2: return { className: 'top-[4%] left-1/2 -translate-x-1/2 items-center' };
    case -1: return { className: 'bottom-[4%] left-1/2 -translate-x-1/2 items-center' };
    // BOTTOM_RAIL — observer-only anchor for absolute "south" (pos 4).
    // Two variants:
    //   - 'open-seat': cleanly centered on the bottom rail. The empty
    //     join affordance is a small dashed circle and does not
    //     visually compete with central gameplay content (since there
    //     IS no central gameplay content while in waiting state).
    //   - 'occupied': shifted to the bottom-right perimeter rail
    //     (offset from slot-5 corner cluster) so the participant chip
    //     bubble never sits in the gameplay action lane (pegging
    //     count, played-card row, dice tray) during active gameplay.
    case -3:
      return variant === 'open-seat'
        ? { className: 'bottom-[4%] left-1/2 -translate-x-1/2 items-center' }
        : { className: 'bottom-[1%] right-[28%] items-end scale-90' };
    case 0:  return { className: 'top-[78%] left-[10%] items-start' };
    case 1:  return { className: 'top-[50%] left-[4%] -translate-y-1/2 items-start' };
    case 2:  return { className: 'top-[14%] left-[12%] items-start' };
    case 3:  return { className: 'top-[14%] right-[12%] items-end' };
    case 4:  return { className: 'top-[50%] right-[4%] -translate-y-1/2 items-end' };
    case 5:  return { className: 'top-[78%] right-[10%] items-end' };
    default: return { className: 'top-2 left-2 items-start' };
  }
}

