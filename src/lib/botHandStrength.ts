import { Card, evaluateHand, RANK_VALUES, HandRank, Rank } from './cardUtils';

export type AggressionLevel = 'very_conservative' | 'conservative' | 'normal' | 'aggressive' | 'very_aggressive';

/**
 * Aggression multipliers for fold probability
 * Higher multiplier = more likely to fold (more conservative)
 * Lower multiplier = less likely to fold (more aggressive)
 */
const AGGRESSION_MULTIPLIERS: Record<AggressionLevel, number> = {
  'very_conservative': 2.0,  // 100% more likely to fold
  'conservative': 1.6,       // 60% more likely to fold
  'normal': 1.3,             // 30% more likely to fold (base shifted up)
  'aggressive': 1.0,         // Standard fold probability
  'very_aggressive': 0.7,    // 30% less likely to fold
};

/**
 * Context for smart aggression adjustments
 */
export interface SmartAggressionContext {
  // For 3-5-7: bot's current legs and legs needed to win
  legs?: number;
  legsToWin?: number;
  // For Holm: current pot and max match amount
  pot?: number;
  potMax?: number;
}

/**
 * Bot fold probability based on hand strength and aggression level
 * Returns a number 0-100 representing the probability the bot should fold
 */
export function getBotFoldProbability(
  cards: Card[],
  communityCards: Card[],
  gameType: 'holm' | '357',
  roundNumber: number,
  aggressionLevel: AggressionLevel = 'normal',
  context?: SmartAggressionContext
): number {
  // Combine player cards with community cards for evaluation
  const allCards = [...cards, ...communityCards];
  
  // For Holm, we don't use wild cards. For 3-5-7, use wild based on round
  const useWildCards = gameType === '357';
  // Determine explicit wild rank for 3-5-7 games
  const wildRank = gameType === '357' ? (roundNumber === 1 ? '3' : roundNumber === 2 ? '5' : '7') : null;
  const evaluation = evaluateHand(allCards, useWildCards, wildRank as any);
  
  console.log('[BOT STRENGTH] Evaluating hand:', {
    gameType,
    roundNumber,
    cardCount: allCards.length,
    rank: evaluation.rank,
    value: evaluation.value,
    aggressionLevel,
    context
  });
  
  // Get base fold probability
  let baseProbability: number;
  if (gameType === 'holm') {
    baseProbability = getHolmFoldProbability(evaluation.rank, allCards);
  } else {
    baseProbability = get357FoldProbability(evaluation.rank, allCards, roundNumber);
  }
  
  // Apply aggression multiplier
  const multiplier = AGGRESSION_MULTIPLIERS[aggressionLevel];
  let adjustedProbability = Math.min(100, Math.max(0, baseProbability * multiplier));
  
  // Apply smart aggression adjustments
  adjustedProbability = applySmartAggression(adjustedProbability, gameType, context);
  
  console.log('[BOT STRENGTH] Fold probability:', {
    baseProbability,
    multiplier,
    adjustedProbability
  });
  
  return adjustedProbability;
}

/**
 * Apply smart aggression adjustments based on game context
 * Reduces fold probability when stakes are high
 */
function applySmartAggression(
  foldProbability: number,
  gameType: 'holm' | '357',
  context?: SmartAggressionContext
): number {
  if (!context) return foldProbability;
  
  let adjusted = foldProbability;
  
  if (gameType === '357') {
    // In 3-5-7: Be more aggressive when one leg away from winning
    const { legs = 0, legsToWin = 3 } = context;
    if (legs === legsToWin - 1) {
      // One leg away - reduce fold probability by 40%
      adjusted *= 0.6;
      console.log('[BOT STRENGTH] Smart aggression: One leg away from winning, reducing fold probability by 40%');
    } else if (legs === legsToWin - 2 && legsToWin > 2) {
      // Two legs away - reduce fold probability by 20%
      adjusted *= 0.8;
      console.log('[BOT STRENGTH] Smart aggression: Two legs away from winning, reducing fold probability by 20%');
    }
  } else if (gameType === 'holm') {
    // In Holm: Be more aggressive when pot/match ratio is favorable
    const { pot = 0, potMax = 0 } = context;
    if (potMax > 0 && pot > 0) {
      const potToMatchRatio = pot / potMax;
      if (potToMatchRatio >= 3) {
        // Pot is 3x+ the match amount - very favorable, reduce fold by 50%
        adjusted *= 0.5;
        console.log('[BOT STRENGTH] Smart aggression: Pot/match ratio >= 3, reducing fold probability by 50%');
      } else if (potToMatchRatio >= 2) {
        // Pot is 2x+ the match amount - favorable, reduce fold by 30%
        adjusted *= 0.7;
        console.log('[BOT STRENGTH] Smart aggression: Pot/match ratio >= 2, reducing fold probability by 30%');
      } else if (potToMatchRatio >= 1.5) {
        // Pot is 1.5x+ the match amount - slightly favorable, reduce fold by 15%
        adjusted *= 0.85;
        console.log('[BOT STRENGTH] Smart aggression: Pot/match ratio >= 1.5, reducing fold probability by 15%');
      }
    }
  }
  
  return Math.min(100, Math.max(0, adjusted));
}

/**
 * Holm game fold probabilities (all rounds):
 * - Flush or better: 0%
 * - 3 of a kind or straight: 5%
 * - 4 of a flush or 2 pair: 15%
 * - Pair (any): 35%
 * - High card: 60%
 */
function getHolmFoldProbability(rank: HandRank, cards: Card[]): number {
  // Flush or better (flush, full-house, four-of-a-kind, straight-flush, five-of-a-kind)
  if (['flush', 'full-house', 'four-of-a-kind', 'straight-flush', 'five-of-a-kind'].includes(rank)) {
    return 0;
  }
  
  // 3 of a kind or straight - very strong, rarely fold
  if (rank === 'three-of-a-kind' || rank === 'straight') {
    return 5;
  }
  
  // Check for 4 cards to a flush (4-flush) or two pair - good drawing hands
  if (rank === 'two-pair' || hasFourToFlush(cards)) {
    return 15;
  }
  
  // Any pair - decent hand, stay more often
  if (rank === 'pair') {
    return 35;
  }
  
  // High card only - more likely to fold but not always
  return 60;
}

/**
 * Check if hand has 4 cards of the same suit (4-flush draw)
 */
function hasFourToFlush(cards: Card[]): boolean {
  const suitCounts: Record<string, number> = {};
  cards.forEach(c => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });
  return Object.values(suitCounts).some(count => count >= 4);
}

/**
 * 3-5-7 game fold probabilities by round
 */
function get357FoldProbability(rank: HandRank, cards: Card[], roundNumber: number): number {
  // Get the best rank value for pair comparisons
  const pairRankValue = getPairRankValue(cards, roundNumber);
  const threeOfAKindRankValue = getThreeOfAKindRankValue(cards, roundNumber);
  
  if (roundNumber === 1) {
    return getRound1FoldProbability(rank, pairRankValue);
  } else if (roundNumber === 2) {
    return getRound2FoldProbability(rank, threeOfAKindRankValue);
  } else {
    return getRound3FoldProbability(rank, threeOfAKindRankValue);
  }
}

/**
 * Get the rank value of the pair (if any), excluding wild cards
 */
function getPairRankValue(cards: Card[], roundNumber: number): number {
  const wildRank: Rank = roundNumber === 1 ? '3' : roundNumber === 2 ? '5' : '7';
  
  // Count non-wild card ranks
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => {
    if (c.rank !== wildRank) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
  });
  
  // Find pair (including with wild card help)
  const wildcardCount = cards.filter(c => c.rank === wildRank).length;
  
  // Sort ranks by count (descending) then value (descending)
  const sortedRanks = Object.entries(rankCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank];
    });
  
  // The pair rank is the highest count rank (with wild card contribution)
  if (sortedRanks.length > 0) {
    const [bestRank, count] = sortedRanks[0];
    if (count + wildcardCount >= 2) {
      return RANK_VALUES[bestRank as Rank];
    }
  }
  
  // No pair found, return 0
  return 0;
}

/**
 * Get the rank value of the three of a kind (if any), excluding wild cards
 */
function getThreeOfAKindRankValue(cards: Card[], roundNumber: number): number {
  const wildRank: Rank = roundNumber === 1 ? '3' : roundNumber === 2 ? '5' : '7';
  
  // Count non-wild card ranks
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => {
    if (c.rank !== wildRank) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
  });
  
  const wildcardCount = cards.filter(c => c.rank === wildRank).length;
  
  // Sort ranks by count (descending) then value (descending)
  const sortedRanks = Object.entries(rankCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return RANK_VALUES[b[0] as Rank] - RANK_VALUES[a[0] as Rank];
    });
  
  if (sortedRanks.length > 0) {
    const [bestRank, count] = sortedRanks[0];
    if (count + wildcardCount >= 3) {
      return RANK_VALUES[bestRank as Rank];
    }
  }
  
  return 0;
}

/**
 * Round 1 (3 cards, 3s wild) - AGGRESSIVE:
 * - Pair of Queens or better: 0%
 * - Pair of 8s through Js: 5%
 * - Pair of 2s through 7s: 15%
 * - High card Ace: 30%
 * - Any other high card: 45%
 */
function getRound1FoldProbability(rank: HandRank, pairRankValue: number): number {
  // Three of a kind is always 0% (even stronger than pair of queens)
  if (rank === 'three-of-a-kind') {
    return 0;
  }
  
  if (rank === 'pair') {
    // Queens (12) or better (K=13, A=14)
    if (pairRankValue >= 12) {
      return 0;
    }
    // 8s through Js (8, 9, 10, 11)
    if (pairRankValue >= 8 && pairRankValue <= 11) {
      return 5;
    }
    // 2s through 7s (2-7)
    return 15;
  }
  
  // High card
  if (rank === 'high-card') {
    // Check if highest card is Ace (but not a pair)
    if (pairRankValue === 0) {
      // No pair - check high card
      // Since we don't have exact high card here, assume worst case
      return 45;
    }
  }
  
  // Default high card
  return 45;
}

/**
 * Round 2 (5 cards, 5s wild) - AGGRESSIVE:
 * - Flush or better: 0%
 * - 3 of a kind Queens through Straight: 5%
 * - 3 of a kind 3s through Jacks: 20%
 * - Two pair: 35%
 * - Pair or worse: 50%
 */
function getRound2FoldProbability(rank: HandRank, threeOfAKindRankValue: number): number {
  // Flush or better
  if (['flush', 'full-house', 'four-of-a-kind', 'straight-flush', 'five-of-a-kind'].includes(rank)) {
    return 0;
  }
  
  // Straight
  if (rank === 'straight') {
    return 5;
  }
  
  // Three of a kind - check rank
  if (rank === 'three-of-a-kind') {
    // Queens (12) or better
    if (threeOfAKindRankValue >= 12) {
      return 5;
    }
    // 3s through Jacks (3-11) - but 5 is wild in round 2, so effectively 3, 4, 6-11
    return 20;
  }
  
  // Two pair
  if (rank === 'two-pair') {
    return 35;
  }
  
  // Pair or worse
  return 50;
}

/**
 * Round 3 (7 cards, 7s wild) - AGGRESSIVE:
 * - Full house or better: 0%
 * - Straight or flush: 5%
 * - 3 of a kind Queens or better: 20%
 * - 3 of a kind 2s through Jacks: 35%
 * - Two pair or worse: 55%
 */
function getRound3FoldProbability(rank: HandRank, threeOfAKindRankValue: number): number {
  // Full house or better
  if (['full-house', 'four-of-a-kind', 'straight-flush', 'five-of-a-kind'].includes(rank)) {
    return 0;
  }
  
  // Straight or flush
  if (rank === 'straight' || rank === 'flush') {
    return 5;
  }
  
  // Three of a kind - check rank
  if (rank === 'three-of-a-kind') {
    // Queens (12) or better
    if (threeOfAKindRankValue >= 12) {
      return 20;
    }
    // 2s through Jacks
    return 35;
  }
  
  // Two pair or worse (including pair and high-card)
  return 55;
}
