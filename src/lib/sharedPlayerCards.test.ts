import { describe, expect, it } from 'vitest';
import { expectsSharedPlayerCards } from './sharedPlayerCards';

describe('shared player_cards ownership', () => {
  it('includes Holm and every accepted 3-5-7 alias', () => {
    expect(expectsSharedPlayerCards('holm-game')).toBe(true);
    expect(expectsSharedPlayerCards('holm')).toBe(true);
    expect(expectsSharedPlayerCards('3-5-7')).toBe(true);
    expect(expectsSharedPlayerCards('3-5-7-game')).toBe(true);
    expect(expectsSharedPlayerCards('357')).toBe(true);
  });

  it('does not treat dedicated-state or dice games as missing-card games', () => {
    expect(expectsSharedPlayerCards('cribbage')).toBe(false);
    expect(expectsSharedPlayerCards('gin-rummy')).toBe(false);
    expect(expectsSharedPlayerCards('horses')).toBe(false);
    expect(expectsSharedPlayerCards('ship-captain-crew')).toBe(false);
    expect(expectsSharedPlayerCards('yahtzee')).toBe(false);
    expect(expectsSharedPlayerCards(null)).toBe(false);
  });
});
