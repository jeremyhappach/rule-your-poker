import { describe, it, expect } from 'vitest';
import { compareProgress } from './stateProgress';
import { getGinRummyProgress } from './ginRummyProgress';
import type { GinRummyState } from '@/lib/ginRummyTypes';

/** Minimal stub — only the fields the progress extractor reads */
function stubState(overrides: Partial<GinRummyState>): GinRummyState {
  return {
    phase: 'dealing',
    handNumber: 1,
    actionCount: 0,
    ...overrides,
  } as GinRummyState;
}

describe('getGinRummyProgress', () => {
  it('treats new hand after complete as forward progress', () => {
    const completeHandN = stubState({ handNumber: 1, phase: 'complete', actionCount: 16 });
    const firstDrawHandN1 = stubState({ handNumber: 2, phase: 'first_draw', actionCount: 0 });

    const cmp = compareProgress(
      getGinRummyProgress(completeHandN),
      getGinRummyProgress(firstDrawHandN1),
    );
    expect(cmp).toBe(1); // forward, NOT regressive
  });

  it('rejects same-hand regressive snapshot', () => {
    const later = stubState({ handNumber: 1, phase: 'playing', actionCount: 5 });
    const earlier = stubState({ handNumber: 1, phase: 'first_draw', actionCount: 2 });

    const cmp = compareProgress(
      getGinRummyProgress(later),
      getGinRummyProgress(earlier),
    );
    expect(cmp).toBe(-1); // regressive
  });

  it('accepts intra-hand forward progress', () => {
    const a = stubState({ handNumber: 1, phase: 'playing', actionCount: 3 });
    const b = stubState({ handNumber: 1, phase: 'playing', actionCount: 4 });

    expect(compareProgress(getGinRummyProgress(a), getGinRummyProgress(b))).toBe(1);
  });

  it('accepts scoring after knocking within same hand', () => {
    const knock = stubState({ handNumber: 2, phase: 'knocking', actionCount: 12 });
    const score = stubState({ handNumber: 2, phase: 'scoring', actionCount: 13 });

    expect(compareProgress(getGinRummyProgress(knock), getGinRummyProgress(score))).toBe(1);
  });

  it('handles missing handNumber gracefully (defaults to 1)', () => {
    const noHand = stubState({ handNumber: undefined, phase: 'playing', actionCount: 5 });
    const vec = getGinRummyProgress(noHand);
    expect(vec[0]).toBe(1);
  });
});
