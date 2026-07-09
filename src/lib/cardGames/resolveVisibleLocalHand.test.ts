import { describe, it, expect } from 'vitest';
import { resolveVisibleLocalHand } from './resolveVisibleLocalHand';

type C = { id: string };
const A: C = { id: 'A' };
const B: C = { id: 'B' };
const C: C = { id: 'C' };

describe('resolveVisibleLocalHand', () => {
  it('self-heals to authoritative when presentation is empty post-deal', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [],
      isPostDealPhase: true,
    });
    expect(r.decision).toBe('render-authoritative-self-heal');
    expect(r.hand).toEqual([A, B, C]);
  });

  it('self-heal overrides parent suppression when invariant would break', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: [A, B],
      presentationHand: [],
      isPostDealPhase: true,
      parentSuppressed: true,
    });
    expect(r.decision).toBe('render-authoritative-self-heal');
    expect(r.hand).toEqual([A, B]);
  });

  it('renders empty when parent suppresses pre-deal (invariant not at risk)', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: null,
      presentationHand: [],
      isPostDealPhase: false,
      parentSuppressed: true,
    });
    expect(r.decision).toBe('render-empty-blocked-current-hand');
    expect(r.hand).toEqual([]);
  });

  it('trusts non-empty presentation during opening deal (partial reveal)', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [A, B],
      isPostDealPhase: false,
      allowPreDealEmpty: true,
    });
    expect(r.decision).toBe('render-presentation');
    expect(r.hand).toEqual([A, B]);
  });

  it('renders empty pre-deal without authoritative cards', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: null,
      presentationHand: [],
      isPostDealPhase: false,
      allowPreDealEmpty: true,
    });
    expect(r.decision).toBe('render-empty-pre-deal');
  });

  it('never lets empty presentation suppress non-empty authoritative post-deal', () => {
    // Simulates stuck transport (PRE_DEAL/DEALING) with full auth hand.
    const r = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [],
      isPostDealPhase: true,
      parentSuppressed: false,
    });
    expect(r.hand).toEqual([A, B, C]);
  });

  it('does not self-heal pre-deal (respects card-by-card reveal window)', () => {
    const r = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [],
      isPostDealPhase: false,
      allowPreDealEmpty: true,
    });
    expect(r.decision).toBe('render-empty-pre-deal');
    expect(r.hand).toEqual([]);
  });

  it('rejects stale-empty overwrite when hydration and realtime converge', () => {
    // Hydration path: sees authoritative full, presentation empty.
    const hydration = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [],
      isPostDealPhase: true,
    });
    // Realtime path: sees the same auth, presentation caught up.
    const realtime = resolveVisibleLocalHand({
      authoritativeHand: [A, B, C],
      presentationHand: [A, B, C],
      isPostDealPhase: true,
    });
    expect(hydration.hand).toEqual(realtime.hand);
  });
});
