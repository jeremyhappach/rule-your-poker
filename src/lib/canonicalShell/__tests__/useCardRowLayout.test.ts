import { describe, it, expect } from 'vitest';
import { resolveCardRowLayout } from '../useCardRowLayout';

describe('resolveCardRowLayout', () => {
  it('returns null when inputs are not measurable', () => {
    expect(resolveCardRowLayout({ availableWidth: 0, count: 5 })).toBeNull();
    expect(resolveCardRowLayout({ availableWidth: 200, count: 0 })).toBeNull();
    expect(resolveCardRowLayout({ availableWidth: NaN, count: 5 })).toBeNull();
  });

  it('single card: clamps to [min,max], no overlap', () => {
    const tiny = resolveCardRowLayout({ availableWidth: 10, count: 1, minCardWidth: 28 });
    expect(tiny!.cardWidth).toBe(28);
    expect(tiny!.overlapPx).toBe(0);
    const huge = resolveCardRowLayout({ availableWidth: 9999, count: 1, maxCardWidth: 80 });
    expect(huge!.cardWidth).toBe(80);
    expect(huge!.overlapPx).toBe(0);
  });

  it('thoughtful fan: width is bounded by min(height-ceiling, horizontal-budget-at-preferred-overlap)', () => {
    // Plenty of width, height caps cardHeight at 90 ⇒ cardWidth ≤ 90 * 0.71.
    const r = resolveCardRowLayout({
      availableWidth: 1000,
      availableHeight: 90,
      count: 3,
      aspect: 0.71,
      maxCardWidth: 200,
    });
    expect(r!.cardHeight).toBeLessThanOrEqual(90 + 1e-6);
    expect(r!.cardWidth).toBeCloseTo(90 * 0.71, 5);
  });

  it('thoughtful fan: preferredOverlap is applied even when there is horizontal slack (height-bound)', () => {
    const r = resolveCardRowLayout({
      availableWidth: 1000,
      availableHeight: 90,
      count: 3,
      aspect: 0.71,
      maxCardWidth: 200,
      preferredOverlapRatio: 0.18,
    });
    // height-bound: overlap should be exactly the preferred ratio, not 0 or saturated
    expect(r!.overlapPx / r!.cardWidth).toBeCloseTo(0.18, 5);
    expect(r!.totalWidth).toBeLessThan(1000); // leaves horizontal slack
  });

  it('thoughtful fan: width-bound case fills the row exactly at preferred overlap', () => {
    const r = resolveCardRowLayout({
      availableWidth: 300,
      count: 5,
      maxCardWidth: 200, // not the binding ceiling
      preferredOverlapRatio: 0.18,
    });
    expect(r!.overlapPx / r!.cardWidth).toBeCloseTo(0.18, 5);
    expect(r!.totalWidth).toBeCloseTo(300, 3);
  });

  it('readability floor: tight budget pins width to min, grows overlap up to maxOverlapRatio', () => {
    const r = resolveCardRowLayout({
      availableWidth: 60,
      count: 7,
      minCardWidth: 28,
      maxCardWidth: 80,
      maxOverlapRatio: 0.6,
    });
    expect(r!.cardWidth).toBe(28);
    const ratio = r!.overlapPx / r!.cardWidth;
    expect(ratio).toBeGreaterThanOrEqual(0.18 - 1e-6);
    expect(ratio).toBeLessThanOrEqual(0.6 + 1e-6);
  });

  it('rank/suit corner is preserved (overlap ≤ maxOverlapRatio in all cases)', () => {
    for (const count of [3, 5, 7]) {
      for (const budget of [120, 180, 240, 320]) {
        const r = resolveCardRowLayout({ availableWidth: budget, count });
        expect(r).not.toBeNull();
        expect(r!.overlapPx / r!.cardWidth).toBeLessThanOrEqual(0.6 + 1e-6);
      }
    }
  });

  it('width is monotonically non-increasing as count grows (emergent, not targeted)', () => {
    for (const budget of [80, 120, 160, 200, 280, 400, 600]) {
      const w3 = resolveCardRowLayout({ availableWidth: budget, count: 3 })!.cardWidth;
      const w5 = resolveCardRowLayout({ availableWidth: budget, count: 5 })!.cardWidth;
      const w7 = resolveCardRowLayout({ availableWidth: budget, count: 7 })!.cardWidth;
      expect(w3).toBeGreaterThanOrEqual(w5 - 1e-6);
      expect(w5).toBeGreaterThanOrEqual(w7 - 1e-6);
    }
  });

  it('derives height from aspect ratio', () => {
    const r = resolveCardRowLayout({ availableWidth: 300, count: 3, aspect: 0.71 });
    expect(r!.cardHeight).toBeCloseTo(r!.cardWidth / 0.71, 5);
  });

  it('availableHeight clamps cardHeight so the resolver never spends reserved vertical space', () => {
    const r = resolveCardRowLayout({
      availableWidth: 1000,
      availableHeight: 60,
      count: 3,
      aspect: 0.71,
      maxCardWidth: 80,
    });
    expect(r!.cardHeight).toBeLessThanOrEqual(60 + 1e-6);
    expect(r!.cardWidth).toBeLessThanOrEqual(60 * 0.71 + 1e-6);
  });

  it('availableHeight is ignored when zero / undefined / non-finite', () => {
    const base = resolveCardRowLayout({ availableWidth: 1000, count: 3, maxCardWidth: 80 })!;
    const zero = resolveCardRowLayout({ availableWidth: 1000, availableHeight: 0, count: 3, maxCardWidth: 80 })!;
    const nan = resolveCardRowLayout({ availableWidth: 1000, availableHeight: NaN, count: 3, maxCardWidth: 80 })!;
    expect(zero.cardWidth).toBe(base.cardWidth);
    expect(nan.cardWidth).toBe(base.cardWidth);
  });
});
