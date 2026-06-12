/**
 * useDieRowLayout — Wave 2D thin wrapper around the shared
 * artifact-row sizing algorithm.
 *
 * Dice geometry shares math with cards (artifact-row sizing) but
 * differs in two parameter regimes:
 *   - aspect = 1 (square)
 *   - never overlap; instead, adjacent items are separated by a gap
 *
 * Rather than duplicate the resolver, this wrapper delegates to
 * `resolveCardRowLayout` with overlap pinned at 0. The supplied
 * `gapPx` is removed from the available width up-front, so the
 * resolver only sizes the items themselves and the wrapper restores
 * the gap when reporting `totalWidth`.
 *
 * Scope (Wave 2D):
 *   - Pure math. No DOM reads. No side effects.
 *   - Caller passes the pane width budget (typically measured via
 *     a ResizeObserver on a `[data-…-active-pane-content]` ancestor).
 *   - Returns `null` when inputs are not yet measurable so callers
 *     can fall back to their pre-existing static size (zero visual
 *     change on the first frame).
 *
 * Consumer API is intentionally die-shaped (no `cardWidth` leak):
 *   const layout = useDieRowLayout({
 *     availableWidth: paneWidthPx,
 *     count: 5,
 *     minDieSize: 28,
 *     maxDieSize: 96,
 *     gapPx: 4,
 *   });
 *   if (layout) {
 *     row.style.gap = `${layout.gapPx}px`;
 *     die.size = snapToLadder(layout.dieSize);
 *   }
 *
 * Constraints honored:
 *   - `useCardRowLayout` is **not** modified.
 *   - No existing card-row consumer is touched.
 *   - No rename, no signature change, no provider added.
 */
import { useMemo } from 'react';
import { resolveCardRowLayout } from './useCardRowLayout';

export interface DieRowLayoutInput {
  /** Horizontal budget for the die row in CSS pixels. */
  availableWidth: number;
  /** Number of dice in the row. */
  count: number;
  /** Smallest legible die edge in px. Default 28 (matches the dice xs bucket). */
  minDieSize?: number;
  /** Largest desired die edge in px. Default 96 (matches the dice xl bucket). */
  maxDieSize?: number;
  /** Inter-die gap in px (constant; not negotiated by the algorithm). Default 4. */
  gapPx?: number;
}

export interface DieRowLayout {
  /** Resolved square die edge in px. */
  dieSize: number;
  /** Echo of the input gap in px (so callers can apply it as inline `style.gap`). */
  gapPx: number;
  /** Total rendered width of the row in px including gaps. */
  totalWidth: number;
}

export function resolveDieRowLayout(input: DieRowLayoutInput): DieRowLayout | null {
  const {
    availableWidth,
    count,
    minDieSize = 28,
    maxDieSize = 96,
    gapPx = 4,
  } = input;

  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return null;
  if (!Number.isFinite(count) || count <= 0) return null;

  // Reserve gaps up-front so the shared algorithm only sizes the items.
  const gapsTotal = Math.max(0, count - 1) * gapPx;
  const widthForItems = Math.max(0, availableWidth - gapsTotal);

  const layout = resolveCardRowLayout({
    availableWidth: widthForItems,
    count,
    aspect: 1, // square dice
    minCardWidth: minDieSize,
    maxCardWidth: maxDieSize,
    preferredOverlapRatio: 0, // dice never overlap
    maxOverlapRatio: 0,
  });
  if (!layout) return null;

  const dieSize = layout.cardWidth;
  return {
    dieSize,
    gapPx,
    totalWidth: dieSize * count + gapsTotal,
  };
}

export function useDieRowLayout(input: DieRowLayoutInput): DieRowLayout | null {
  return useMemo(
    () => resolveDieRowLayout(input),
    [input.availableWidth, input.count, input.minDieSize, input.maxDieSize, input.gapPx],
  );
}
