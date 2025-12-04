export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank = 
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function evaluateHand(cards: Card[], useWildCards: boolean = true): { rank: HandRank; value: number } {
  if (cards.length === 0) return { rank: 'high-card', value: 0 };

  // Determine wild card based on number of cards dealt (if wild cards are enabled)
  const wildRank: Rank = useWildCards ? (cards.length <= 3 ? '3' : cards.length === 5 ? '5' : '7') : 'A';

  // Count wildcards (only if wildcards are enabled)
  const wildcards = useWildCards ? cards.filter(c => c.rank === wildRank) : [];
  const nonWildcards = useWildCards ? cards.filter(c => c.rank !== wildRank) : cards;
  const wildcardCount = wildcards.length;

  // If all cards are wildcards in round 1 (3 cards), treat as best possible: three of a kind
  if (cards.length === 3 && wildcardCount === cards.length) {
    return { rank: 'three-of-a-kind', value: calculateValue(3, [14, 14]) };
  }

  // If all cards are wildcards in round 2+ (5 or 7 cards), treat as straight flush
  if (cards.length >= 5 && wildcardCount === cards.length) {
    return { rank: 'straight-flush', value: calculateValue(8, [14]) };
  }

  const sortedCards = [...nonWildcards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sortedCards.map(c => c.rank);

  // Count ranks (excluding wildcards)
  const rankCounts = ranks.reduce((acc, rank) => {
    acc[rank] = (acc[rank] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Sort rank groups by count, then by value
  const rankGroups = Object.entries(rankCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count descending
      return RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank]; // Then by value descending
    });

  // Use wildcards to complete the best possible hand
  const counts = rankGroups.map(([_, count]) => count);
  let bestCount = counts[0] || 0;
  const bestRank = rankGroups[0]?.[0] as Rank;
  bestCount += wildcardCount;

  const secondCount = counts[1] || 0;
  const secondRank = rankGroups[1]?.[0] as Rank;

  // ROUND 1 (3 cards): Only three-of-a-kind, pair, or high card are possible
  if (cards.length === 3) {
    // Three of a Kind
    if (bestCount >= 3) {
      const tripRank = bestRank;
      const kickers = sortedCards
        .filter(c => c.rank !== tripRank)
        .map(c => RANK_VALUES[c.rank])
        .slice(0, 2);
      return { rank: 'three-of-a-kind', value: calculateValue(3, [RANK_VALUES[tripRank], ...kickers]) };
    }

    // Pair (including with wildcards)
    if (bestCount >= 2) {
      const pairRank = bestRank;
      const kickers = sortedCards
        .filter(c => c.rank !== pairRank)
        .map(c => RANK_VALUES[c.rank])
        .slice(0, 3);
      return { rank: 'pair', value: calculateValue(1, [RANK_VALUES[pairRank], ...kickers]) };
    }

    // High Card
    const allValues = sortedCards.map(c => RANK_VALUES[c.rank]).slice(0, 5);
    return { rank: 'high-card', value: calculateValue(0, allValues) };
  }

  // ROUND 2+ (5 or 7 cards): All hands are possible
  
  // Check for potential straight flush with wildcards
  const straightFlushResult = checkStraightFlush(sortedCards, wildcardCount);
  if (straightFlushResult.possible) {
    return { rank: 'straight-flush', value: calculateValue(8, [straightFlushResult.highCard]) };
  }

  // Four of a Kind
  if (bestCount >= 4) {
    const quadRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== quadRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 1);
    return { rank: 'four-of-a-kind', value: calculateValue(7, [RANK_VALUES[quadRank], ...kickers]) };
  }

  // Full House (3 + 2)
  if (bestCount >= 3 && secondCount >= 2) {
    const tripRank = bestRank;
    const pairRank = secondRank;
    return { rank: 'full-house', value: calculateValue(6, [RANK_VALUES[tripRank], RANK_VALUES[pairRank]]) };
  }

  // Flush with wildcards
  const flushResult = checkFlush(sortedCards, wildcardCount);
  if (flushResult.possible) {
    const flushCards = sortedCards
      .filter(c => flushResult.suit ? c.suit === flushResult.suit : true)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 5);
    return { rank: 'flush', value: calculateValue(5, flushCards) };
  }

  // Straight with wildcards
  const straightResult = checkStraightWithWildcards(ranks, wildcardCount);
  if (straightResult.possible) {
    return { rank: 'straight', value: calculateValue(4, [straightResult.highCard]) };
  }

  // Three of a Kind
  if (bestCount >= 3) {
    const tripRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== tripRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 2);
    return { rank: 'three-of-a-kind', value: calculateValue(3, [RANK_VALUES[tripRank], ...kickers]) };
  }

  // Two Pair
  if (bestCount >= 2 && secondCount >= 2) {
    const highPairRank = bestRank;
    const lowPairRank = secondRank;
    const kickers = sortedCards
      .filter(c => c.rank !== highPairRank && c.rank !== lowPairRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 1);
    return { rank: 'two-pair', value: calculateValue(2, [RANK_VALUES[highPairRank], RANK_VALUES[lowPairRank], ...kickers]) };
  }

  // Pair (including with wildcards)
  if (bestCount >= 2) {
    const pairRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== pairRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 3);
    return { rank: 'pair', value: calculateValue(1, [RANK_VALUES[pairRank], ...kickers]) };
  }

  // High Card
  const allValues = sortedCards.map(c => RANK_VALUES[c.rank]).slice(0, 5);
  return { rank: 'high-card', value: calculateValue(0, allValues) };
}

/**
 * Calculate a hand value that properly compares hands of the same rank.
 * Base value is handType * 10000000 (10 million) to ensure hand type always wins,
 * then each card adds diminishing value:
 * First card: value * 10000
 * Second card: value * 100
 * Third card: value * 1
 * Fourth card: value * 0.01
 * Fifth card: value * 0.0001
 * 
 * This ensures a pair (type 1) = 10,000,000 ALWAYS beats high card (type 0) = 140,000 max
 */
function calculateValue(handType: number, cardValues: number[]): number {
  const weights = [10000, 100, 1, 0.01, 0.0001];
  // Use 10 million as base so hand rank always wins over card values
  let value = handType * 10000000;
  
  cardValues.forEach((cardValue, index) => {
    if (index < weights.length) {
      value += cardValue * weights[index];
    }
  });
  
  return value;
}

function checkStraightFlush(cards: Card[], wildcards: number): { possible: boolean; highCard: number } {
  if (cards.length + wildcards < 5) return { possible: false, highCard: 0 };
  
  // Group by suit
  const suitGroups: Record<Suit, Card[]> = { '♠': [], '♥': [], '♦': [], '♣': [] };
  cards.forEach(card => suitGroups[card.suit].push(card));
  
  // Check each suit
  for (const suit in suitGroups) {
    const suitCards = suitGroups[suit as Suit];
    if (suitCards.length + wildcards >= 5) {
      // Check if we can make a straight with these cards + wildcards
      const ranks = suitCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
      const straightResult = canMakeStraight(ranks, wildcards);
      if (straightResult.possible) {
        return { possible: true, highCard: straightResult.highCard };
      }
    }
  }
  
  return { possible: false, highCard: 0 };
}

function checkFlush(cards: Card[], wildcards: number): { possible: boolean; highCard: number; suit?: Suit } {
  if (cards.length + wildcards < 5) return { possible: false, highCard: 0 };
  
  // Count suits
  const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
  cards.forEach(card => suitCounts[card.suit]++);
  
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  if (maxSuitCount + wildcards >= 5) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count === maxSuitCount)?.[0] as Suit;
    const highCard = cards[0] ? RANK_VALUES[cards[0].rank] : 14;
    return { possible: true, highCard, suit: flushSuit };
  }
  
  return { possible: false, highCard: 0 };
}

function checkStraightWithWildcards(ranks: Rank[], wildcards: number): { possible: boolean; highCard: number } {
  if (ranks.length + wildcards < 5) return { possible: false, highCard: 0 };
  
  const values = ranks.map(r => RANK_VALUES[r]).sort((a, b) => b - a);
  return canMakeStraight(values, wildcards);
}

function canMakeStraight(values: number[], wildcards: number): { possible: boolean; highCard: number } {
  // Remove duplicates
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
  
  // Try to find a sequence of 5 that can be completed with wildcards
  // Check regular straights (high to low)
  for (let start = 14; start >= 5; start--) {
    let needed = 0;
    let cardsInSequence = 0;
    
    for (let i = 0; i < 5; i++) {
      const targetValue = start - i;
      if (uniqueValues.includes(targetValue)) {
        cardsInSequence++;
      } else {
        needed++;
      }
    }
    
    if (needed <= wildcards && cardsInSequence + needed >= 5) {
      return { possible: true, highCard: start };
    }
  }
  
  // Check for A-2-3-4-5 straight (wheel)
  const wheelCards = [14, 2, 3, 4, 5];
  let wheelNeeded = 0;
  let wheelHave = 0;
  
  for (const val of wheelCards) {
    if (uniqueValues.includes(val)) {
      wheelHave++;
    } else {
      wheelNeeded++;
    }
  }
  
  if (wheelNeeded <= wildcards && wheelHave + wheelNeeded >= 5) {
    return { possible: true, highCard: 5 }; // Wheel straight high card is 5
  }
  
  return { possible: false, highCard: 0 };
}

function checkStraight(ranks: Rank[]): boolean {
  if (ranks.length < 5) return false;
  
  const values = ranks.map(r => RANK_VALUES[r]).sort((a, b) => b - a);
  
  for (let i = 0; i < values.length - 4; i++) {
    if (values[i] - values[i + 4] === 4) return true;
  }
  
  // Check for A-2-3-4-5 straight
  if (values.includes(14) && values.includes(2) && values.includes(3) && 
      values.includes(4) && values.includes(5)) {
    return true;
  }
  
  return false;
}

export function formatHandRank(rank: HandRank): string {
  return rank.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Helper to convert rank value back to display string
function valueToRankName(value: number): string {
  const rankNames: Record<number, string> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10',
    9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
  };
  return rankNames[value] || String(value);
}

// Helper to make rank names more readable (plural for pairs)
function rankNamePlural(rankValue: number): string {
  const name = valueToRankName(rankValue);
  if (name === '6') return '6s';
  if (name.length === 1) return name + 's';
  return name + 's';
}

/**
 * Format hand rank with card details for display
 * e.g., "Two Pair, Js and 8s", "Straight, K high", "Three of a Kind, 4s"
 */
export function formatHandRankDetailed(cards: Card[], useWildCards: boolean = false): string {
  if (cards.length === 0) return 'No Cards';
  
  const eval_ = evaluateHand(cards, useWildCards);
  const rank = eval_.rank;
  
  // Sort cards by value descending
  const sortedCards = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  // Count ranks
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  });
  
  // Sort rank groups by count, then by value
  const rankGroups = Object.entries(rankCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank];
    });
  
  switch (rank) {
    case 'straight-flush': {
      const highCard = valueToRankName(sortedCards[0] ? RANK_VALUES[sortedCards[0].rank] : 14);
      return `Straight Flush, ${highCard} high`;
    }
    case 'four-of-a-kind': {
      const quadRank = rankGroups.find(([_, count]) => count >= 4)?.[0] || sortedCards[0]?.rank;
      return `Four of a Kind, ${rankNamePlural(RANK_VALUES[quadRank as Rank])}`;
    }
    case 'full-house': {
      const tripRank = rankGroups.find(([_, count]) => count >= 3)?.[0];
      const pairRank = rankGroups.find(([r, count]) => count >= 2 && r !== tripRank)?.[0];
      if (tripRank && pairRank) {
        return `Full House, ${rankNamePlural(RANK_VALUES[tripRank as Rank])} full of ${rankNamePlural(RANK_VALUES[pairRank as Rank])}`;
      }
      return 'Full House';
    }
    case 'flush': {
      const highCard = valueToRankName(RANK_VALUES[sortedCards[0].rank]);
      return `Flush, ${highCard} high`;
    }
    case 'straight': {
      const highCard = valueToRankName(RANK_VALUES[sortedCards[0].rank]);
      return `Straight, ${highCard} high`;
    }
    case 'three-of-a-kind': {
      const tripRank = rankGroups.find(([_, count]) => count >= 3)?.[0] || sortedCards[0]?.rank;
      return `Three of a Kind, ${rankNamePlural(RANK_VALUES[tripRank as Rank])}`;
    }
    case 'two-pair': {
      const pairs = rankGroups.filter(([_, count]) => count >= 2).slice(0, 2);
      if (pairs.length >= 2) {
        const highPair = rankNamePlural(RANK_VALUES[pairs[0][0] as Rank]);
        const lowPair = rankNamePlural(RANK_VALUES[pairs[1][0] as Rank]);
        return `Two Pair, ${highPair} and ${lowPair}`;
      }
      return 'Two Pair';
    }
    case 'pair': {
      const pairRank = rankGroups.find(([_, count]) => count >= 2)?.[0] || sortedCards[0]?.rank;
      return `Pair of ${rankNamePlural(RANK_VALUES[pairRank as Rank])}`;
    }
    case 'high-card':
    default: {
      const highCard = valueToRankName(RANK_VALUES[sortedCards[0].rank]);
      return `${highCard} High`;
    }
  }
}
