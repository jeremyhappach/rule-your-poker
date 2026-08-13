import { describe, expect, it } from 'vitest';

import { getHolmPhysicalBuckPosition } from './holmBuckOwnership';

describe('getHolmPhysicalBuckPosition', () => {
  it('does not pass the Buck when a fold advances the action turn within one hand', () => {
    const beforeFold = getHolmPhysicalBuckPosition({
      buckPosition: 4,
      currentTurnPosition: 4,
    });
    const afterFold = getHolmPhysicalBuckPosition({
      buckPosition: 4,
      currentTurnPosition: 7,
    });

    expect(beforeFold).toBe(4);
    expect(afterFold).toBe(4);
  });

  it('moves the Buck when the authoritative successor hand publishes a new position', () => {
    const predecessorHand = getHolmPhysicalBuckPosition({
      buckPosition: 4,
      currentTurnPosition: 7,
    });
    const successorHand = getHolmPhysicalBuckPosition({
      buckPosition: 7,
      currentTurnPosition: 7,
    });

    expect(predecessorHand).toBe(4);
    expect(successorHand).toBe(7);
  });

  it('fails closed when no authoritative hand Buck exists', () => {
    expect(getHolmPhysicalBuckPosition({
      buckPosition: null,
      currentTurnPosition: 7,
    })).toBeNull();
  });
});
