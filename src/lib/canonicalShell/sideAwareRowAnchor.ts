/**
 * Canonical side-aware row-anchor resolver (Geometry Lab boundary).
 *
 * Single source of truth for translating a conceptual
 * (seatSide, attachment) pair into the self-alignment transform a
 * row container must apply so the row's *visible footprint* lands
 * correctly relative to the seat's chip anchor.
 *
 * Contract (visual, NOT render-order):
 *   chip-centered → pin the visual CENTER of the full row footprint
 *   outer-edge    → pin the OUTSIDE table-edge end of the row;
 *                   the row sprawls INWARD toward felt center
 *   inner-edge    → pin the INSIDE (felt-facing) end of the row;
 *                   the row sprawls OUTWARD toward the table edge
 *
 *   left-side opponent:
 *     outer-edge → pinned at row's LEFT end   → selfX =   0%
 *     inner-edge → pinned at row's RIGHT end  → selfX = -100%
 *   right-side opponent:
 *     outer-edge → pinned at row's RIGHT end  → selfX = -100%
 *     inner-edge → pinned at row's LEFT end   → selfX =   0%
 *   either side:
 *     chip-centered                            → selfX =  -50%
 *
 * Card array order is never reversed by this resolver. Fan, overlap,
 * card size, row spacing, Y placement, chip/transport/nameplate
 * anchors are all out of scope.
 *
 * Opt-in: only Geometry Lab opponent-card artifacts that explicitly
 * pass a `SideAwareAttachment` through this resolver get the new
 * semantics. Legacy non-opted-in card rows keep their existing
 * behavior.
 */

export type SeatSide = 'left' | 'right';
export type SideAwareAttachment =
  | 'chip-centered'
  | 'inner-edge'
  | 'outer-edge';

export interface ResolvedRowAnchor {
  /** CSS value for `translateX(...)` on the row container. */
  selfTranslateX: '0%' | '-50%' | '-100%';
}

export function resolveSideAwareRowAnchor(
  seatSide: SeatSide,
  attachment: SideAwareAttachment,
): ResolvedRowAnchor {
  if (attachment === 'chip-centered') {
    return { selfTranslateX: '-50%' };
  }
  const isRight = seatSide === 'right';
  if (attachment === 'outer-edge') {
    // Pin outside table edge → row sprawls inward.
    return { selfTranslateX: isRight ? '-100%' : '0%' };
  }
  // inner-edge: pin felt-facing edge → row sprawls outward.
  return { selfTranslateX: isRight ? '0%' : '-100%' };
}
