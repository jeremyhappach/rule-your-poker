import { describe, it, expect } from 'vitest';
import { getCribbageProgress, CribbageStateForProgress } from './cribbageProgress';
import { compareProgress } from './stateProgress';

function stubState(overrides: Partial<CribbageStateForProgress> & { handNumber?: number }): CribbageStateForProgress {
  return {
    phase: 'discarding',
    pegging: { playedCards: [] },
    crib: [],
    playerStates: {},
    handNumber: 1,
    ...overrides,
  };
}

describe('getCribbageProgress', () => {
  it('null state returns zero vector', () => {
    expect(getCribbageProgress(null)).toEqual([0, 0, 0, 0, 0]);
  });

  // ── Phase C prereq: dealer-select dims ───────────────────────

  it('dealer-select → dealing (resolution latch) is forward', () => {
    const select = stubState({ phase: 'dealer-select', dealerResolved: false } as any);
    const dealing = stubState({ phase: 'dealing' });
    expect(compareProgress(getCribbageProgress(select), getCribbageProgress(dealing))).toBe(1);
  });

  it('dealer-select tie redraw (cohort++) is forward', () => {
    const c0 = stubState({ phase: 'dealer-select', dealerSelectionCohort: 0, dealerResolved: false } as any);
    const c1 = stubState({ phase: 'dealer-select', dealerSelectionCohort: 1, dealerResolved: false } as any);
    expect(compareProgress(getCribbageProgress(c0), getCribbageProgress(c1))).toBe(1);
  });

  it('dealer-select resolved within same cohort is forward', () => {
    const unresolved = stubState({ phase: 'dealer-select', dealerSelectionCohort: 0, dealerResolved: false } as any);
    const resolved = stubState({ phase: 'dealer-select', dealerSelectionCohort: 0, dealerResolved: true } as any);
    expect(compareProgress(getCribbageProgress(unresolved), getCribbageProgress(resolved))).toBe(1);
  });

  it('legacy (no cohort/resolved fields) snapshot is treated as resolved', () => {
    const legacy = stubState({ phase: 'dealing' });
    const vec = getCribbageProgress(legacy);
    // [hand=1, cohort=0, resolved=1, phaseOrd=0, sub=0]
    expect(vec).toEqual([1, 0, 1, 0, 0]);
  });

  it('discarding → cutting is forward', () => {
    const a = stubState({ phase: 'discarding', crib: [1, 2, 3, 4] as any });
    const b = stubState({ phase: 'cutting', crib: [1, 2, 3, 4] as any });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('cutting → pegging is forward', () => {
    const a = stubState({ phase: 'cutting' });
    const b = stubState({ phase: 'pegging' });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('pegging → counting is forward', () => {
    const a = stubState({ phase: 'pegging', pegging: { playedCards: new Array(8) } });
    const b = stubState({ phase: 'counting', pegging: { playedCards: new Array(8) } });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('counting → complete is forward', () => {
    const a = stubState({ phase: 'counting' });
    const b = stubState({ phase: 'complete' });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('discard progress within discarding phase', () => {
    const a = stubState({
      phase: 'discarding',
      playerStates: { p1: { discardedToCrib: [] }, p2: { discardedToCrib: [] } },
    });
    const b = stubState({
      phase: 'discarding',
      playerStates: { p1: { discardedToCrib: [1, 2] as any }, p2: { discardedToCrib: [] } },
      crib: [1, 2] as any,
    });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('pegging card play is forward progress', () => {
    const a = stubState({ phase: 'pegging', pegging: { playedCards: new Array(3) } });
    const b = stubState({ phase: 'pegging', pegging: { playedCards: new Array(4) } });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  it('score increase during pegging is forward progress', () => {
    const a = stubState({
      phase: 'pegging',
      pegging: { playedCards: new Array(5) },
      playerStates: { p1: { pegScore: 10 }, p2: { pegScore: 8 } },
    });
    const b = stubState({
      phase: 'pegging',
      pegging: { playedCards: new Array(5) },
      playerStates: { p1: { pegScore: 12 }, p2: { pegScore: 8 } },
    });
    expect(compareProgress(getCribbageProgress(a), getCribbageProgress(b))).toBe(1);
  });

  // ── Hand boundary tests ──────────────────────────────────────

  it('new hand after complete is forward progress', () => {
    const completeHandN = stubState({
      handNumber: 1,
      phase: 'complete',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 45 }, p2: { pegScore: 38 } },
    });
    const discardingHandN1 = stubState({
      handNumber: 2,
      phase: 'discarding',
      pegging: { playedCards: [] },
      playerStates: { p1: { pegScore: 45 }, p2: { pegScore: 38 } },
    });
    expect(compareProgress(
      getCribbageProgress(completeHandN),
      getCribbageProgress(discardingHandN1),
    )).toBe(1);
  });

  it('rejects same-hand regressive snapshot', () => {
    const later = stubState({
      handNumber: 1,
      phase: 'pegging',
      pegging: { playedCards: new Array(5) },
    });
    const earlier = stubState({
      handNumber: 1,
      phase: 'discarding',
    });
    expect(compareProgress(
      getCribbageProgress(later),
      getCribbageProgress(earlier),
    )).toBe(-1);
  });

  // ── Multi-hand match continuity ──────────────────────────────

  it('three consecutive hands are monotonically forward', () => {
    const h1Complete = stubState({
      handNumber: 1, phase: 'complete',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 20 }, p2: { pegScore: 15 } },
    });
    const h2Start = stubState({
      handNumber: 2, phase: 'discarding',
      playerStates: { p1: { pegScore: 20 }, p2: { pegScore: 15 } },
    });
    const h2Complete = stubState({
      handNumber: 2, phase: 'complete',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 55 }, p2: { pegScore: 42 } },
    });
    const h3Start = stubState({
      handNumber: 3, phase: 'discarding',
      playerStates: { p1: { pegScore: 55 }, p2: { pegScore: 42 } },
    });

    expect(compareProgress(getCribbageProgress(h1Complete), getCribbageProgress(h2Start))).toBe(1);
    expect(compareProgress(getCribbageProgress(h2Start), getCribbageProgress(h2Complete))).toBe(1);
    expect(compareProgress(getCribbageProgress(h2Complete), getCribbageProgress(h3Start))).toBe(1);
  });

  // ── Pegging win (no counting phase) ──────────────────────────

  it('pegging win: pegging → complete is forward', () => {
    const pegging = stubState({
      handNumber: 3, phase: 'pegging',
      pegging: { playedCards: new Array(7) },
      playerStates: { p1: { pegScore: 119 }, p2: { pegScore: 80 } },
    });
    const complete = stubState({
      handNumber: 3, phase: 'complete',
      pegging: { playedCards: new Array(7) },
      playerStates: { p1: { pegScore: 121 }, p2: { pegScore: 80 } },
    });
    expect(compareProgress(getCribbageProgress(pegging), getCribbageProgress(complete))).toBe(1);
  });

  // ── His Heels (cut card Jack) ────────────────────────────────

  it('his heels score increase during cutting is forward', () => {
    const preCut = stubState({
      phase: 'discarding',
      playerStates: { p1: { pegScore: 0 }, p2: { pegScore: 0 } },
      crib: [1, 2, 3, 4] as any,
    });
    const postCut = stubState({
      phase: 'pegging',
      playerStates: { p1: { pegScore: 2 }, p2: { pegScore: 0 } },
      crib: [1, 2, 3, 4] as any,
    });
    expect(compareProgress(getCribbageProgress(preCut), getCribbageProgress(postCut))).toBe(1);
  });

  // ── Missing handNumber defaults to 1 ─────────────────────────

  it('handles missing handNumber gracefully', () => {
    const noHand = stubState({ handNumber: undefined, phase: 'pegging' });
    const vec = getCribbageProgress(noHand);
    expect(vec[0]).toBe(1);
  });
});
