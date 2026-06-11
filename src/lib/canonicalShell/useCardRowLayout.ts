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
   * Only reached when the budget is genuinely too tight for the
   * preferred fan.
   */
  maxOverlapRatio?: number;
  /**
   * Target overlap fraction for "thoughtful fan" presentation.
   * Overlap is treated as a readability tool (groups the hand into a
   * single visual frame, preserves generous rank/suit visibility) — not
   * merely a fit mechanism. The resolver sizes cards as if this overlap
   * is always present, so it is naturally consumed even when there is
   * leftover horizontal budget. Default 0.18 (≈ rank/suit corner stays
   * fully visible on the trailing edge of every covered card).
   */
  preferredOverlapRatio?: number;
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
    availableHeight,
    count,
    aspect = 0.71,
    minCardWidth = 28,
    maxCardWidth: maxCardWidthIn = 80,
    maxOverlapRatio = 0.6,
    preferredOverlapRatio = 0.18,
  } = input;

  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  if (aspect <= 0) return null;

  // Vertical clamp: when an available height is supplied, the largest
  // legible card cannot be taller than that — derive a height-bound
  // max width and fold it into the maxCardWidth ceiling so cards never
  // intrude into a consumer-reserved region (e.g. action-strip zone).
  const maxCardWidth =
    Number.isFinite(availableHeight) && (availableHeight as number) > 0
      ? Math.min(maxCardWidthIn, (availableHeight as number) * aspect)
      : maxCardWidthIn;

  // Single card — no overlap; clamp to bounds (height- and width-aware).
  if (count === 1) {
    const w = Math.max(minCardWidth, Math.min(maxCardWidth, availableWidth));
    return {
      cardWidth: w,
      cardHeight: w / aspect,
      overlapPx: 0,
      totalWidth: w,
    };
  }

  // Readability-first, "thoughtful fan" sizing:
  //
  //   The objective is to maximize artifact size within the pane while
  //   maintaining canonical aspect ratio. Artifact size is bounded by
  //   the *first* boundary encountered — vertical or horizontal — not
  //   horizontal alone. Overlap is treated as an intentional readability
  //   tool (groups the hand into one visual frame, preserves rank/suit
  //   visibility), not merely a fit mechanism.
  //
  //   Algorithm:
  //     1. Compute the preferred-fan horizontal capacity:
  //          rowSpan(w) = w · (1 + (n-1)·(1 - preferredOverlap))
  //        Solving rowSpan = availableWidth gives the width ceiling
  //        from the horizontal budget at the *preferred* fan density.
  //     2. The vertical ceiling is already baked into maxCardWidth.
  //     3. cardWidth = min(maxCardWidth, widthFromHorizontalBudget) —
  //        whichever boundary is hit first wins.
  //     4. While that width stays ≥ minCardWidth, keep overlap exactly
  //        at preferredOverlap. A height-bound hand therefore leaves
  //        horizontal slack instead of inflating cards by hiding more
  //        of them; the fan stays generous and scannable.
  //     5. Only if the preferred-fan width drops below the readability
  //        floor do we clamp width to minCardWidth and grow overlap
  //        (capped at maxOverlapRatio) — the degenerate small-pane
  //        fallback.
  //
  //   The 3-card ≥ 5-card ≥ 7-card relationship emerges naturally:
  //   growing count increases the fan-density divisor, which
  //   monotonically shrinks the horizontal-budget width ceiling. It is
  //   never targeted as a sizing rule.
  const fanDensity = 1 + (count - 1) * (1 - preferredOverlapRatio);
  const widthFromHorizontalBudget = availableWidth / fanDensity;
  const idealWidth = Math.min(maxCardWidth, widthFromHorizontalBudget);

  if (idealWidth >= minCardWidth) {
    const cardWidth = idealWidth;
    const overlapPx = cardWidth * preferredOverlapRatio;
    const totalWidth = cardWidth + (count - 1) * (cardWidth - overlapPx);
    return {
      cardWidth,
      cardHeight: cardWidth / aspect,
      overlapPx,
      totalWidth,
    };
  }

  // Degenerate small-pane fallback: pin to readability floor, grow
  // overlap up to the rank/suit-corner cap to make the row fit. Never
  // dips below preferredOverlapRatio (small panes only ever need more
  // overlap, not less).
  const cardWidth = minCardWidth;
  const rawOverlapRatio =
    1 - (availableWidth / cardWidth - 1) / (count - 1);
  const overlapRatio = Math.max(
    preferredOverlapRatio,
    Math.min(maxOverlapRatio, rawOverlapRatio),
  );
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
      input.availableHeight,
      input.count,
      input.aspect,
      input.minCardWidth,
      input.maxCardWidth,
      input.maxOverlapRatio,
      input.preferredOverlapRatio,
    ],
  );
}
