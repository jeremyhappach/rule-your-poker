/**
 * Cribbage Pegging Fan Layout Resolver.
 *
 * Threshold-free adaptive fan for the cribbage pegging row. Given an
 * available horizontal span, an actual card width (ceiling), and the
 * current card count, resolves overlap/gap and total span with an
 * explicit overflow policy.
 *
 * Contract:
 *  - No card-count thresholds. Compression is a pure function of
 *    (naturalSpan / availableSpan).
 *  - Progressive compression begins BEFORE the natural span exceeds
 *    the available span (as soon as the fill ratio crosses
 *    PROGRESSIVE_COMPRESSION_START).
 *  - When compression reaches the minimum readable overlap
 *    (`maxOverlapRatio`), the fan is allowed to OVERHANG the available
 *    span rather than shrinking cards or tightening past readability.
 *  - Cards never shrink below their supplied ceiling width — this
 *    resolver adjusts overlap only. The pegging row uses row-height as
 *    the sole card-size input; horizontal availability drives overlap.
 *
 * Returns a diagnostics payload consumed by the on-screen /
 * exportable `CRIB_PEG_HAND_FAN_LAYOUT` trace.
 */

export type PeggingFanOverflowMode =
  | "natural" // fits at preferred overlap
  | "progressive" // being tightened before overflow
  | "compressedToFit" // tightened up to (but not beyond) max overlap
  | "overhang"; // max overlap reached, fan extends past available span

export interface PeggingFanLayoutInput {
  /** Horizontal budget in px (row width minus badge column + gap). */
  availableSpanPx: number;
  /** Card width in px (rect-driven ceiling; never shrunk). */
  cardWidthPx: number;
  /** Card height in px. */
  cardHeightPx: number;
  /** Number of cards actually rendered. */
  count: number;
  /** Preferred overlap (fraction of card width). Default 0.18. */
  preferredOverlapRatio?: number;
  /** Minimum readable overlap floor (fraction of card width). Default 0.62 — keeps rank+suit corner visible. */
  maxOverlapRatio?: number;
  /** Fill ratio at which progressive compression begins. Default 0.6. */
  progressiveCompressionStart?: number;
}

export interface PeggingFanLayout {
  /** Final card width in px (== input; never shrunk). */
  cardWidthPx: number;
  cardHeightPx: number;
  /** Resolved overlap in px (apply as negative margin-left on all but first). */
  overlapPx: number;
  /** Natural span at preferred overlap. */
  naturalSpanPx: number;
  /** Available horizontal budget (echoed for diagnostics). */
  availableSpanPx: number;
  /** Actual rendered span with resolved overlap. */
  resolvedSpanPx: number;
  /** naturalSpan / availableSpan (0 when availableSpan≤0). */
  fillRatio: number;
  /**
   * Required compression, defined as
   *   max(0, (naturalSpan - availableSpan) / naturalSpan).
   * 0 = fan fits without tightening, 1 = fan would need to collapse
   * to zero span. Used purely for diagnostics; the resolved overlap
   * comes from the piecewise policy below.
   */
  requiredCompression: number;
  overflowMode: PeggingFanOverflowMode;
  /** True when resolvedSpan > availableSpan (i.e. hand overhangs). */
  overhangsAvailable: boolean;
  /** Overhang amount in px on each side (resolvedSpan is centered). */
  overhangPerSidePx: number;
}

export function resolvePeggingFanLayout(input: PeggingFanLayoutInput): PeggingFanLayout {
  const {
    availableSpanPx,
    cardWidthPx,
    cardHeightPx,
    count,
    preferredOverlapRatio = 0.18,
    maxOverlapRatio = 0.62,
    progressiveCompressionStart = 0.6,
  } = input;

  const safeCount = Math.max(0, Math.floor(count));
  const preferredOverlapPx = cardWidthPx * preferredOverlapRatio;
  const maxOverlapPx = cardWidthPx * maxOverlapRatio;

  if (safeCount <= 0 || cardWidthPx <= 0) {
    return {
      cardWidthPx,
      cardHeightPx,
      overlapPx: 0,
      naturalSpanPx: 0,
      availableSpanPx,
      resolvedSpanPx: 0,
      fillRatio: 0,
      requiredCompression: 0,
      overflowMode: "natural",
      overhangsAvailable: false,
      overhangPerSidePx: 0,
    };
  }

  if (safeCount === 1) {
    return {
      cardWidthPx,
      cardHeightPx,
      overlapPx: 0,
      naturalSpanPx: cardWidthPx,
      availableSpanPx,
      resolvedSpanPx: cardWidthPx,
      fillRatio: availableSpanPx > 0 ? cardWidthPx / availableSpanPx : 0,
      requiredCompression: 0,
      overflowMode: "natural",
      overhangsAvailable: cardWidthPx > availableSpanPx,
      overhangPerSidePx: Math.max(0, (cardWidthPx - availableSpanPx) / 2),
    };
  }

  const naturalSpanPx = cardWidthPx + (safeCount - 1) * (cardWidthPx - preferredOverlapPx);

  const fillRatio = availableSpanPx > 0 ? naturalSpanPx / availableSpanPx : Infinity;
  const requiredCompression =
    naturalSpanPx > 0 ? Math.max(0, (naturalSpanPx - availableSpanPx) / naturalSpanPx) : 0;

  // Overlap required to exactly fit the available span at fixed card width.
  //   available = cardW + (n-1)*(cardW - overlap)
  //   overlap = cardW - (available - cardW)/(n-1)
  const overlapToFitPx = cardWidthPx - (availableSpanPx - cardWidthPx) / (safeCount - 1);

  let overlapPx: number;
  let overflowMode: PeggingFanOverflowMode;

  if (fillRatio <= progressiveCompressionStart) {
    // Plenty of room — use preferred overlap.
    overlapPx = preferredOverlapPx;
    overflowMode = "natural";
  } else if (fillRatio < 1) {
    // Progressive compression band. Interpolate overlap between
    // preferred and just-fit as fillRatio walks from
    // progressiveCompressionStart → 1. This makes the 5-card fan
    // visibly tighter well before the hand would overflow.
    const t =
      (fillRatio - progressiveCompressionStart) / (1 - progressiveCompressionStart);
    const clampedT = Math.min(1, Math.max(0, t));
    const targetOverlap = preferredOverlapPx + (overlapToFitPx - preferredOverlapPx) * clampedT;
    overlapPx = Math.min(maxOverlapPx, Math.max(preferredOverlapPx, targetOverlap));
    overflowMode = "progressive";
  } else if (overlapToFitPx <= maxOverlapPx) {
    // Needs tightening but stays within readable floor.
    overlapPx = Math.max(preferredOverlapPx, overlapToFitPx);
    overflowMode = "compressedToFit";
  } else {
    // Readable-overlap floor reached — allow overhang.
    overlapPx = maxOverlapPx;
    overflowMode = "overhang";
  }

  const resolvedSpanPx = cardWidthPx + (safeCount - 1) * (cardWidthPx - overlapPx);
  const overhangsAvailable = resolvedSpanPx > availableSpanPx + 0.5;
  const overhangPerSidePx = overhangsAvailable
    ? (resolvedSpanPx - availableSpanPx) / 2
    : 0;

  return {
    cardWidthPx,
    cardHeightPx,
    overlapPx,
    naturalSpanPx,
    availableSpanPx,
    resolvedSpanPx,
    fillRatio,
    requiredCompression,
    overflowMode,
    overhangsAvailable,
    overhangPerSidePx,
  };
}
