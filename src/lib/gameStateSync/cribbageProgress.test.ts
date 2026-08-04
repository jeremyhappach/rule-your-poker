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
    expect(getCribbageProgress(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  // ── Phase E prereq: matchCompleteLatch top-bit ─────────────────

  it('matchCompleteLatch is top-bit forward dimension', () => {
    const inProgress = stubState({
      handNumber: 5, phase: 'pegging',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 100 }, p2: { pegScore: 90 } },
    });
    const completed = stubState({
      handNumber: 1, phase: 'discarding', // earlier-looking on every other dim
      matchCompleteLatch: true,
    } as any);
    // Latch dominates: completed > inProgress despite lower handNumber/phase.
    expect(compareProgress(getCribbageProgress(inProgress), getCribbageProgress(completed))).toBe(1);
  });

  it('phase=complete implicitly sets matchLatch', () => {
    const a = stubState({ phase: 'counting' });
    const b = stubState({ phase: 'complete' });
    const va = getCribbageProgress(a);
    const vb = getCribbageProgress(b);
    expect(va[0]).toBe(0);
    expect(vb[0]).toBe(1);
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
    // [matchLatch=0, hand=1, cohort=0, resolved=1, phaseOrd=0,
    //  peggingSequence=0, countingProgress=0, sub=0]
    expect(vec).toEqual([0, 1, 0, 1, 0, 0, 0, 0]);
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

  it('pegging event sequence makes an otherwise equal peer snapshot forward', () => {
    const before = stubState({
      phase: 'pegging',
      pegging: { playedCards: new Array(5), eventSequence: 8 },
      playerStates: { p1: { pegScore: 10 }, p2: { pegScore: 8 } },
    });
    const after = stubState({
      phase: 'pegging',
      pegging: { playedCards: new Array(5), eventSequence: 9 },
      playerStates: { p1: { pegScore: 10 }, p2: { pegScore: 8 } },
    });
    expect(compareProgress(getCribbageProgress(before), getCribbageProgress(after))).toBe(1);
  });

  it('newer persisted counting beat rejects an older beat', () => {
    const later = stubState({
      phase: 'counting',
      countingTargetIndex: 1,
      countingBeatIndex: 2,
    });
    const earlier = stubState({
      phase: 'counting',
      countingTargetIndex: 1,
      countingBeatIndex: 1,
    });
    expect(compareProgress(getCribbageProgress(later), getCribbageProgress(earlier))).toBe(-1);
  });

  // ── Hand boundary tests ──────────────────────────────────────

  it('new hand after counting is forward progress', () => {
    // NOTE: 'complete' is reserved for match-end (matchCompleteLatch top-bit).
    // Between hands the lifecycle goes counting → discarding via startNewHand.
    const countingHandN = stubState({
      handNumber: 1,
      phase: 'counting',
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
      getCribbageProgress(countingHandN),
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
    // 'counting' is the inter-hand boundary phase; 'complete' is match-end.
    const h1End = stubState({
      handNumber: 1, phase: 'counting',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 20 }, p2: { pegScore: 15 } },
    });
    const h2Start = stubState({
      handNumber: 2, phase: 'discarding',
      playerStates: { p1: { pegScore: 20 }, p2: { pegScore: 15 } },
    });
    const h2End = stubState({
      handNumber: 2, phase: 'counting',
      pegging: { playedCards: new Array(8) },
      playerStates: { p1: { pegScore: 55 }, p2: { pegScore: 42 } },
    });
    const h3Start = stubState({
      handNumber: 3, phase: 'discarding',
      playerStates: { p1: { pegScore: 55 }, p2: { pegScore: 42 } },
    });

    expect(compareProgress(getCribbageProgress(h1End), getCribbageProgress(h2Start))).toBe(1);
    expect(compareProgress(getCribbageProgress(h2Start), getCribbageProgress(h2End))).toBe(1);
    expect(compareProgress(getCribbageProgress(h2End), getCribbageProgress(h3Start))).toBe(1);
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
    // [matchLatch=0, handNumber=1 (default), ...]
    expect(vec[1]).toBe(1);
  });
});
