/**
 * useCardRowLayout — Wave 2A of the Responsive Geometry Contract.
 *
 * Pure resolver hook. Given an available horizontal budget and a card
 * count, returns the card pixel dimensions and overlap (negative margin)
 * needed to fit the row within budget while preserving rank/suit
 * readability.
 *
 * Scope (Wave 2A):
 *   - Pure math. No DOM reads. No side effects.
 *   - No coupling to Wave 1 primitives (caller passes `availableWidth`).
 *   - Caller decides what fraction of play/pane geometry to allocate.
 *   - Returns `null` when inputs are not yet measurable so callers can
 *     fall back to their pre-existing static layout (zero visual change
 *     before geometry is ready).
 *
 * Readability invariants:
 *   - Card width is clamped to [minCardWidth, maxCardWidth].
 *   - Overlap never hides more than `maxOverlapRatio` of a card's width,
 *     so the rank+suit corner is always visible.
 *
 * Example consumer (3-5-7 hand row):
 *   const layout = useCardRowLayout({
 *     availableWidth: play.width * 0.24,
 *     count: cards.length,
 *   });
 *   if (layout) {
 *     style = { width: layout.cardWidth, height: layout.cardHeight,
 *               marginLeft: -layout.overlapPx };
 *   }
 */
import { useMemo } from 'react';

export interface CardRowLayoutInput {
  /** Horizontal budget for the row in CSS pixels. */
  availableWidth: number;
  /** Number of cards in the row. */
  count: number;
  /** Card aspect ratio (width / height). Standard playing card ≈ 0.71. */
  aspect?: number;
  /** Smallest legible card width in px. */
  minCardWidth?: number;
  /** Largest desired card width in px. */
  maxCardWidth?: number;
  /**
   * Maximum fraction of a card's width that may be hidden by the
   * following card. Default 0.6 — keeps the rank/suit corner visible.
   */
  maxOverlapRatio?: number;
}

export interface CardRowLayout {
  /** Resolved card width in px. */
  cardWidth: number;
  /** Resolved card height in px (cardWidth / aspect). */
  cardHeight: number;
  /** Overlap between adjacent cards in px (apply as negative margin). */
  overlapPx: number;
  /** Total rendered width of the row in px. */
  totalWidth: number;
}

export function resolveCardRowLayout(input: CardRowLayoutInput): CardRowLayout | null {
  const {
    availableWidth,
    count,
    aspect = 0.71,
    minCardWidth = 28,
    maxCardWidth = 80,
    maxOverlapRatio = 0.6,
  } = input;

  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  if (aspect <= 0) return null;

  // Single card — no overlap; clamp to bounds.
  if (count === 1) {
    const w = Math.max(minCardWidth, Math.min(maxCardWidth, availableWidth));
    return {
      cardWidth: w,
      cardHeight: w / aspect,
      overlapPx: 0,
      totalWidth: w,
    };
  }

  // Try max width first. If the row fits with zero overlap, we're done.
  const ideal = Math.min(maxCardWidth, availableWidth / count);
  if (ideal >= minCardWidth && ideal * count <= availableWidth) {
    const w = ideal;
    return {
      cardWidth: w,
      cardHeight: w / aspect,
      overlapPx: 0,
      totalWidth: w * count,
    };
  }

  // Otherwise pick the largest cardWidth in [minCardWidth, maxCardWidth]
  // such that the required overlap stays within maxOverlapRatio.
  //   totalWidth = cardWidth * (1 + (count - 1) * (1 - overlapRatio)) ≤ availableWidth
  //   overlapRatio = 1 - (availableWidth / cardWidth - 1) / (count - 1)
  // Solve for the cardWidth where overlapRatio == maxOverlapRatio:
  //   cardWidth = availableWidth / (1 + (count - 1) * (1 - maxOverlapRatio))
  const maxFittable =
    availableWidth / (1 + (count - 1) * (1 - maxOverlapRatio));
  const cardWidth = Math.max(
    minCardWidth,
    Math.min(maxCardWidth, maxFittable),
  );

  // Recompute overlap from the resolved cardWidth, clamped to bounds.
  const rawOverlapRatio =
    1 - (availableWidth / cardWidth - 1) / (count - 1);
  const overlapRatio = Math.max(0, Math.min(maxOverlapRatio, rawOverlapRatio));
  const overlapPx = cardWidth * overlapRatio;
  const totalWidth = cardWidth + (count - 1) * (cardWidth - overlapPx);

  return {
    cardWidth,
    cardHeight: cardWidth / aspect,
    overlapPx,
    totalWidth,
  };
}

export function useCardRowLayout(input: CardRowLayoutInput): CardRowLayout | null {
  return useMemo(
    () => resolveCardRowLayout(input),
    [
      input.availableWidth,
      input.count,
      input.aspect,
      input.minCardWidth,
      input.maxCardWidth,
      input.maxOverlapRatio,
    ],
  );
}
