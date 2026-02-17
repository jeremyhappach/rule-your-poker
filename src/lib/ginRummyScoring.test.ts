import { describe, it, expect } from 'vitest';
import {
  findAllSets,
  findAllRuns,
  findOptimalMelds,
  scoreKnock,
  canKnock,
  hasGin,
  canLayOff,
  createGinRummyDeck,
  sumDeadwood,
} from './ginRummyScoring';
import { GinRummyCard, Meld } from './ginRummyTypes';

// Helper to make cards quickly
const c = (rank: string, suit: '♠' | '♥' | '♦' | '♣'): GinRummyCard => {
  let value: number;
  if (rank === 'A') value = 1;
  else if (['J', 'Q', 'K'].includes(rank)) value = 10;
  else value = parseInt(rank, 10);
  return { rank, suit, value };
};

describe('findAllSets', () => {
  it('finds a 3-card set', () => {
    const hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('3', '♣')];
    const sets = findAllSets(hand);
    expect(sets.some(s => s.cards.length === 3 && s.type === 'set')).toBe(true);
  });

  it('finds a 4-card set and its 3-card subsets', () => {
    const hand = [c('K', '♠'), c('K', '♥'), c('K', '♦'), c('K', '♣')];
    const sets = findAllSets(hand);
    // 1 four-card + 4 three-card subsets
    expect(sets.length).toBe(5);
  });
});

describe('findAllRuns', () => {
  it('finds a 3-card run', () => {
    const hand = [c('3', '♠'), c('4', '♠'), c('5', '♠'), c('9', '♥')];
    const runs = findAllRuns(hand);
    expect(runs.some(r => r.cards.length === 3 && r.type === 'run')).toBe(true);
  });

  it('finds a 4-card run (includes the 3-card sub-run)', () => {
    const hand = [c('3', '♠'), c('4', '♠'), c('5', '♠'), c('6', '♠')];
    const runs = findAllRuns(hand);
    // Should find 3-4-5, 4-5-6, and 3-4-5-6
    expect(runs.length).toBe(3);
  });
});

describe('findOptimalMelds', () => {
  it('returns gin when all 10 cards meld', () => {
    const hand = [
      c('A', '♠'), c('2', '♠'), c('3', '♠'), // run
      c('7', '♥'), c('7', '♦'), c('7', '♣'), // set
      c('10', '♠'), c('J', '♠'), c('Q', '♠'), c('K', '♠'), // run
    ];
    const result = findOptimalMelds(hand);
    expect(result.deadwoodValue).toBe(0);
    expect(result.deadwood.length).toBe(0);
  });

  it('minimizes deadwood correctly', () => {
    const hand = [
      c('A', '♠'), c('2', '♠'), c('3', '♠'), // run = 0 deadwood
      c('K', '♥'), c('Q', '♦'), c('J', '♣'), // 30 deadwood (no meld)
      c('5', '♥'), c('5', '♦'), c('5', '♣'), // set = 0 deadwood
      c('9', '♠'), // 9 deadwood
    ];
    const result = findOptimalMelds(hand);
    // Optimal: A-2-3♠ run + 5-5-5 set, deadwood = K(10)+Q(10)+J(10)+9 = 39
    expect(result.deadwoodValue).toBe(39);
    expect(result.melds.length).toBe(2);
  });
});

describe('canKnock / hasGin', () => {
  it('can knock with deadwood ≤ 10', () => {
    const hand = [
      c('A', '♠'), c('2', '♠'), c('3', '♠'),
      c('7', '♥'), c('7', '♦'), c('7', '♣'),
      c('10', '♠'), c('J', '♠'), c('Q', '♠'),
      c('2', '♥'), // deadwood = 2
    ];
    expect(canKnock(hand)).toBe(true);
  });

  it('cannot knock with deadwood > 10', () => {
    const hand = [
      c('A', '♠'), c('2', '♠'), c('3', '♠'),
      c('K', '♥'), c('Q', '♦'), c('J', '♣'), // 30 deadwood
      c('5', '♥'), c('5', '♦'), c('5', '♣'),
      c('9', '♠'),
    ];
    expect(canKnock(hand)).toBe(false);
  });

  it('detects gin', () => {
    const hand = [
      c('A', '♠'), c('2', '♠'), c('3', '♠'),
      c('7', '♥'), c('7', '♦'), c('7', '♣'),
      c('10', '♠'), c('J', '♠'), c('Q', '♠'), c('K', '♠'),
    ];
    expect(hasGin(hand)).toBe(true);
  });
});

describe('scoreKnock', () => {
  it('scores gin correctly', () => {
    const result = scoreKnock(
      'p1', 'p2',
      [c('A', '♠'), c('2', '♠'), c('3', '♠'), c('7', '♥'), c('7', '♦'), c('7', '♣'), c('10', '♠'), c('J', '♠'), c('Q', '♠'), c('K', '♠')],
      [c('K', '♥'), c('Q', '♥'), c('J', '♥'), c('9', '♥'), c('8', '♦'), c('4', '♣'), c('3', '♣'), c('2', '♣'), c('6', '♦'), c('5', '♦')],
      [],
      true
    );
    expect(result.isGin).toBe(true);
    expect(result.winnerId).toBe('p1');
    expect(result.pointsAwarded).toBeGreaterThan(25); // opponent deadwood + 25 bonus
  });

  it('scores undercut correctly', () => {
    // Knocker has 8 deadwood, opponent has 5
    const result = scoreKnock(
      'p1', 'p2',
      [c('A', '♠'), c('2', '♠'), c('3', '♠'), c('7', '♥'), c('7', '♦'), c('7', '♣'), c('10', '♠'), c('J', '♠'), c('Q', '♠'), c('8', '♥')],
      [c('A', '♥'), c('2', '♥'), c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥'), c('7', '♠'), c('8', '♠'), c('9', '♠'), c('5', '♣')],
      [],
      false
    );
    expect(result.isUndercut).toBe(true);
    expect(result.winnerId).toBe('p2');
  });
});

describe('canLayOff', () => {
  it('allows laying off on a set', () => {
    const meld: Meld = { type: 'set', cards: [c('7', '♥'), c('7', '♦'), c('7', '♣')] };
    expect(canLayOff(c('7', '♠'), meld)).toBe(true);
    expect(canLayOff(c('8', '♠'), meld)).toBe(false);
  });

  it('allows laying off on a run', () => {
    const meld: Meld = { type: 'run', cards: [c('5', '♠'), c('6', '♠'), c('7', '♠')] };
    expect(canLayOff(c('4', '♠'), meld)).toBe(true); // low end
    expect(canLayOff(c('8', '♠'), meld)).toBe(true); // high end
    expect(canLayOff(c('8', '♥'), meld)).toBe(false); // wrong suit
  });
});

describe('createGinRummyDeck', () => {
  it('creates 52 cards with symbol suits', () => {
    const deck = createGinRummyDeck();
    expect(deck.length).toBe(52);
    expect(deck.every(c => ['♠', '♥', '♦', '♣'].includes(c.suit))).toBe(true);
  });
});
