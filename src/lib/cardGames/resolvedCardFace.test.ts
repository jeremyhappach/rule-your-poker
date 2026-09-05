import { describe, expect, it } from 'vitest';
import { resolveCardFace, resolveTransportCardFace } from './resolvedCardFace';

describe('resolved card face contract', () => {
  it.each([null, undefined, {}, { rank: '?', suit: '?' }, { rank: 'A', suit: '?' },
    { rank: '?', suit: 'spades' }, { rank: '', suit: 'spades' }, { rank: 'A' },
    { rank: '1', suit: 'spades' }, { rank: 10, suit: 'spades' },
    { rank: 'A', suit: 'toString' }, { rank: 'A', suit: '♠', masked: true },
  ])('rejects unresolved data: %j', card => {
    expect(resolveCardFace(card)).toBeNull();
    expect(resolveTransportCardFace(card)).toBeNull();
  });
  it.each(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'])('admits rank %s in all four suits', rank => {
    for (const [symbol, word] of [['♠', 'spades'], ['♥', 'hearts'], ['♦', 'diamonds'], ['♣', 'clubs']]) {
      expect(resolveCardFace({ rank, suit: word })).toEqual({ rank, suit: symbol });
      expect(resolveTransportCardFace({ rank, suit: symbol })).toEqual({ rank, suit: word });
    }
  });
});
