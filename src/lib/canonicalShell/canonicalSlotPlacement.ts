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
  switch (slot) {
    // FACE_TO_FACE — top-center rail
    case -2: return { className: 'top-1 left-1/2 -translate-x-1/2 items-center' };
    // HOME — bottom-center rail (NOT inside felt play zone)
    case -1: return { className: 'bottom-1 left-1/2 -translate-x-1/2 items-center' };
    // Bottom-left corner
    case 0:  return { className: 'bottom-2 left-2 items-start' };
    // Middle-left
    case 1:  return { className: 'top-1/2 left-2 -translate-y-1/2 items-start' };
    // Top-left corner
    case 2:  return { className: 'top-2 left-2 items-start' };
    // Top-right corner
    case 3:  return { className: 'top-2 right-2 items-end' };
    // Middle-right
    case 4:  return { className: 'top-1/2 right-2 -translate-y-1/2 items-end' };
    // Bottom-right corner
    case 5:  return { className: 'bottom-2 right-2 items-end' };
    default: return { className: 'top-2 left-2 items-start' };
  }
}
