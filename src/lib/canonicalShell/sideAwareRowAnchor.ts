/**
 * Canonical side-aware row-anchor resolver (Geometry Lab boundary).
 *
 * Three INDEPENDENT controls — never conflated:
 *
 *   1. attachment       (chip-centered | inner-edge | outer-edge)
 *      WHERE on the chip the row pins.
 *
 *   2. sprawlDirection  (inward | outward)
 *      WHICH WAY the row extends from that pin.
 *        inward  = toward felt center
 *        outward = away from felt center (toward table edge)
 *
 *   3. fan arch  (owned by the renderer, NOT this resolver)
 *      Rotation/tilt orientation only. Never affects pin selection
 *      or sprawl direction.
 *
 * Card array order is never reversed by this resolver. Card size,
 * overlap, Y placement, chip/transport/nameplate anchors are out of
 * scope.
 *
 * Pin endpoint contract (no array reversal — purely a self-translate):
 *   chip-centered → selfTranslateX = -50%
 *   row extends RIGHT (pin first card)  → selfTranslateX =   0%
 *   row extends LEFT  (pin last  card)  → selfTranslateX = -100%
 *
 * Row extends RIGHT iff:
 *     (side==='left'  && sprawl==='inward')  ||
 *     (side==='right' && sprawl==='outward')
 *
 * Attachment offset is reported as an INWARD MAGNITUDE so the caller
 * can multiply by the actual measured chip-disc radius and the
 * felt-relative inward sign:
 *   inner-edge   → +1  (rim toward felt center)
 *   outer-edge   → -1  (rim away from felt center)
 *   chip-centered →  0  (no rim offset)
 */

export type SeatSide = 'left' | 'right';
export type SideAwareAttachment =
  | 'chip-centered'
  | 'inner-edge'
  | 'outer-edge';
export type SprawlDirection = 'inward' | 'outward';

export interface ResolvedRowAnchor {
  /** CSS value for `translateX(...)` on the row container. */
  selfTranslateX: '0%' | '-50%' | '-100%';
  /**
   * Multiplier for chip-disc radius along the felt-INWARD direction.
   *   inner-edge   → +1
   *   outer-edge   → -1
   *   chip-centered → 0
   * The caller multiplies by `inwardCssSign * chipRadiusPx` and adds
   * to the row's CSS X translation.
   */
  anchorInwardMagnitude: -1 | 0 | 1;
}

export function resolveSideAwareRowAnchor(
  seatSide: SeatSide,
  attachment: SideAwareAttachment,
  sprawl: SprawlDirection = 'inward',
): ResolvedRowAnchor {
  if (attachment === 'chip-centered') {
    return { selfTranslateX: '-50%', anchorInwardMagnitude: 0 };
  }
  const extendsRight =
    (seatSide === 'left' && sprawl === 'inward') ||
    (seatSide === 'right' && sprawl === 'outward');
  const selfTranslateX: '0%' | '-100%' = extendsRight ? '0%' : '-100%';
  const anchorInwardMagnitude: -1 | 1 =
    attachment === 'inner-edge' ? 1 : -1;
  return { selfTranslateX, anchorInwardMagnitude };
}
