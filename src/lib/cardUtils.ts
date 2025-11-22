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

  const sortedCards = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sortedCards.map(c => c.rank);
  const suits = sortedCards.map(c => c.suit);

  const rankCounts = ranks.reduce((acc, rank) => {
    acc[rank] = (acc[rank] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(ranks);

  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: 'straight-flush', value: 8000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Four of a Kind
  if (counts[0] === 4) {
    return { rank: 'four-of-a-kind', value: 7000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 'full-house', value: 6000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Flush
  if (isFlush) {
    return { rank: 'flush', value: 5000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Straight
  if (isStraight) {
    return { rank: 'straight', value: 4000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Three of a Kind
  if (counts[0] === 3) {
    return { rank: 'three-of-a-kind', value: 3000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: 'two-pair', value: 2000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // Pair
  if (counts[0] === 2) {
    return { rank: 'pair', value: 1000 + RANK_VALUES[sortedCards[0].rank] };
  }

  // High Card
  return { rank: 'high-card', value: RANK_VALUES[sortedCards[0].rank] };
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
