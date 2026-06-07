/**
 * useCardRowLayout — Wave 2 of the Responsive Geometry Contract.
 *
 * Pure geometry resolver for a horizontal row of cards. Given a width
 * budget, a height budget, and the number of cards, returns the
 * largest per-card size that:
 *
 *   1. Keeps every card within the available height.
 *   2. Fits the full row within the available width using at most
 *      `maxOverlapPct` overlap between adjacent cards.
 *   3. Respects a minimum readable footprint so rank/suit are not
 *      shrunk past legibility.
 *
 * No device branching. No game-specific magic numbers. Consumers are
 * expected to pass real pane/play geometry from `usePaneGeometry` or
 * `usePlayGeometry` and a card aspect ratio. This is the first
 * geometry consumer used to validate the contract on the 3-5-7 active
 * player hand (3 / 5 / 7 cards) before broader rollout.
 *
 * Algorithm:
 *   - Height-cap: cardHeight = min(availableHeight, ∞);
 *                  widthFromHeight = cardHeight * aspectRatio.
 *   - Width-cap with overlap budget: a row of N cards with per-card
 *     overlap `o` (0..1 of cardWidth) occupies
 *       totalWidth = cardWidth * (1 + (N-1) * (1 - o))
 *     Solving for cardWidth at the max overlap yields the smallest
 *     cardWidth still allowed by the overlap rule.
 *   - cardWidth = min(widthFromHeight, widthCap).
 *   - Actual overlap used = the minimum overlap (down to 0) needed
 *     to make the row fit at that cardWidth; the contract never
 *     overlaps more than necessary.
 *   - `fits = true` iff the resolved card footprint clears the
 *     `minReadableRankArea` threshold AND the row fits within the
 *     available rectangle.
 *
 * Consumers can either:
 *   (a) render at the returned pixel sizes directly, or
 *   (b) keep their existing intrinsic markup and apply a CSS scale of
 *       `cardWidth / naturalCardWidth` — the path used in Wave 2 by
 *       the 3-5-7 hand wedge so PlayerHand internals stay untouched.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface CardRowLayoutInput {
  /** Width budget for the row, in CSS pixels. */
  availableWidth: number;
  /** Height budget for the row, in CSS pixels. */
  availableHeight: number;
  /** Number of cards in the row (≥ 0). */
  cardCount: number;
  /** Card aspect ratio (width / height). e.g. ~0.7 for playing cards. */
  aspectRatio: number;
  /**
   * Minimum readable footprint of the rank+suit corner glyph block,
   * expressed as a square edge length in CSS pixels. Default 22.
   * The contract treats `cardWidth * 0.3` as the rank-area edge.
   */
  minReadableRankArea?: number;
  /**
   * Maximum allowed overlap between adjacent cards, expressed as a
   * fraction of `cardWidth`. 0 = no overlap; 0.6 = up to 60% of a
   * card may be hidden by the next one. Default 0.4.
   */
  maxOverlapPct?: number;
}

export interface CardRowLayout {
  cardWidth: number;
  cardHeight: number;
  /** Overlap between adjacent cards in CSS pixels. 0 when row fits. */
  overlapPx: number;
  /** Resolved width of the full row. */
  totalWidth: number;
  /** True if the resolved layout satisfies all constraints. */
  fits: boolean;
}

const ZERO_LAYOUT: CardRowLayout = {
  cardWidth: 0,
  cardHeight: 0,
  overlapPx: 0,
  totalWidth: 0,
  fits: false,
};

export function useCardRowLayout(input: CardRowLayoutInput): CardRowLayout {
  const {
    availableWidth,
    availableHeight,
    cardCount,
    aspectRatio,
    minReadableRankArea = 22,
    maxOverlapPct = 0.4,
  } = input;

  return useMemo<CardRowLayout>(() => {
    if (
      cardCount <= 0 ||
      availableWidth <= 0 ||
      availableHeight <= 0 ||
      aspectRatio <= 0
    ) {
      return ZERO_LAYOUT;
    }

    const N = cardCount;
    const overlapBudget = Math.max(0, Math.min(0.95, maxOverlapPct));

    // 1. Height cap → derived width.
    const cardHeightFromHeight = availableHeight;
    const widthFromHeight = cardHeightFromHeight * aspectRatio;

    // 2. Width cap allowing maximum overlap.
    //    totalWidth = cardWidth * (1 + (N-1) * (1 - overlap))
    //    Solve for cardWidth at totalWidth = availableWidth, overlap = budget.
    const widthDenomMax = 1 + (N - 1) * (1 - overlapBudget);
    const widthCapMaxOverlap = availableWidth / Math.max(0.0001, widthDenomMax);

    // Final per-card width = whichever cap is smaller.
    let cardWidth = Math.min(widthFromHeight, widthCapMaxOverlap);
    let cardHeight = cardWidth / aspectRatio;

    // 3. Determine the *minimum* overlap (≥ 0) required so the row
    //    fits at this width. Prefer no overlap whenever possible.
    let overlapPct = 0;
    const naturalRowWidth = cardWidth * N;
    if (naturalRowWidth > availableWidth && N > 1) {
      // Need to compress: solve cardWidth*(1 + (N-1)*(1-o)) = availableWidth
      // => (1-o) = (availableWidth/cardWidth - 1) / (N-1)
      const oneMinusO = (availableWidth / cardWidth - 1) / (N - 1);
      overlapPct = Math.max(0, Math.min(overlapBudget, 1 - oneMinusO));
    }
    const overlapPx = cardWidth * overlapPct;
    const totalWidth = cardWidth * (1 + (N - 1) * (1 - overlapPct));

    // 4. Readability gate. We treat the rank-area edge as ~30% of
    //    cardWidth (matches the corner glyph block in PlayingCard).
    const rankAreaEdge = cardWidth * 0.3;
    const readable = rankAreaEdge >= minReadableRankArea * 0.3;
    const withinBounds =
      totalWidth <= availableWidth + 0.5 && cardHeight <= availableHeight + 0.5;

    return {
      cardWidth,
      cardHeight,
      overlapPx,
      totalWidth,
      fits: readable && withinBounds,
    };
  }, [availableWidth, availableHeight, cardCount, aspectRatio, minReadableRankArea, maxOverlapPct]);
}

/**
 * useFitToWidthScale — measurement helper used by Wave 2 consumers
 * that want to keep existing intrinsic markup (e.g. PlayerHand) and
 * apply a CSS scale to hit the geometry-resolved row width.
 *
 * Returns `{ ref, scale, naturalWidth }`. Attach `ref` to the element
 * whose intrinsic (unscaled) width should match the target. `scale`
 * is the multiplier to apply via `transform: scale(...)`.
 */
export function useFitToWidthScale(targetWidth: number, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      // Use scrollWidth so transform scale on the node itself doesn't
      // feed back into the measurement.
      const w = node.scrollWidth;
      setNaturalWidth(prev => (Math.abs(prev - w) < 0.5 ? prev : w));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(node);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scale =
    naturalWidth > 0 && targetWidth > 0
      ? Math.min(targetWidth / naturalWidth, 6) // clamp absurd values
      : 1;

  return { ref, scale, naturalWidth };
}
