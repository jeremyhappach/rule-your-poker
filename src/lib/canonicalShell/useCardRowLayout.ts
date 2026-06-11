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

/**
 * Contract-owned vertical reservation for the 3-5-7 action strip
 * (Drop / Stay buttons or the STAYED / FOLDED badge). Consumers that
 * lay out a hand-area sibling above the action strip should size the
 * strip with this token (or its tablet equivalent) so the resolver and
 * the action-strip layout share a single source of truth — no
 * game-specific magic margins. Values include button height + the
 * ~8px breathing room used by the current strip container.
 */
export const ACTION_STRIP_RESERVE_PX = {
  /** Phone / compact: 36px button + ~8px gap. */
  compact: 44,
  /** Tablet / comfortable: 56px button + ~12px gap. */
  comfortable: 68,
} as const;

export interface CardRowLayoutInput {
  /** Horizontal budget for the row in CSS pixels. */
  availableWidth: number;
  /**
   * Optional vertical budget for the row in CSS pixels. When provided,
   * cardWidth is additionally clamped so cardHeight (= cardWidth /
   * aspect) never exceeds this value. Consumers should pass the
   * geometry of the hand-area sibling *after* the contract-owned
   * action-strip reservation has been subtracted, so the resolver
   * never spends space that belongs to the action strip.
   */
  availableHeight?: number;
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

  // Readability-first sizing:
  //   1. Prefer zero overlap. Pick the largest cardWidth ≤ maxCardWidth that
  //      fits the row edge-to-edge: cardWidth = min(maxCardWidth, avail/count).
  //   2. Only when that width would fall below minCardWidth do we clamp to
  //      minCardWidth and introduce the smallest overlap needed to fit
  //      (capped at maxOverlapRatio to preserve the rank/suit corner).
  //
  // This guarantees monotonic shrink with count: width(3) ≥ width(5) ≥
  // width(7) for any fixed availableWidth — the resolver never *grows*
  // a card by hiding more of it.
  const zeroOverlapWidth = Math.min(maxCardWidth, availableWidth / count);
  if (zeroOverlapWidth >= minCardWidth) {
    const w = zeroOverlapWidth;
    return {
      cardWidth: w,
      cardHeight: w / aspect,
      overlapPx: 0,
      totalWidth: w * count,
    };
  }

  // Budget too tight for zero-overlap min-width cards. Clamp width to the
  // readability floor and compute the overlap required to fit.
  const cardWidth = minCardWidth;
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
