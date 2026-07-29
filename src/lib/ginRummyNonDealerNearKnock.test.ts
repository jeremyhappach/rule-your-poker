/**
 * Non-Dealer Near Knock harness — contract tests.
 *
 * Proves (non-production, no live game mutation):
 *  - role-based assignment (dealer ⇒ layoff-test hand, non-dealer ⇒ near-knock hand)
 *  - identical result regardless of viewer / host / bot / seat
 *  - dealer rotation honored (roles swap ⇒ hands swap)
 *  - repeats for hand 1, 2, 3, … (dealHand is the single owner)
 *  - the dealer hand really contains the intended layoff cards
 *  - expected knock deadwood = 1 after taking 4♣ and discarding K♥
 *  - bot force-knock override knocks at the first legal opportunity
 *  - harness disabled ⇒ normal shuffled deal + normal bot strategy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const harnessState = { id: 'none' as string };

vi.mock('@/lib/debugHarness/runtimeCache', () => ({
  getActiveHarnessCached: (gameType: string) =>
    gameType === 'gin-rummy' ? harnessState.id : 'none',
}));

import {
  dealHand,
  createInitialGinRummyState,
  takeFirstDrawCard,
  declareKnock,
  dealerLayoffTestHand,
  nonDealerNearKnockHand,
  nonDealerNearKnockUpCard,
  NON_DEALER_NEAR_KNOCK_EXPECTED_KNOCK_DEADWOOD,
} from './ginRummyGameLogic';
import { findOptimalMelds, findLayOffOptions } from './ginRummyScoring';
import { botShouldKnock } from './ginRummyBotLogic';
import { canonicalizeHarnessId, getHarnessProfile } from './debugHarness/profiles';
import { isGinNonDealerNearKnockHarnessEnabled } from './debugFlags';

const key = (c: { rank: string; suit: string }) => `${c.rank}${c.suit}`;

function freshState(dealerId: string, nonDealerId: string) {
  return createInitialGinRummyState(dealerId, nonDealerId, 1, 100);
}

beforeEach(() => {
  harnessState.id = 'non_dealer_near_knock';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('harness id resolution', () => {
  it('canonical id enables the harness', () => {
    expect(isGinNonDealerNearKnockHarnessEnabled()).toBe(true);
  });

  it('legacy opponent_instant_knock is a read-only alias', () => {
    harnessState.id = 'opponent_instant_knock';
    expect(canonicalizeHarnessId('opponent_instant_knock')).toBe('non_dealer_near_knock');
    expect(isGinNonDealerNearKnockHarnessEnabled()).toBe(true);
    expect(getHarnessProfile('gin-rummy', 'opponent_instant_knock').id).toBe(
      'non_dealer_near_knock',
    );
  });

  it('none disables the harness', () => {
    harnessState.id = 'none';
    expect(isGinNonDealerNearKnockHarnessEnabled()).toBe(false);
  });
});

describe('role-based assignment', () => {
  it('dealer gets the layoff-test hand, non-dealer gets the near-knock hand', () => {
    const s = dealHand(freshState('D', 'N'));
    expect(s.playerStates['D'].hand.map(key)).toEqual(dealerLayoffTestHand().map(key));
    expect(s.playerStates['N'].hand.map(key)).toEqual(nonDealerNearKnockHand().map(key));
    expect(key(s.discardPile[0])).toEqual(key(nonDealerNearKnockUpCard()));
    expect(s.currentTurnPlayerId).toBe('N');
    expect(s.firstDrawOfferedTo).toBe('N');
  });

  it('is viewer/host/bot/seat independent — no extra argument changes the result', () => {
    const a = dealHand(freshState('D', 'N'));
    const b = dealHand(freshState('D', 'N'), 'D');
    const c = dealHand(freshState('D', 'N'), 'N');
    for (const s of [b, c]) {
      expect(s.playerStates['D'].hand.map(key)).toEqual(a.playerStates['D'].hand.map(key));
      expect(s.playerStates['N'].hand.map(key)).toEqual(a.playerStates['N'].hand.map(key));
    }
  });

  it('dealer rotation swaps the hands by role', () => {
    const h1 = dealHand(freshState('D', 'N'));
    const h2 = dealHand(freshState('N', 'D')); // roles rotated
    expect(h2.playerStates['N'].hand.map(key)).toEqual(dealerLayoffTestHand().map(key));
    expect(h2.playerStates['D'].hand.map(key)).toEqual(nonDealerNearKnockHand().map(key));
    expect(h1.playerStates['D'].hand.map(key)).not.toEqual(h2.playerStates['D'].hand.map(key));
  });

  it('repeats identically for hand 1, 2, 3, …', () => {
    for (const handNumber of [1, 2, 3, 4]) {
      const s = { ...freshState('D', 'N'), handNumber };
      const dealt = dealHand(s);
      expect(dealt.playerStates['N'].hand.map(key)).toEqual(nonDealerNearKnockHand().map(key));
      expect(dealt.playerStates['D'].hand.map(key)).toEqual(dealerLayoffTestHand().map(key));
    }
  });

  it('deck integrity: 52 unique cards across hands, upcard and stock', () => {
    const s = dealHand(freshState('D', 'N'));
    const all = [
      ...s.playerStates['D'].hand,
      ...s.playerStates['N'].hand,
      ...s.discardPile,
      ...s.stockPile,
    ].map(key);
    expect(all.length).toBe(52);
    expect(new Set(all).size).toBe(52);
    expect(s.stockPile.length).toBe(31);
  });
});

describe('layoff test geometry', () => {
  it('non-dealer knocks with deadwood 1 after taking 4♣ and discarding K♥', () => {
    let s = dealHand(freshState('D', 'N'));
    s = takeFirstDrawCard(s, 'N');
    const kh = s.playerStates['N'].hand.find(c => key(c) === 'K♥')!;
    s = declareKnock(s, 'N', kh);
    const grouping = findOptimalMelds(s.playerStates['N'].hand);
    expect(grouping.deadwoodValue).toBe(NON_DEALER_NEAR_KNOCK_EXPECTED_KNOCK_DEADWOOD);
    expect(grouping.melds.length).toBe(3);
    expect(grouping.deadwood.map(key)).toEqual(['A♠']);
  });

  it('dealer hand actually contains layoff cards for the knocker melds', () => {
    let s = dealHand(freshState('D', 'N'));
    s = takeFirstDrawCard(s, 'N');
    const kh = s.playerStates['N'].hand.find(c => key(c) === 'K♥')!;
    s = declareKnock(s, 'N', kh);
    const knockerMelds = findOptimalMelds(s.playerStates['N'].hand).melds;
    const dealerDeadwood = findOptimalMelds(s.playerStates['D'].hand).deadwood;
    const layoffs = findLayOffOptions(dealerDeadwood, knockerMelds).map(o => key(o.card));
    expect(layoffs).toEqual(expect.arrayContaining(['2♦', 'A♣', '9♣']));
  });
});

describe('bot immediate knock override', () => {
  it('forces a knock at the first legal opportunity', () => {
    const hand = [...nonDealerNearKnockHand(), nonDealerNearKnockUpCard()];
    const forced = botShouldKnock(hand, nonDealerNearKnockUpCard(), true);
    expect(forced.shouldKnock).toBe(true);
    expect(key(hand[forced.discardIndex])).toBe('K♥');
  });

  it('never knocks illegally, even when forced', () => {
    const hopeless = [
      { rank: 'K', suit: '♠' as const, value: 10 },
      { rank: 'Q', suit: '♥' as const, value: 10 },
      { rank: 'J', suit: '♦' as const, value: 10 },
      { rank: '9', suit: '♣' as const, value: 9 },
      { rank: '7', suit: '♠' as const, value: 7 },
      { rank: '5', suit: '♥' as const, value: 5 },
      { rank: '3', suit: '♦' as const, value: 3 },
      { rank: '10', suit: '♣' as const, value: 10 },
      { rank: '8', suit: '♥' as const, value: 8 },
      { rank: '6', suit: '♦' as const, value: 6 },
      { rank: '4', suit: '♠' as const, value: 4 },
    ];
    expect(botShouldKnock(hopeless, null, true).shouldKnock).toBe(false);
  });

  it('default (unforced) strategy is unchanged', () => {
    const hand = [...nonDealerNearKnockHand(), nonDealerNearKnockUpCard()];
    const unforced = botShouldKnock(hand, nonDealerNearKnockUpCard(), false);
    expect(unforced).toEqual(botShouldKnock(hand, nonDealerNearKnockUpCard()));
  });
});

describe('harness disabled', () => {
  it('falls back to a normal shuffled deal', () => {
    harnessState.id = 'none';
    const s = dealHand(freshState('D', 'N'));
    expect(s.playerStates['D'].hand.length).toBe(10);
    expect(s.playerStates['N'].hand.length).toBe(10);
    const dealerKeys = s.playerStates['D'].hand.map(key);
    const isHarnessHand =
      JSON.stringify(dealerKeys) === JSON.stringify(dealerLayoffTestHand().map(key));
    expect(isHarnessHand).toBe(false);
  });
});
