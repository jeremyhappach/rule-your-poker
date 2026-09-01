import { describe, expect, it } from 'vitest';

import { findOptimalMelds } from '../../../src/lib/ginRummyScoring';
import {
  rankLegalGinDiscardCandidates,
  type GinDomCard,
} from './terminalActors';

describe('Gin terminal actor discard selection', () => {
  it('ranks only enabled candidates while scoring each remainder from all 11 visible cards', () => {
    const cards: GinDomCard[] = [
      { index: 0, rank: '3', suit: '♣', value: 3, disabled: true },
      { index: 1, rank: 'A', suit: '♣', value: 1, disabled: false },
      { index: 2, rank: '2', suit: '♣', value: 2, disabled: false },
      { index: 3, rank: '4', suit: '♣', value: 4, disabled: false },
      { index: 4, rank: '5', suit: '♣', value: 5, disabled: false },
      { index: 5, rank: '7', suit: '♦', value: 7, disabled: false },
      { index: 6, rank: '7', suit: '♥', value: 7, disabled: false },
      { index: 7, rank: '7', suit: '♠', value: 7, disabled: false },
      { index: 8, rank: 'J', suit: '♦', value: 10, disabled: false },
      { index: 9, rank: 'Q', suit: '♥', value: 10, disabled: false },
      { index: 10, rank: 'K', suit: '♠', value: 10, disabled: false },
    ];

    const ranked = rankLegalGinDiscardCandidates(cards);

    expect(ranked).toHaveLength(10);
    expect(ranked.some(({ candidate }) => candidate.disabled)).toBe(false);
    for (const { candidate, deadwood } of ranked) {
      expect(deadwood).toBe(findOptimalMelds(
        cards.filter((card) => card.index !== candidate.index),
      ).deadwoodValue);
    }
  });
});
