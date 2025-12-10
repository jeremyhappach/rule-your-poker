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
  | 'straight-flush'
  | 'five-of-a-kind';

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES: Record<Rank, number> = {
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

  // Normalize and validate cards - CRITICAL: convert ranks to uppercase for matching
  const validCards: Card[] = cards.map(c => ({
    suit: (c.suit || (c as any).Suit || '') as Suit,
    rank: String(c.rank || (c as any).Rank || '').toUpperCase() as Rank
  })).filter(c => SUITS.includes(c.suit) && RANKS.includes(c.rank));

  if (validCards.length === 0) {
    console.error('[EVAL] No valid cards after normalization! Input:', JSON.stringify(cards));
    return { rank: 'high-card', value: 0 };
  }

  // Sort by rank value descending
  const sortedCards = [...validCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  // Debug log for hand evaluation
  const cardStr = sortedCards.map(c => `${c.rank}${c.suit}`).join(' ');
  console.log('[EVAL] Evaluating:', cardStr, 'useWild:', useWildCards, 'cardCount:', validCards.length);

  // Determine wild rank if enabled
  const wildRank: Rank | null = useWildCards 
    ? (validCards.length <= 3 ? '3' : validCards.length === 5 ? '5' : '7') 
    : null;
  
  const wildcardCount = wildRank ? validCards.filter(c => c.rank === wildRank).length : 0;
  const nonWildCards = wildRank ? sortedCards.filter(c => c.rank !== wildRank) : sortedCards;

  // Handle all wildcards edge cases
  if (wildcardCount === validCards.length) {
    if (validCards.length === 3) return { rank: 'three-of-a-kind', value: calculateValue(3, [14, 14]) };
    if (validCards.length >= 5) return { rank: 'straight-flush', value: calculateValue(8, [14]) };
  }

  // Count ranks (excluding wildcards)
  const rankCounts: Record<string, number> = {};
  nonWildCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });

  // Sort by count desc, then value desc
  const groups = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1] || RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank]);

  // CRITICAL DEBUG: Log rank counts to identify pair detection issues
  console.log('[EVAL] Rank counts:', JSON.stringify(rankCounts));
  console.log('[EVAL] Groups (sorted):', JSON.stringify(groups));

  const bestRank = groups[0]?.[0] as Rank;
  const bestCount = (groups[0]?.[1] || 0) + wildcardCount;
  const secondCount = groups[1]?.[1] || 0;
  const secondRank = groups[1]?.[0] as Rank;

  console.log('[EVAL] Best rank:', bestRank, 'bestCount:', bestCount, 'secondRank:', secondRank, 'secondCount:', secondCount);

  // Round 1 (3 cards): Only three-of-a-kind, pair, or high card
  if (validCards.length === 3) {
    if (bestCount >= 3) {
      const kickerCards = nonWildCards.filter(c => c.rank !== bestRank);
      const sortedKickerValues = kickerCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
      const kickers = sortedKickerValues.slice(0, 2);
      const result = { rank: 'three-of-a-kind' as HandRank, value: calculateValue(3, [RANK_VALUES[bestRank], ...kickers]) };
      console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'kickers:', kickers, 'value:', result.value);
      return result;
    }
    if (bestCount >= 2) {
      const kickerCards = nonWildCards.filter(c => c.rank !== bestRank);
      const sortedKickerValues = kickerCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
      const kickers = sortedKickerValues.slice(0, 3);
      const result = { rank: 'pair' as HandRank, value: calculateValue(1, [RANK_VALUES[bestRank], ...kickers]) };
      console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'kickers:', kickers, 'value:', result.value);
      return result;
    }
    // High card - sort values before comparing
    const sortedValues = nonWildCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a).slice(0, 5);
    const result = { rank: 'high-card' as HandRank, value: calculateValue(0, sortedValues) };
    console.log('[EVAL] Result:', result.rank, 'values:', sortedValues, 'value:', result.value);
    return result;
  }

  // Round 2+ (5+ cards): All hands possible

  // Five of a Kind (only possible with wildcards)
  if (bestCount >= 5) {
    const result = { rank: 'five-of-a-kind' as HandRank, value: calculateValue(9, [RANK_VALUES[bestRank]]) };
    console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'value:', result.value);
    return result;
  }

  // Straight Flush
  const sfResult = checkStraightFlush(nonWildCards, wildcardCount);
  if (sfResult.possible) {
    const result = { rank: 'straight-flush' as HandRank, value: calculateValue(8, [sfResult.highCard]) };
    console.log('[EVAL] Result:', result.rank, 'high:', sfResult.highCard, 'value:', result.value);
    return result;
  }

  // Four of a Kind
  if (bestCount >= 4) {
    const kickers = nonWildCards.filter(c => c.rank !== bestRank).map(c => RANK_VALUES[c.rank]).slice(0, 1);
    const result = { rank: 'four-of-a-kind' as HandRank, value: calculateValue(7, [RANK_VALUES[bestRank], ...kickers]) };
    console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'value:', result.value);
    return result;
  }

  // Full House
  if (bestCount >= 3 && secondCount >= 2) {
    const result = { rank: 'full-house' as HandRank, value: calculateValue(6, [RANK_VALUES[bestRank], RANK_VALUES[secondRank]]) };
    console.log('[EVAL] Result:', result.rank, bestRank, 'full of', secondRank, 'value:', result.value);
    return result;
  }

  // Flush
  const flushResult = checkFlush(nonWildCards, wildcardCount);
  if (flushResult.possible) {
    const flushCards = nonWildCards.filter(c => c.suit === flushResult.suit).map(c => RANK_VALUES[c.rank]).slice(0, 5);
    const result = { rank: 'flush' as HandRank, value: calculateValue(5, flushCards) };
    console.log('[EVAL] Result:', result.rank, 'high:', flushCards[0], 'value:', result.value);
    return result;
  }

  // Straight
  const straightResult = checkStraightWithWildcards(nonWildCards.map(c => c.rank), wildcardCount);
  if (straightResult.possible) {
    const result = { rank: 'straight' as HandRank, value: calculateValue(4, [straightResult.highCard]) };
    console.log('[EVAL] Result:', result.rank, 'high:', straightResult.highCard, 'value:', result.value);
    return result;
  }

  // Three of a Kind
  if (bestCount >= 3) {
    const kickerCards = nonWildCards.filter(c => c.rank !== bestRank);
    const sortedKickerValues = kickerCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
    const kickers = sortedKickerValues.slice(0, 2);
    const result = { rank: 'three-of-a-kind' as HandRank, value: calculateValue(3, [RANK_VALUES[bestRank], ...kickers]) };
    console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'kickers:', kickers, 'value:', result.value);
    return result;
  }

  // Two Pair - need two different ranks with 2+ cards each
  const pairs = groups.filter(([_, count]) => count >= 2);
  if (pairs.length >= 2) {
    const highPair = pairs[0][0] as Rank;
    const lowPair = pairs[1][0] as Rank;
    const kickerCards = nonWildCards.filter(c => c.rank !== highPair && c.rank !== lowPair);
    const sortedKickerValues = kickerCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
    const kickers = sortedKickerValues.slice(0, 1);
    const result = { rank: 'two-pair' as HandRank, value: calculateValue(2, [RANK_VALUES[highPair], RANK_VALUES[lowPair], ...kickers]) };
    console.log('[EVAL] Result:', result.rank, highPair, 'and', lowPair, 'kickers:', kickers, 'value:', result.value);
    return result;
  }

  // Pair
  if (bestCount >= 2) {
    // CRITICAL: Sort kickers before slicing to ensure consistent ordering
    const kickerCards = nonWildCards.filter(c => c.rank !== bestRank);
    const sortedKickerValues = kickerCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
    const kickers = sortedKickerValues.slice(0, 3);
    const result = { rank: 'pair' as HandRank, value: calculateValue(1, [RANK_VALUES[bestRank], ...kickers]) };
    console.log('[EVAL] Result:', result.rank, 'of', bestRank, 'kickers:', kickers, 'value:', result.value);
    return result;
  }

  // High Card - sort values before comparing
  const sortedValues = nonWildCards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a).slice(0, 5);
  const result = { rank: 'high-card' as HandRank, value: calculateValue(0, sortedValues) };
  console.log('[EVAL] Result:', result.rank, 'values:', sortedValues, 'value:', result.value);
  return result;
}

/**
 * Calculate a hand value that properly compares hands of the same rank.
 * Uses integer math only to avoid floating-point comparison issues.
 * Base value is handType * 1,000,000,000 (1 billion) to ensure hand type always wins,
 * then each card adds diminishing value using powers of 15:
 * First card: value * 15^4 = 50625
 * Second card: value * 15^3 = 3375
 * Third card: value * 15^2 = 225
 * Fourth card: value * 15^1 = 15
 * Fifth card: value * 15^0 = 1
 * 
 * Max card value is 14 (Ace), so each position can hold values 2-14 without overflow.
 * This ensures a pair (type 1) ALWAYS beats high card (type 0).
 */
function calculateValue(handType: number, cardValues: number[]): number {
  // Powers of 15 to ensure each card position can hold max value of 14
  const weights = [50625, 3375, 225, 15, 1];
  // Use 1 billion as base so hand rank always wins over card values
  let value = handType * 1000000000;
  
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
  
  const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
  cards.forEach(card => suitCounts[card.suit]++);
  
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  if (maxSuitCount + wildcards >= 5) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count === maxSuitCount)?.[0] as Suit;
    const flushCards = cards.filter(c => c.suit === flushSuit).sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const highCard = flushCards[0] ? RANK_VALUES[flushCards[0].rank] : 14;
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
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
  
  // Check regular straights (high to low)
  for (let start = 14; start >= 5; start--) {
    let needed = 0;
    for (let i = 0; i < 5; i++) {
      if (!uniqueValues.includes(start - i)) needed++;
    }
    if (needed <= wildcards) return { possible: true, highCard: start };
  }
  
  // Check for A-2-3-4-5 (wheel)
  const wheelCards = [14, 2, 3, 4, 5];
  let wheelNeeded = 0;
  for (const val of wheelCards) {
    if (!uniqueValues.includes(val)) wheelNeeded++;
  }
  if (wheelNeeded <= wildcards) return { possible: true, highCard: 5 };
  
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
  
  console.log('[FORMAT] formatHandRankDetailed called with:', cards.map(c => `${c.rank}${c.suit}`).join(', '));
  
  const eval_ = evaluateHand(cards, useWildCards);
  const rank = eval_.rank;
  console.log('[FORMAT] Evaluated rank:', rank, 'value:', eval_.value);
  
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
  
  let result: string;
  
  switch (rank) {
    case 'five-of-a-kind': {
      const quintRank = rankGroups.find(([_, count]) => count >= 5)?.[0] || sortedCards[0]?.rank;
      result = `Five of a Kind, ${rankNamePlural(RANK_VALUES[quintRank as Rank])}`;
      break;
    }
    case 'straight-flush': {
      // For straight flush, find actual straight high card, not just highest card
      const straightHigh = findStraightHighCard(cards, useWildCards);
      // Ace-high straight flush is a "Royale with Cheese"
      if (straightHigh === 14) {
        result = 'Royale with Cheese';
      } else {
        result = `Straight Flush, ${valueToRankName(straightHigh)} high`;
      }
      break;
    }
    case 'four-of-a-kind': {
      const quadRank = rankGroups.find(([_, count]) => count >= 4)?.[0] || sortedCards[0]?.rank;
      result = `Four of a Kind, ${rankNamePlural(RANK_VALUES[quadRank as Rank])}`;
      break;
    }
    case 'full-house': {
      const tripRank = rankGroups.find(([_, count]) => count >= 3)?.[0];
      const pairRank = rankGroups.find(([r, count]) => count >= 2 && r !== tripRank)?.[0];
      if (tripRank && pairRank) {
        result = `Full House, ${rankNamePlural(RANK_VALUES[tripRank as Rank])} full of ${rankNamePlural(RANK_VALUES[pairRank as Rank])}`;
      } else {
        result = 'Full House';
      }
      break;
    }
    case 'flush': {
      // Find the flush suit first, then get highest card in that suit
      const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
      cards.forEach(c => suitCounts[c.suit]++);
      const flushSuit = (Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0]) as Suit;
      const flushCards = cards.filter(c => c.suit === flushSuit).sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
      const highCard = valueToRankName(RANK_VALUES[flushCards[0]?.rank || sortedCards[0].rank]);
      result = `Flush, ${highCard} high`;
      break;
    }
    case 'straight': {
      // For straight, find actual straight high card, not just highest card in hand
      const straightHigh = findStraightHighCard(cards, useWildCards);
      result = `Straight, ${valueToRankName(straightHigh)} high`;
      break;
    }
    case 'three-of-a-kind': {
      const tripRank = rankGroups.find(([_, count]) => count >= 3)?.[0] || sortedCards[0]?.rank;
      // Don't show kickers by default - only relevant for tie-breaking comparison
      result = `Three of a Kind, ${rankNamePlural(RANK_VALUES[tripRank as Rank])}`;
      break;
    }
    case 'two-pair': {
      // Filter to only ranks that actually have 2+ cards (true pairs)
      const truePairs = rankGroups.filter(([_, count]) => count >= 2);
      console.log('[FORMAT] Two pair detection - truePairs:', truePairs);
      if (truePairs.length >= 2) {
        // Sort by card value descending to get high pair first
        truePairs.sort((a, b) => RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank]);
        const highPair = rankNamePlural(RANK_VALUES[truePairs[0][0] as Rank]);
        const lowPair = rankNamePlural(RANK_VALUES[truePairs[1][0] as Rank]);
        // Don't show kickers by default - only relevant for tie-breaking comparison
        result = `Two Pair, ${highPair} and ${lowPair}`;
      } else {
        result = 'Two Pair';
      }
      break;
    }
    case 'pair': {
      const pairRank = rankGroups.find(([_, count]) => count >= 2)?.[0] || sortedCards[0]?.rank;
      // Don't show kickers by default - only relevant for tie-breaking comparison
      result = `Pair of ${rankNamePlural(RANK_VALUES[pairRank as Rank])}`;
      break;
    }
    case 'high-card':
    default: {
      const highCard = valueToRankName(RANK_VALUES[sortedCards[0].rank]);
      result = `${highCard} High`;
      break;
    }
  }
  
  console.log('[FORMAT] Result:', result);
  return result;
}

/**
 * Format kicker cards for display
 * e.g., "K kicker" or "A, Q, J kickers"
 */
function formatKickers(kickerCards: Card[]): string {
  if (kickerCards.length === 0) return '';
  
  const kickerNames = kickerCards.map(c => valueToRankName(RANK_VALUES[c.rank]));
  
  if (kickerNames.length === 1) {
    return `${kickerNames[0]} kicker`;
  }
  return `${kickerNames.join(', ')} kickers`;
}

/**
 * Find the actual high card of a straight in a hand
 * Uses the same logic as canMakeStraight for consistency with evaluation
 */
function findStraightHighCard(cards: Card[], useWildCards: boolean): number {
  const wildRank: Rank = useWildCards ? (cards.length <= 3 ? '3' : cards.length === 5 ? '5' : '7') : 'A';
  const wildcardCount = useWildCards ? cards.filter(c => c.rank === wildRank).length : 0;
  const nonWildcards = useWildCards ? cards.filter(c => c.rank !== wildRank) : cards;
  const ranks = nonWildcards.map(c => c.rank);
  
  console.log('[STRAIGHT-HIGH] Finding straight high card. Ranks:', ranks, 'wildcards:', wildcardCount);
  
  // Use the exact same function that evaluation uses
  const result = checkStraightWithWildcards(ranks, wildcardCount);
  
  if (result.possible) {
    console.log('[STRAIGHT-HIGH] Found straight with high card:', result.highCard);
    return result.highCard;
  }
  
  // Fallback - get highest card value (shouldn't happen if we have a straight)
  const values = nonWildcards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  console.log('[STRAIGHT-HIGH] WARNING: No straight found by checkStraightWithWildcards, using highest card:', values[0]);
  return values[0] || 14;
}

/**
 * Get indices of cards that make up the winning hand (for highlighting)
 * Returns indices into the sorted card array for both player cards and community cards
 * Also returns which kickers were used if relevant
 */
export function getWinningCardIndices(
  playerCards: Card[], 
  communityCards: Card[], 
  useWildCards: boolean = false
): { playerIndices: number[]; communityIndices: number[]; kickerPlayerIndices: number[]; kickerCommunityIndices: number[] } {
  const allCards = [...playerCards, ...communityCards];
  if (allCards.length === 0) {
    return { playerIndices: [], communityIndices: [], kickerPlayerIndices: [], kickerCommunityIndices: [] };
  }
  
  const eval_ = evaluateHand(allCards, useWildCards);
  const rank = eval_.rank;
  
  // Sort by rank value for finding hands
  const sortedAllCards = [...allCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  // Count ranks
  const rankCounts: Record<string, number> = {};
  allCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  
  // Get rank groups sorted by count then value
  const rankGroups = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1] || RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank]);
  
  const playerIndices: number[] = [];
  const communityIndices: number[] = [];
  const kickerPlayerIndices: number[] = [];
  const kickerCommunityIndices: number[] = [];
  
  // Helper to find card index in original arrays
  const findCardIndex = (card: Card, searchIn: Card[], usedIndices: Set<number>): number => {
    for (let i = 0; i < searchIn.length; i++) {
      if (!usedIndices.has(i) && searchIn[i].rank === card.rank && searchIn[i].suit === card.suit) {
        usedIndices.add(i);
        return i;
      }
    }
    return -1;
  };
  
  const usedPlayerIndices = new Set<number>();
  const usedCommunityIndices = new Set<number>();
  
  // Helper to add card to appropriate index array
  const addCard = (card: Card, isKicker: boolean = false) => {
    let idx = findCardIndex(card, playerCards, usedPlayerIndices);
    if (idx !== -1) {
      if (isKicker) kickerPlayerIndices.push(idx);
      else playerIndices.push(idx);
      return;
    }
    idx = findCardIndex(card, communityCards, usedCommunityIndices);
    if (idx !== -1) {
      if (isKicker) kickerCommunityIndices.push(idx);
      else communityIndices.push(idx);
    }
  };
  
  switch (rank) {
    case 'five-of-a-kind':
    case 'four-of-a-kind':
    case 'three-of-a-kind': {
      const targetRank = rankGroups[0]?.[0];
      if (targetRank) {
        allCards.filter(c => c.rank === targetRank).forEach(c => addCard(c));
      }
      break;
    }
    case 'full-house': {
      const tripRank = rankGroups[0]?.[0];
      const pairRank = rankGroups[1]?.[0];
      if (tripRank) allCards.filter(c => c.rank === tripRank).forEach(c => addCard(c));
      if (pairRank) allCards.filter(c => c.rank === pairRank).slice(0, 2).forEach(c => addCard(c));
      break;
    }
    case 'two-pair': {
      const truePairs = rankGroups.filter(([_, count]) => count >= 2);
      truePairs.sort((a, b) => RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank]);
      if (truePairs[0]) allCards.filter(c => c.rank === truePairs[0][0]).slice(0, 2).forEach(c => addCard(c));
      if (truePairs[1]) allCards.filter(c => c.rank === truePairs[1][0]).slice(0, 2).forEach(c => addCard(c));
      // Add kicker
      const kicker = sortedAllCards.find(c => c.rank !== truePairs[0]?.[0] && c.rank !== truePairs[1]?.[0]);
      if (kicker) addCard(kicker, true);
      break;
    }
    case 'pair': {
      const pairRank = rankGroups.find(([_, count]) => count >= 2)?.[0];
      if (pairRank) allCards.filter(c => c.rank === pairRank).slice(0, 2).forEach(c => addCard(c));
      // Add kickers (up to 3)
      const kickers = sortedAllCards.filter(c => c.rank !== pairRank).slice(0, 3);
      kickers.forEach(c => addCard(c, true));
      break;
    }
    case 'straight':
    case 'straight-flush': {
      // Find the 5 cards that make the straight
      const values = sortedAllCards.map(c => RANK_VALUES[c.rank]);
      const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
      
      // Find best 5-card straight run
      for (let i = 0; i <= uniqueValues.length - 5; i++) {
        const run = uniqueValues.slice(i, i + 5);
        if (run[0] - run[4] === 4) {
          run.forEach(val => {
            const card = sortedAllCards.find(c => 
              RANK_VALUES[c.rank] === val && 
              !playerIndices.includes(playerCards.indexOf(c)) && 
              !communityIndices.includes(communityCards.indexOf(c))
            );
            if (card) addCard(card);
          });
          break;
        }
      }
      // Check wheel (A-2-3-4-5)
      if (playerIndices.length + communityIndices.length < 5) {
        const wheel = [14, 5, 4, 3, 2];
        if (wheel.every(v => values.includes(v))) {
          wheel.forEach(val => {
            const card = sortedAllCards.find(c => RANK_VALUES[c.rank] === val);
            if (card) addCard(card);
          });
        }
      }
      break;
    }
    case 'flush': {
      // Find flush suit and highlight 5 highest cards of that suit
      const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
      allCards.forEach(c => suitCounts[c.suit]++);
      const flushSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Suit;
      const flushCards = sortedAllCards.filter(c => c.suit === flushSuit).slice(0, 5);
      flushCards.forEach(c => addCard(c));
      break;
    }
    case 'high-card':
    default: {
      // Just highlight the highest card
      if (sortedAllCards[0]) addCard(sortedAllCards[0]);
      break;
    }
  }
  
  return { playerIndices, communityIndices, kickerPlayerIndices, kickerCommunityIndices };
}

// Check if a hand contains 3, 5, and 7 (the magical 357 hand in round 1)
export function has357Hand(cards: Card[]): boolean {
  if (!cards || cards.length !== 3) return false;
  
  const ranks = cards.map(c => c.rank);
  return ranks.includes('3') && ranks.includes('5') && ranks.includes('7');
}
