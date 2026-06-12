import { describe, it, expect } from 'vitest';
import { resolveDieRowLayout } from '../useDieRowLayout';

describe('resolveDieRowLayout', () => {
  it('returns null when inputs are not measurable', () => {
    expect(resolveDieRowLayout({ availableWidth: 0, count: 5 })).toBeNull();
    expect(resolveDieRowLayout({ availableWidth: 200, count: 0 })).toBeNull();
    expect(resolveDieRowLayout({ availableWidth: NaN, count: 5 })).toBeNull();
  });

  it('plenty of width: clamps at maxDieSize, echoes gap, computes totalWidth with gaps', () => {
    const r = resolveDieRowLayout({
      availableWidth: 1000,
      count: 5,
      minDieSize: 28,
      maxDieSize: 96,
      gapPx: 8,
    })!;
    expect(r.dieSize).toBe(96);
    expect(r.gapPx).toBe(8);
    expect(r.totalWidth).toBe(96 * 5 + 8 * 4);
  });

  it('tight pane: shrinks dieSize toward minDieSize and never overlaps', () => {
    const r = resolveDieRowLayout({
      availableWidth: 200,
      count: 5,
      minDieSize: 28,
      maxDieSize: 96,
      gapPx: 4,
    })!;
    expect(r.dieSize).toBeGreaterThanOrEqual(28);
    expect(r.dieSize).toBeLessThan(96);
    // Footprint fits within budget (rounded to within 1px tolerance).
    expect(r.totalWidth).toBeLessThanOrEqual(200 + 1e-6);
  });

  it('square aspect: dieSize is a single number, not card-shaped', () => {
    const r = resolveDieRowLayout({ availableWidth: 400, count: 5, maxDieSize: 60, gapPx: 4 })!;
    expect(r.dieSize).toBe(60);
  });

  it('count=1: single die clamped to ceilings, gapPx echoed but unused in totalWidth', () => {
    const r = resolveDieRowLayout({ availableWidth: 1000, count: 1, maxDieSize: 96, gapPx: 8 })!;
    expect(r.dieSize).toBe(96);
    expect(r.totalWidth).toBe(96);
  });
});
