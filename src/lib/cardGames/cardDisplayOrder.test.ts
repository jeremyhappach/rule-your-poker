import { describe, expect, it } from 'vitest';
import { getActiveHandDisplayOrder } from './cardDisplayOrder';

const hand = [
  { rank: 'K', suit: '♣' },
  { rank: '3', suit: '♥' },
  { rank: '5', suit: '♠' },
  { rank: 'A', suit: '♦' },
];

describe('getActiveHandDisplayOrder', () => {
  it('uses the shared rank order for Holm and Cribbage', () => {
    expect(getActiveHandDisplayOrder(hand, 'holm')).toEqual([3, 1, 2, 0]);
    expect(getActiveHandDisplayOrder(hand, 'cribbage')).toEqual([3, 1, 2, 0]);
  });

  it('uses the current 3-5-7 wild rank before normal rank order', () => {
    expect(getActiveHandDisplayOrder(hand, 'three-five-seven', { roundNumber: 2 }))
      .toEqual([2, 3, 1, 0]);
  });

  it('uses Gin rank then suit order', () => {
    expect(getActiveHandDisplayOrder([
      { rank: 'A', suit: '♦' },
      { rank: 'A', suit: '♠' },
      { rank: '2', suit: '♥' },
    ], 'gin-rummy')).toEqual([1, 0, 2]);
  });
});
