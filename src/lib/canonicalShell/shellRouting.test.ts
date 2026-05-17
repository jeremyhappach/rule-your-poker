import { describe, it, expect } from 'vitest';
import { isPokerVariantFamily } from './shellRouting';

describe('isPokerVariantFamily', () => {
  it('returns true for poker-variant game types routed through MobileGameTable', () => {
    expect(isPokerVariantFamily('holm-game')).toBe(true);
    expect(isPokerVariantFamily('3-5-7')).toBe(true);
    expect(isPokerVariantFamily('3-5-7-game')).toBe(true);
    expect(isPokerVariantFamily('357')).toBe(true);
    expect(isPokerVariantFamily('horses')).toBe(true);
    expect(isPokerVariantFamily('ship-captain-crew')).toBe(true);
  });

  it('returns false for unified-table game types (cribbage / gin / yahtzee / trivia)', () => {
    expect(isPokerVariantFamily('cribbage')).toBe(false);
    expect(isPokerVariantFamily('gin-rummy')).toBe(false);
    expect(isPokerVariantFamily('yahtzee')).toBe(false);
    expect(isPokerVariantFamily('trivia')).toBe(false);
  });

  it('returns false for null / undefined / empty', () => {
    expect(isPokerVariantFamily(null)).toBe(false);
    expect(isPokerVariantFamily(undefined)).toBe(false);
    expect(isPokerVariantFamily('')).toBe(false);
  });
});
