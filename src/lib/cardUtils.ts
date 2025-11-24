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

export function evaluateHand(cards: Card[]): { rank: HandRank; value: number } {
  if (cards.length === 0) return { rank: 'high-card', value: 0 };

  // Determine wild card based on number of cards dealt
  // Round 1 (3 cards): 3s are wild
  // Round 2 (5 cards): 5s are wild
  // Round 3 (7 cards): 7s are wild
  const wildRank: Rank = cards.length <= 3 ? '3' : cards.length === 5 ? '5' : '7';

  // Count wildcards
  const wildcards = cards.filter(c => c.rank === wildRank);
  const nonWildcards = cards.filter(c => c.rank !== wildRank);
  const wildcardCount = wildcards.length;

  // If all cards are wildcards, treat as highest possible
  if (wildcardCount === cards.length) {
    return { rank: 'four-of-a-kind', value: 7000 + 14 }; // Four Aces
  }

  const sortedCards = [...nonWildcards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sortedCards.map(c => c.rank);
  const suits = sortedCards.map(c => c.suit);

  // Count ranks (excluding wildcards)
  const rankCounts = ranks.reduce((acc, rank) => {
    acc[rank] = (acc[rank] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = suits.length >= 5 && suits.every(s => s === suits[0]);
  const isStraight = checkStraight(ranks);

  // Use wildcards to complete the best possible hand
  let bestCount = counts[0] || 0;
  bestCount += wildcardCount; // Add wildcards to the most frequent rank

  const secondCount = counts[1] || 0;

  // Determine best hand with wildcards
  // Straight Flush (needs 5+ cards)
  if (cards.length >= 5 && isFlush && isStraight) {
    return { rank: 'straight-flush', value: 8000 + RANK_VALUES[sortedCards[0]?.rank || 'A'] };
  }

  // Four of a Kind
  if (bestCount >= 4) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'four-of-a-kind', value: 7000 + RANK_VALUES[highCard] };
  }

  // Full House (3 + 2)
  if (bestCount >= 3 && secondCount >= 2) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'full-house', value: 6000 + RANK_VALUES[highCard] };
  }

  // Full House with wildcards (e.g., pair + pair + wildcard)
  if (bestCount >= 3 && (secondCount + wildcardCount >= 2) && wildcardCount > 0) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'full-house', value: 6000 + RANK_VALUES[highCard] };
  }

  // Flush
  if (isFlush) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'flush', value: 5000 + RANK_VALUES[highCard] };
  }

  // Straight
  if (isStraight) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'straight', value: 4000 + RANK_VALUES[highCard] };
  }

  // Three of a Kind
  if (bestCount >= 3) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'three-of-a-kind', value: 3000 + RANK_VALUES[highCard] };
  }

  // Two Pair
  if (bestCount >= 2 && secondCount >= 2) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'two-pair', value: 2000 + RANK_VALUES[highCard] };
  }

  // Pair (including with wildcards)
  if (bestCount >= 2) {
    const highCard = sortedCards[0]?.rank || 'A';
    return { rank: 'pair', value: 1000 + RANK_VALUES[highCard] };
  }

  // High Card
  const highCard = sortedCards[0]?.rank || 'A';
  return { rank: 'high-card', value: RANK_VALUES[highCard] };
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
