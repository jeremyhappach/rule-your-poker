import { describe, it, expect } from 'vitest';
import { resolveCardRowLayout } from '../useCardRowLayout';

describe('resolveCardRowLayout', () => {
  it('returns null when inputs are not measurable', () => {
    expect(resolveCardRowLayout({ availableWidth: 0, count: 5 })).toBeNull();
    expect(resolveCardRowLayout({ availableWidth: 200, count: 0 })).toBeNull();
    expect(resolveCardRowLayout({ availableWidth: NaN, count: 5 })).toBeNull();
  });

  it('single card: clamps to [min,max]', () => {
    const tiny = resolveCardRowLayout({ availableWidth: 10, count: 1, minCardWidth: 28 });
    expect(tiny!.cardWidth).toBe(28);
    const huge = resolveCardRowLayout({ availableWidth: 9999, count: 1, maxCardWidth: 80 });
    expect(huge!.cardWidth).toBe(80);
  });

  it('row fits at ideal width: zero overlap', () => {
    const r = resolveCardRowLayout({ availableWidth: 500, count: 5, maxCardWidth: 80 });
    expect(r!.overlapPx).toBe(0);
    expect(r!.cardWidth).toBe(80);
    expect(r!.totalWidth).toBeLessThanOrEqual(500);
  });

  it('tight budget: introduces overlap but stays within readability cap', () => {
    const r = resolveCardRowLayout({
      availableWidth: 200,
      count: 7,
      maxCardWidth: 80,
      minCardWidth: 28,
      maxOverlapRatio: 0.6,
    });
    expect(r).not.toBeNull();
    expect(r!.cardWidth).toBeGreaterThanOrEqual(28);
    expect(r!.cardWidth).toBeLessThanOrEqual(80);
    const overlapRatio = r!.overlapPx / r!.cardWidth;
    expect(overlapRatio).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(overlapRatio).toBeGreaterThanOrEqual(0);
  });

  it('extremely tight budget: clamps to min width and saturates overlap', () => {
    const r = resolveCardRowLayout({
      availableWidth: 60,
      count: 7,
      maxCardWidth: 80,
      minCardWidth: 28,
      maxOverlapRatio: 0.6,
    });
    expect(r!.cardWidth).toBe(28);
    // overlap saturates at maxOverlapRatio when budget is below minimum row width
    expect(r!.overlapPx / r!.cardWidth).toBeCloseTo(0.6, 5);
  });

  it('derives height from aspect ratio', () => {
    const r = resolveCardRowLayout({ availableWidth: 300, count: 3, aspect: 0.71 });
    expect(r!.cardHeight).toBeCloseTo(r!.cardWidth / 0.71, 5);
  });

  it('rank/suit corner is preserved (overlap ≤ 60% by default)', () => {
    for (const count of [3, 5, 7]) {
      for (const budget of [120, 180, 240, 320]) {
        const r = resolveCardRowLayout({ availableWidth: budget, count });
        expect(r).not.toBeNull();
        expect(r!.overlapPx / r!.cardWidth).toBeLessThanOrEqual(0.6 + 1e-6);
      }
    }
  });

  it('readability-first: width is monotonically non-increasing as count grows', () => {
    // For any fixed budget, more cards must never produce *larger* cards
    // (which would happen if the resolver inflated overlap to grow width).
    for (const budget of [80, 120, 160, 200, 280, 400, 600]) {
      const w3 = resolveCardRowLayout({ availableWidth: budget, count: 3 })!.cardWidth;
      const w5 = resolveCardRowLayout({ availableWidth: budget, count: 5 })!.cardWidth;
      const w7 = resolveCardRowLayout({ availableWidth: budget, count: 7 })!.cardWidth;
      expect(w3).toBeGreaterThanOrEqual(w5 - 1e-6);
      expect(w5).toBeGreaterThanOrEqual(w7 - 1e-6);
    }
  });

  it('readability-first: prefers zero overlap until min-width floor is hit', () => {
    // Budget comfortably fits min-width cards edge-to-edge → overlap must be 0.
    const r = resolveCardRowLayout({
      availableWidth: 28 * 7 + 50, // well above 7 × minCardWidth
      count: 7,
      minCardWidth: 28,
      maxCardWidth: 80,
    });
    expect(r!.overlapPx).toBe(0);
  });
});
