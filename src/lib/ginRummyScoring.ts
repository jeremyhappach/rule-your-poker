// Gin Rummy scoring engine
// Meld detection, deadwood calculation, optimal grouping, knock/gin/undercut scoring

import {
  GinRummyCard,
  Meld,
  MeldType,
  KnockResult,
  GIN_BONUS,
  UNDERCUT_BONUS,
} from './ginRummyTypes';

// ─── Card Helpers ───────────────────────────────────────────────

const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

/** Deadwood value of a single card (A=1, face=10, else face value) */
export function cardDeadwoodValue(card: GinRummyCard): number {
  return card.value;
}

/** Sum deadwood values for a list of cards */
export function sumDeadwood(cards: GinRummyCard[]): number {
  return cards.reduce((sum, c) => sum + cardDeadwoodValue(c), 0);
}

/** Sort cards by rank order */
function sortByRank(cards: GinRummyCard[]): GinRummyCard[] {
  return [...cards].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
}

/** Check if two cards are the same card (rank + suit match) */
function sameCard(a: GinRummyCard, b: GinRummyCard): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Remove specific cards from a hand (by identity) */
function removeCards(hand: GinRummyCard[], toRemove: GinRummyCard[]): GinRummyCard[] {
  const remaining = [...hand];
  for (const card of toRemove) {
    const idx = remaining.findIndex(c => sameCard(c, card));
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

// ─── Meld Detection ─────────────────────────────────────────────

/** Find all possible sets (3-4 cards of same rank) from a hand */
export function findAllSets(hand: GinRummyCard[]): Meld[] {
  const byRank: Record<string, GinRummyCard[]> = {};
  for (const card of hand) {
    if (!byRank[card.rank]) byRank[card.rank] = [];
    byRank[card.rank].push(card);
  }

  const melds: Meld[] = [];
  for (const rank of Object.keys(byRank)) {
    const cards = byRank[rank];
    if (cards.length >= 4) {
      // 4-card set
      melds.push({ type: 'set', cards: [...cards] });
      // Also all 3-card subsets
      for (let i = 0; i < cards.length; i++) {
        const subset = cards.filter((_, j) => j !== i);
        melds.push({ type: 'set', cards: subset });
      }
    } else if (cards.length === 3) {
      melds.push({ type: 'set', cards: [...cards] });
    }
  }
  return melds;
}

/** Find all possible runs (3+ consecutive cards of same suit) from a hand */
export function findAllRuns(hand: GinRummyCard[]): Meld[] {
  const bySuit: Record<string, GinRummyCard[]> = {};
  for (const card of hand) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(card);
  }

  const melds: Meld[] = [];
  for (const suit of Object.keys(bySuit)) {
    const sorted = sortByRank(bySuit[suit]);
    // Find all consecutive sequences of length 3+
    for (let start = 0; start < sorted.length; start++) {
      const run: GinRummyCard[] = [sorted[start]];
      for (let next = start + 1; next < sorted.length; next++) {
        if (RANK_ORDER[sorted[next].rank] === RANK_ORDER[run[run.length - 1].rank] + 1) {
          run.push(sorted[next]);
          if (run.length >= 3) {
            melds.push({ type: 'run', cards: [...run] });
          }
        } else {
          break;
        }
      }
    }
  }
  return melds;
}

/** Find ALL possible melds (sets + runs) from a hand */
export function findAllMelds(hand: GinRummyCard[]): Meld[] {
  return [...findAllSets(hand), ...findAllRuns(hand)];
}

// ─── Optimal Meld Grouping ──────────────────────────────────────
// Find the combination of non-overlapping melds that minimizes deadwood.
// This uses recursive backtracking (hand is always ≤ 11 cards, so it's fast).

export interface MeldGrouping {
  melds: Meld[];
  deadwood: GinRummyCard[];
  deadwoodValue: number;
}

/**
 * Find the optimal grouping of melds that minimizes deadwood.
 * Returns the best set of non-overlapping melds and remaining deadwood cards.
 */
export function findOptimalMelds(hand: GinRummyCard[]): MeldGrouping {
  const allMelds = findAllMelds(hand);

  let bestGrouping: MeldGrouping = {
    melds: [],
    deadwood: [...hand],
    deadwoodValue: sumDeadwood(hand),
  };

  function backtrack(
    remaining: GinRummyCard[],
    usedMelds: Meld[],
    startIdx: number
  ) {
    // Calculate current deadwood
    const dw = sumDeadwood(remaining);
    if (dw < bestGrouping.deadwoodValue) {
      bestGrouping = {
        melds: [...usedMelds],
        deadwood: [...remaining],
        deadwoodValue: dw,
      };
    }

    // Early exit if deadwood is 0 (gin)
    if (dw === 0) return;

    // Try adding each unused meld
    for (let i = startIdx; i < allMelds.length; i++) {
      const meld = allMelds[i];
      // Check if all cards in this meld are still in remaining
      const allPresent = meld.cards.every(mc =>
        remaining.some(rc => sameCard(rc, mc))
      );
      if (!allPresent) continue;

      const newRemaining = removeCards(remaining, meld.cards);
      backtrack(newRemaining, [...usedMelds, meld], i + 1);
    }
  }

  backtrack([...hand], [], 0);
  return bestGrouping;
}

// ─── Lay Off Detection ──────────────────────────────────────────

/**
 * Find cards in the opponent's hand that can be laid off on the knocker's melds.
 * A card can be laid off if it extends a set (same rank) or extends a run (consecutive same suit).
 */
export function findLayOffOptions(
  opponentHand: GinRummyCard[],
  knockerMelds: Meld[]
): { card: GinRummyCard; onMeldIndex: number }[] {
  const options: { card: GinRummyCard; onMeldIndex: number }[] = [];

  for (const card of opponentHand) {
    for (let mi = 0; mi < knockerMelds.length; mi++) {
      const meld = knockerMelds[mi];
      if (canLayOff(card, meld)) {
        options.push({ card, onMeldIndex: mi });
      }
    }
  }
  return options;
}

/** Check if a single card can be laid off on a meld */
export function canLayOff(card: GinRummyCard, meld: Meld): boolean {
  if (meld.type === 'set') {
    // Same rank, different suit, and set isn't already 4 cards
    return card.rank === meld.cards[0].rank &&
      !meld.cards.some(mc => mc.suit === card.suit) &&
      meld.cards.length < 4;
  }

  if (meld.type === 'run') {
    const sorted = sortByRank(meld.cards);
    const meldSuit = sorted[0].suit;
    if (card.suit !== meldSuit) return false;

    const cardOrder = RANK_ORDER[card.rank];
    const minOrder = RANK_ORDER[sorted[0].rank];
    const maxOrder = RANK_ORDER[sorted[sorted.length - 1].rank];

    // Extends at the low or high end
    return cardOrder === minOrder - 1 || cardOrder === maxOrder + 1;
  }

  return false;
}

// ─── Knock / Gin / Undercut Scoring ─────────────────────────────

/**
 * Score a completed knock/gin round.
 * 
 * @param knockerId - The player who knocked (or went gin)
 * @param knockerHand - Knocker's full hand at time of knock
 * @param opponentHand - Opponent's full hand
 * @param opponentLaidOff - Cards the opponent laid off on knocker's melds
 * @param isGin - Whether the knocker declared gin (0 deadwood)
 */
export function scoreKnock(
  knockerId: string,
  opponentId: string,
  knockerHand: GinRummyCard[],
  opponentHand: GinRummyCard[],
  opponentLaidOff: GinRummyCard[],
  isGin: boolean
): KnockResult {
  // Find optimal melds for knocker
  const knockerGrouping = findOptimalMelds(knockerHand);
  const knockerDeadwood = knockerGrouping.deadwoodValue;

  // Remove laid-off cards from opponent's hand before calculating their deadwood
  const opponentRemaining = removeCards(opponentHand, opponentLaidOff);
  const opponentGrouping = findOptimalMelds(opponentRemaining);
  const opponentDeadwood = opponentGrouping.deadwoodValue;

  if (isGin) {
    // Gin: knocker gets opponent's deadwood + gin bonus, no laying off allowed
    return {
      knockerId,
      opponentId,
      knockerDeadwood: 0,
      opponentDeadwood,
      isGin: true,
      isUndercut: false,
      pointsAwarded: opponentDeadwood + GIN_BONUS,
      winnerId: knockerId,
    };
  }

  // Check for undercut: opponent's deadwood <= knocker's deadwood
  const isUndercut = opponentDeadwood <= knockerDeadwood;

  if (isUndercut) {
    const diff = knockerDeadwood - opponentDeadwood;
    return {
      knockerId,
      opponentId,
      knockerDeadwood,
      opponentDeadwood,
      isGin: false,
      isUndercut: true,
      pointsAwarded: diff + UNDERCUT_BONUS,
      winnerId: opponentId,
    };
  }

  // Normal knock: knocker wins the difference
  const diff = opponentDeadwood - knockerDeadwood;
  return {
    knockerId,
    opponentId,
    knockerDeadwood,
    opponentDeadwood,
    isGin: false,
    isUndercut: false,
    pointsAwarded: diff,
    winnerId: knockerId,
  };
}

// ─── Hand Description Utils ─────────────────────────────────────

/** Generate a human-readable description of melds */
export function describeMelds(melds: Meld[]): string {
  return melds.map(m => {
    const cards = m.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    return m.type === 'set' ? `Set: ${cards}` : `Run: ${cards}`;
  }).join(', ');
}

/** Generate a result description for hand history */
export function describeKnockResult(result: KnockResult): string {
  if (result.isGin) {
    return `Gin! +${result.pointsAwarded} pts`;
  }
  if (result.isUndercut) {
    return `Undercut! +${result.pointsAwarded} pts`;
  }
  return `Knock (${result.knockerDeadwood} vs ${result.opponentDeadwood}) +${result.pointsAwarded} pts`;
}

// ─── Deck Creation ──────────────────────────────────────────────

const SUITS: GinRummyCard['suit'][] = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Create a full 52-card deck using the symbol suit encoding standard */
export function createGinRummyDeck(): GinRummyCard[] {
  const deck: GinRummyCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      let value: number;
      if (rank === 'A') value = 1;
      else if (['J', 'Q', 'K'].includes(rank)) value = 10;
      else value = parseInt(rank, 10);
      deck.push({ suit, rank, value });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle */
export function shuffleDeck(deck: GinRummyCard[]): GinRummyCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Validation Helpers ─────────────────────────────────────────

/** Check if a player can knock (deadwood ≤ 10) */
export function canKnock(hand: GinRummyCard[]): boolean {
  const { deadwoodValue } = findOptimalMelds(hand);
  return deadwoodValue <= 10;
}

/** Check if a player has gin (deadwood = 0) */
export function hasGin(hand: GinRummyCard[]): boolean {
  const { deadwoodValue } = findOptimalMelds(hand);
  return deadwoodValue === 0;
}

/** Check if a card can be played from stock (stock not exhausted) */
export function canDrawFromStock(stockPile: GinRummyCard[]): boolean {
  return stockPile.length > 2; // Must leave at least 2 cards
}
