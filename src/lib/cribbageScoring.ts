// Cribbage hand evaluation and scoring logic

import type { CribbageCard, HandScore, PeggingPoints } from './cribbageTypes';

/**
 * Get the numeric rank value (A=1, 2-10=face, J=11, Q=12, K=13)
 */
function getRankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

/**
 * Get the point value for pegging (A=1, 2-10=face, J/Q/K=10)
 */
export function getCardPointValue(card: CribbageCard): number {
  const rank = card.rank;
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

/**
 * Count all combinations of cards that sum to 15 (2 points each)
 */
function countFifteens(cards: CribbageCard[]): number {
  let count = 0;
  const values = cards.map(getCardPointValue);
  
  // Check all subsets (2^n combinations)
  const n = values.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += values[i];
      }
    }
    if (sum === 15) count++;
  }
  
  return count * 2; // 2 points per fifteen
}

/**
 * Count pairs, three-of-a-kind, and four-of-a-kind (2 points per pair)
 */
function countPairs(cards: CribbageCard[]): number {
  const rankCounts: Record<string, number> = {};
  for (const card of cards) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  }
  
  let points = 0;
  for (const count of Object.values(rankCounts)) {
    if (count >= 2) {
      // n cards of same rank = n*(n-1)/2 pairs, each worth 2 points
      points += (count * (count - 1) / 2) * 2;
    }
  }
  
  return points;
}

/**
 * Find the longest run(s) and score them
 * A run of 3 = 3 points, 4 = 4 points, 5 = 5 points
 * Multiple runs are counted separately (e.g., 3-4-5-5 = two runs of 3 = 6 points)
 */
function countRuns(cards: CribbageCard[]): number {
  if (cards.length < 3) return 0;
  
  const sortedRanks = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
  
  // Count occurrences of each rank
  const rankCounts: Record<number, number> = {};
  for (const rank of sortedRanks) {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  }
  
  // Get unique sorted ranks
  const uniqueRanks = [...new Set(sortedRanks)].sort((a, b) => a - b);
  
  // Find consecutive sequences
  let maxRunLength = 0;
  let runMultiplier = 1;
  
  let currentRunStart = 0;
  for (let i = 1; i <= uniqueRanks.length; i++) {
    // Check if sequence breaks
    if (i === uniqueRanks.length || uniqueRanks[i] !== uniqueRanks[i - 1] + 1) {
      const runLength = i - currentRunStart;
      
      if (runLength >= 3) {
        // Calculate multiplier from duplicate cards in the run
        let mult = 1;
        for (let j = currentRunStart; j < i; j++) {
          mult *= rankCounts[uniqueRanks[j]];
        }
        
        if (runLength > maxRunLength) {
          maxRunLength = runLength;
          runMultiplier = mult;
        } else if (runLength === maxRunLength) {
          // Same length run found - this shouldn't happen in a 5-card hand
          // but handle it just in case
        }
      }
      
      currentRunStart = i;
    }
  }
  
  return maxRunLength >= 3 ? maxRunLength * runMultiplier : 0;
}

/**
 * Check for flush (4 or 5 cards of same suit)
 * In hand: 4 cards same suit = 4 points, 5 with cut = 5 points
 * In crib: Only counts if all 5 are same suit
 */
function countFlush(hand: CribbageCard[], cutCard: CribbageCard | null, isCrib: boolean): number {
  const suits = hand.map(c => c.suit);
  const allSameSuit = suits.every(s => s === suits[0]);
  
  if (!allSameSuit) return 0;
  
  if (isCrib) {
    // Crib only counts flush if cut card matches
    return cutCard && cutCard.suit === suits[0] ? 5 : 0;
  }
  
  // Regular hand: 4 for hand flush, 5 if cut matches
  if (cutCard && cutCard.suit === suits[0]) {
    return 5;
  }
  return 4;
}

/**
 * Check for nobs (Jack in hand matching cut card suit)
 */
function countNobs(hand: CribbageCard[], cutCard: CribbageCard | null): number {
  if (!cutCard) return 0;
  
  for (const card of hand) {
    if (card.rank === 'J' && card.suit === cutCard.suit) {
      return 1;
    }
  }
  return 0;
}

/**
 * Evaluate a cribbage hand (4 cards + cut card)
 */
export function evaluateHand(
  hand: CribbageCard[], 
  cutCard: CribbageCard | null, 
  isCrib: boolean = false
): HandScore {
  const allCards = cutCard ? [...hand, cutCard] : hand;
  
  const fifteens = countFifteens(allCards);
  const pairs = countPairs(allCards);
  const runs = countRuns(allCards);
  const flush = countFlush(hand, cutCard, isCrib);
  const nobs = countNobs(hand, cutCard);
  
  return {
    fifteens,
    pairs,
    runs,
    flush,
    nobs,
    total: fifteens + pairs + runs + flush + nobs,
  };
}

/**
 * Check for "His Heels" - cut card is a Jack (2 points to dealer)
 */
export function checkHisHeels(cutCard: CribbageCard | null): boolean {
  return cutCard?.rank === 'J';
}

/**
 * Evaluate pegging points for a played card
 */
export function evaluatePegging(
  playedCards: { playerId: string; card: CribbageCard }[],
  newCard: CribbageCard,
  currentCount: number,
  isLastCard: boolean
): PeggingPoints {
  const newCount = currentCount + getCardPointValue(newCard);
  
  // Check for 15 or 31
  const fifteen = newCount === 15;
  const thirtyOne = newCount === 31;
  
  // Check for pairs (consecutive cards of same rank)
  let pairPoints = 0;
  if (playedCards.length > 0) {
    let pairCount = 1;
    for (let i = playedCards.length - 1; i >= 0; i--) {
      if (playedCards[i].card.rank === newCard.rank) {
        pairCount++;
      } else {
        break;
      }
    }
    if (pairCount >= 2) {
      // 2 = pair (2pts), 3 = three of a kind (6pts), 4 = four of a kind (12pts)
      pairPoints = (pairCount * (pairCount - 1) / 2) * 2;
    }
  }
  
  // Check for runs (3+ consecutive cards in any order, using recent cards)
  let runPoints = 0;
  if (playedCards.length >= 2) {
    // Check progressively longer runs from the end
    for (let len = Math.min(7, playedCards.length + 1); len >= 3; len--) {
      const recentCards = playedCards.slice(-len + 1).map(p => p.card);
      recentCards.push(newCard);
      
      if (recentCards.length === len) {
        const ranks = recentCards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
        let isRun = true;
        for (let i = 1; i < ranks.length; i++) {
          if (ranks[i] !== ranks[i - 1] + 1) {
            isRun = false;
            break;
          }
        }
        if (isRun) {
          runPoints = len;
          break;
        }
      }
    }
  }
  
  const total = 
    (fifteen ? 2 : 0) + 
    (thirtyOne ? 2 : 0) + 
    pairPoints + 
    runPoints + 
    (isLastCard && !thirtyOne ? 1 : 0); // Last card is 1 point (unless hitting 31)
  
  return {
    fifteen,
    thirtyOne,
    pair: pairPoints,
    run: runPoints,
    go: false, // Go is awarded when opponent can't play
    lastCard: isLastCard && !thirtyOne,
    total,
  };
}

/**
 * Check if a card can be played (count + card value <= 31)
 */
export function canPlayCard(card: CribbageCard, currentCount: number): boolean {
  return currentCount + getCardPointValue(card) <= 31;
}

/**
 * Check if a player has any playable cards
 */
export function hasPlayableCard(hand: CribbageCard[], currentCount: number): boolean {
  return hand.some(card => canPlayCard(card, currentCount));
}
