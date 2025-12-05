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

  // CRITICAL: Validate and normalize card data from database
  const validatedCards: Card[] = cards.map(c => {
    // Handle potential JSON parsing issues - ensure we have proper card objects
    const card = c as any;
    const suit = (card.suit || card.Suit || '') as Suit;
    const rank = (card.rank || card.Rank || '') as Rank;
    return { suit, rank };
  }).filter(c => c.suit && c.rank && RANKS.includes(c.rank) && SUITS.includes(c.suit));

  if (validatedCards.length === 0) {
    console.error('[EVAL] ERROR: No valid cards after validation!', cards);
    return { rank: 'high-card', value: 0 };
  }

  if (validatedCards.length !== cards.length) {
    console.warn('[EVAL] WARNING: Some cards were invalid!', {
      original: cards.length,
      validated: validatedCards.length,
      originalCards: cards,
      validatedCards
    });
  }

  // Log input cards
  const cardStr = validatedCards.map(c => `${c.rank}${c.suit}`).join(', ');
  console.log('[EVAL] ========== START EVALUATION ==========');
  console.log('[EVAL] Cards:', cardStr);
  console.log('[EVAL] Card count:', validatedCards.length, '| useWildCards:', useWildCards);

  // Determine wild card based on number of cards dealt (if wild cards are enabled)
  const wildRank: Rank = useWildCards ? (validatedCards.length <= 3 ? '3' : validatedCards.length === 5 ? '5' : '7') : 'A';
  
  // Count wildcards (only if wildcards are enabled)
  const wildcards = useWildCards ? validatedCards.filter(c => c.rank === wildRank) : [];
  const nonWildcards = useWildCards ? validatedCards.filter(c => c.rank !== wildRank) : validatedCards;
  const wildcardCount = wildcards.length;
  
  if (useWildCards) {
    console.log('[EVAL] Wild rank:', wildRank, '| Wildcards found:', wildcardCount);
  }

  // If all cards are wildcards in round 1 (3 cards), treat as best possible: three of a kind
  if (validatedCards.length === 3 && wildcardCount === validatedCards.length) {
    const result = { rank: 'three-of-a-kind' as HandRank, value: calculateValue(3, [14, 14]) };
    console.log('[EVAL] RESULT: All wildcards (3 cards) -> three-of-a-kind, value:', result.value);
    return result;
  }

  // If all cards are wildcards in round 2+ (5 or 7 cards), treat as straight flush
  if (validatedCards.length >= 5 && wildcardCount === validatedCards.length) {
    const result = { rank: 'straight-flush' as HandRank, value: calculateValue(8, [14]) };
    console.log('[EVAL] RESULT: All wildcards (5+ cards) -> straight-flush, value:', result.value);
    return result;
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

  console.log('[EVAL] Rank counts:', JSON.stringify(rankCounts));
  console.log('[EVAL] Sorted rank groups:', rankGroups.map(([r,c]) => `${r}:${c}`).join(', '));
  console.log('[EVAL] bestRank:', bestRank, 'bestCount:', bestCount, '| secondRank:', secondRank, 'secondCount:', secondCount);
  console.log('[EVAL] Full house check: bestCount>=3?', bestCount >= 3, '&& secondCount>=2?', secondCount >= 2, '=', bestCount >= 3 && secondCount >= 2);

  // ROUND 1 (3 cards): Only three-of-a-kind, pair, or high card are possible
  if (validatedCards.length === 3) {
    console.log('[EVAL] Round 1 (3 cards) - checking: three-of-a-kind, pair, high-card only');
    
    // Three of a Kind
    if (bestCount >= 3) {
      const tripRank = bestRank;
      const kickers = sortedCards
        .filter(c => c.rank !== tripRank)
        .map(c => RANK_VALUES[c.rank])
        .slice(0, 2);
      const result = { rank: 'three-of-a-kind' as HandRank, value: calculateValue(3, [RANK_VALUES[tripRank], ...kickers]) };
      console.log('[EVAL] RESULT: three-of-a-kind of', tripRank, 'value:', result.value);
      return result;
    }

    // Pair (including with wildcards)
    if (bestCount >= 2) {
      const pairRank = bestRank;
      const kickers = sortedCards
        .filter(c => c.rank !== pairRank)
        .map(c => RANK_VALUES[c.rank])
        .slice(0, 3);
      const result = { rank: 'pair' as HandRank, value: calculateValue(1, [RANK_VALUES[pairRank], ...kickers]) };
      console.log('[EVAL] RESULT: pair of', pairRank, 'value:', result.value);
      return result;
    }

    // High Card
    const allValues = sortedCards.map(c => RANK_VALUES[c.rank]).slice(0, 5);
    const result = { rank: 'high-card' as HandRank, value: calculateValue(0, allValues) };
    console.log('[EVAL] RESULT: high-card, values:', allValues, 'value:', result.value);
    return result;
  }

  // ROUND 2+ (5 or 7 cards): All hands are possible
  console.log('[EVAL] Round 2+ (' + validatedCards.length + ' cards) - checking all hand types');
  
  // Check for potential straight flush with wildcards
  console.log('[EVAL] Checking straight flush...');
  const straightFlushResult = checkStraightFlush(sortedCards, wildcardCount);
  console.log('[EVAL] Straight flush result:', straightFlushResult);
  if (straightFlushResult.possible) {
    const result = { rank: 'straight-flush' as HandRank, value: calculateValue(8, [straightFlushResult.highCard]) };
    console.log('[EVAL] RESULT: straight-flush, high:', straightFlushResult.highCard, 'value:', result.value);
    return result;
  }

  // Four of a Kind
  console.log('[EVAL] Checking four-of-a-kind... bestCount:', bestCount);
  if (bestCount >= 4) {
    const quadRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== quadRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 1);
    const result = { rank: 'four-of-a-kind' as HandRank, value: calculateValue(7, [RANK_VALUES[quadRank], ...kickers]) };
    console.log('[EVAL] RESULT: four-of-a-kind of', quadRank, 'value:', result.value);
    return result;
  }

  // Full House (3 + 2)
  console.log('[EVAL] Checking full house... bestCount:', bestCount, 'secondCount:', secondCount);
  if (bestCount >= 3 && secondCount >= 2) {
    const tripRank = bestRank;
    const pairRank = secondRank;
    const result = { rank: 'full-house' as HandRank, value: calculateValue(6, [RANK_VALUES[tripRank], RANK_VALUES[pairRank]]) };
    console.log('[EVAL] RESULT: full-house', tripRank, 'full of', pairRank, 'value:', result.value);
    return result;
  }

  // Flush with wildcards
  console.log('[EVAL] Checking flush...');
  const flushResult = checkFlush(sortedCards, wildcardCount);
  console.log('[EVAL] Flush result:', flushResult);
  if (flushResult.possible) {
    const flushCards = sortedCards
      .filter(c => flushResult.suit ? c.suit === flushResult.suit : true)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 5);
    const result = { rank: 'flush' as HandRank, value: calculateValue(5, flushCards) };
    console.log('[EVAL] RESULT: flush, cards:', flushCards, 'value:', result.value);
    return result;
  }

  // Straight with wildcards
  console.log('[EVAL] Checking straight...');
  const straightResult = checkStraightWithWildcards(ranks, wildcardCount);
  console.log('[EVAL] Straight result:', straightResult);
  if (straightResult.possible) {
    const result = { rank: 'straight' as HandRank, value: calculateValue(4, [straightResult.highCard]) };
    console.log('[EVAL] RESULT: straight, high:', straightResult.highCard, 'value:', result.value);
    return result;
  }

  // Three of a Kind
  console.log('[EVAL] Checking three-of-a-kind... bestCount:', bestCount);
  if (bestCount >= 3) {
    const tripRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== tripRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 2);
    const result = { rank: 'three-of-a-kind' as HandRank, value: calculateValue(3, [RANK_VALUES[tripRank], ...kickers]) };
    console.log('[EVAL] RESULT: three-of-a-kind of', tripRank, 'value:', result.value);
    return result;
  }

  // Two Pair - CRITICAL: Need BOTH bestCount and secondCount >= 2
  // bestCount already includes wildcards, secondCount is raw count from second rank group
  console.log('[EVAL] Checking two-pair... bestCount:', bestCount, 'secondCount:', secondCount);
  console.log('[EVAL] Two-pair check details: bestRank=', bestRank, 'secondRank=', secondRank);
  console.log('[EVAL] All rank groups with counts:', rankGroups.map(([r, c]) => `${r}:${c}`).join(', '));
  
  // Find all ranks that have count >= 2 (pairs)
  const pairsFound = rankGroups.filter(([_, count]) => count >= 2);
  console.log('[EVAL] Pairs found (count >= 2):', pairsFound.map(([r, c]) => `${r}:${c}`).join(', ') || 'NONE');
  
  // CRITICAL FIX: Two-pair requires TWO DIFFERENT ranks with count >= 2
  // The old check was wrong - it used bestCount (which includes wildcards) and secondCount (raw)
  // We should check if we have at least 2 pairs from the actual rank counts
  const hasTwoPair = pairsFound.length >= 2;
  console.log('[EVAL] Has two pair?', hasTwoPair, '(need 2+ pairs, found:', pairsFound.length, ')');
  
  if (hasTwoPair) {
    const highPairRank = pairsFound[0][0] as Rank;
    const lowPairRank = pairsFound[1][0] as Rank;
    const kickers = sortedCards
      .filter(c => c.rank !== highPairRank && c.rank !== lowPairRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 1);
    const result = { rank: 'two-pair' as HandRank, value: calculateValue(2, [RANK_VALUES[highPairRank], RANK_VALUES[lowPairRank], ...kickers]) };
    console.log('[EVAL] RESULT: two-pair', highPairRank, 'and', lowPairRank, 'value:', result.value);
    return result;
  }

  // Pair (including with wildcards)
  console.log('[EVAL] Checking pair... bestCount:', bestCount);
  if (bestCount >= 2) {
    const pairRank = bestRank;
    const kickers = sortedCards
      .filter(c => c.rank !== pairRank)
      .map(c => RANK_VALUES[c.rank])
      .slice(0, 3);
    const result = { rank: 'pair' as HandRank, value: calculateValue(1, [RANK_VALUES[pairRank], ...kickers]) };
    console.log('[EVAL] RESULT: pair of', pairRank, 'value:', result.value);
    return result;
  }

  // High Card
  const allValues = sortedCards.map(c => RANK_VALUES[c.rank]).slice(0, 5);
  const result = { rank: 'high-card' as HandRank, value: calculateValue(0, allValues) };
  console.log('[EVAL] RESULT: high-card, values:', allValues, 'value:', result.value);
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
  
  // Count suits
  const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
  cards.forEach(card => suitCounts[card.suit]++);
  
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  if (maxSuitCount + wildcards >= 5) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count === maxSuitCount)?.[0] as Suit;
    // CRITICAL: Get highest card IN THE FLUSH SUIT, not just highest card overall
    const flushCards = cards.filter(c => c.suit === flushSuit).sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const highCard = flushCards[0] ? RANK_VALUES[flushCards[0].rank] : 14;
    console.log('[FLUSH] Found flush in suit:', flushSuit, 'high card:', highCard, 'flush cards:', flushCards.map(c => `${c.rank}${c.suit}`).join(', '));
    return { possible: true, highCard, suit: flushSuit };
  }
  
  return { possible: false, highCard: 0 };
}

function checkStraightWithWildcards(ranks: Rank[], wildcards: number): { possible: boolean; highCard: number } {
  console.log('[STRAIGHT] checkStraightWithWildcards called with ranks:', ranks, 'wildcards:', wildcards);
  if (ranks.length + wildcards < 5) {
    console.log('[STRAIGHT] Not enough cards for straight');
    return { possible: false, highCard: 0 };
  }
  
  const values = ranks.map(r => RANK_VALUES[r]).sort((a, b) => b - a);
  console.log('[STRAIGHT] Values (sorted desc):', values);
  return canMakeStraight(values, wildcards);
}

function canMakeStraight(values: number[], wildcards: number): { possible: boolean; highCard: number } {
  // Remove duplicates
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
  console.log('[STRAIGHT] canMakeStraight uniqueValues:', uniqueValues, 'wildcards:', wildcards);
  
  // Try to find a sequence of 5 that can be completed with wildcards
  // Check regular straights (high to low)
  for (let start = 14; start >= 5; start--) {
    let needed = 0;
    let cardsInSequence = 0;
    const sequenceCheck: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      const targetValue = start - i;
      sequenceCheck.push(targetValue);
      if (uniqueValues.includes(targetValue)) {
        cardsInSequence++;
      } else {
        needed++;
      }
    }
    
    // Only log when we find a potential match or are close
    if (needed <= wildcards) {
      console.log('[STRAIGHT] Found straight! start:', start, 'sequence:', sequenceCheck, 'have:', cardsInSequence, 'need wildcards:', needed);
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
  
  console.log('[STRAIGHT] Wheel check: have:', wheelHave, 'need:', wheelNeeded, 'wildcards:', wildcards);
  if (wheelNeeded <= wildcards && wheelHave + wheelNeeded >= 5) {
    console.log('[STRAIGHT] Found wheel straight!');
    return { possible: true, highCard: 5 }; // Wheel straight high card is 5
  }
  
  console.log('[STRAIGHT] No straight found');
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
    case 'straight-flush': {
      // For straight flush, find actual straight high card, not just highest card
      const straightHigh = findStraightHighCard(cards, useWildCards);
      result = `Straight Flush, ${valueToRankName(straightHigh)} high`;
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
      result = `Three of a Kind, ${rankNamePlural(RANK_VALUES[tripRank as Rank])}`;
      break;
    }
    case 'two-pair': {
      const pairs = rankGroups.filter(([_, count]) => count >= 2).slice(0, 2);
      if (pairs.length >= 2) {
        const highPair = rankNamePlural(RANK_VALUES[pairs[0][0] as Rank]);
        const lowPair = rankNamePlural(RANK_VALUES[pairs[1][0] as Rank]);
        result = `Two Pair, ${highPair} and ${lowPair}`;
      } else {
        result = 'Two Pair';
      }
      break;
    }
    case 'pair': {
      const pairRank = rankGroups.find(([_, count]) => count >= 2)?.[0] || sortedCards[0]?.rank;
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
