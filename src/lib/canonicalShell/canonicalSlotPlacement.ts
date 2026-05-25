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
): CanonicalSlotPlacement {
  // Percentage-based anchors that hug the elliptical felt rail.
  // Coordinates are calibrated against the table-surface container so
  // perimeter clusters land on the rail edge instead of the container
  // corners. Mirrors the slot percentages MobileGameTable uses for
  // chip-transport endpoints, so visuals stay consistent across
  // canonical surfaces.
  switch (slot) {
    // FACE_TO_FACE — top-center rail (inherently-2P opponent slot)
    case -2: return { className: 'top-[4%] left-1/2 -translate-x-1/2 items-center' };
    // HOME — bottom-center rail (viewer in active-canonical mode)
    case -1: return { className: 'bottom-[4%] left-1/2 -translate-x-1/2 items-center' };
    // BOTTOM_RAIL — observer-only south anchor; flush against the
    // outside rail, below the play zone, so it never obscures
    // gameplay-critical central content.
    case -3: return { className: 'bottom-0 left-1/2 -translate-x-1/2 items-center scale-90' };
    // Bottom-left corner (hugs ellipse rail)
    case 0:  return { className: 'top-[78%] left-[10%] items-start' };
    // Middle-left
    case 1:  return { className: 'top-[50%] left-[4%] -translate-y-1/2 items-start' };
    // Top-left corner
    case 2:  return { className: 'top-[14%] left-[12%] items-start' };
    // Top-right corner
    case 3:  return { className: 'top-[14%] right-[12%] items-end' };
    // Middle-right
    case 4:  return { className: 'top-[50%] right-[4%] -translate-y-1/2 items-end' };
    // Bottom-right corner
    case 5:  return { className: 'top-[78%] right-[10%] items-end' };
    default: return { className: 'top-2 left-2 items-start' };
  }
}
