// Detailed cribbage scoring breakdown for animated counting phase

import type { CribbageCard } from './cribbageTypes';
import { getCardPointValue } from './cribbageScoring';

export interface ScoringCombo {
  type: 'fifteen' | 'pair' | 'run' | 'flush' | 'nobs';
  cards: CribbageCard[];
  points: number;
  label: string;
}

function getRankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

/**
 * Find all combinations of cards that sum to 15
 */
function findFifteens(cards: CribbageCard[]): ScoringCombo[] {
  const combos: ScoringCombo[] = [];
  const n = cards.length;
  
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    const comboCards: CribbageCard[] = [];
    
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += getCardPointValue(cards[i]);
        comboCards.push(cards[i]);
      }
    }
    
    if (sum === 15) {
      combos.push({
        type: 'fifteen',
        cards: comboCards,
        points: 2,
        label: '15 for 2',
      });
    }
  }
  
  return combos;
}

/**
 * Find pairs, trips, and quads - consolidating multi-card matches into single combos
 */
function findPairsTripsQuads(cards: CribbageCard[]): ScoringCombo[] {
  const combos: ScoringCombo[] = [];
  
  // Group cards by rank
  const rankGroups: Record<string, CribbageCard[]> = {};
  for (const card of cards) {
    if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
    rankGroups[card.rank].push(card);
  }
  
  // For each rank group, create appropriate combo
  for (const [rank, group] of Object.entries(rankGroups)) {
    if (group.length === 4) {
      // Quads: 6 pairs = 12 points
      combos.push({
        type: 'pair',
        cards: group,
        points: 12,
        label: `Quads (${rank}s)`,
      });
    } else if (group.length === 3) {
      // Trips: 3 pairs = 6 points
      combos.push({
        type: 'pair',
        cards: group,
        points: 6,
        label: `Trips (${rank}s)`,
      });
    } else if (group.length === 2) {
      // Simple pair: 2 points
      combos.push({
        type: 'pair',
        cards: group,
        points: 2,
        label: `Pair of ${rank}s`,
      });
    }
  }
  
  return combos;
}

/**
 * Find runs (consecutive sequences of 3+ cards)
 */
function findRuns(cards: CribbageCard[]): ScoringCombo[] {
  if (cards.length < 3) return [];
  
  const combos: ScoringCombo[] = [];
  const sortedCards = [...cards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
  
  // Find all possible runs by checking subsets
  for (let start = 0; start < sortedCards.length; start++) {
    for (let end = start + 2; end < sortedCards.length; end++) {
      const subset = sortedCards.slice(start, end + 1);
      const ranks = subset.map(c => getRankValue(c.rank));
      
      // Check if consecutive
      let isRun = true;
      for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] !== ranks[i - 1] + 1) {
          isRun = false;
          break;
        }
      }
      
      if (isRun && subset.length >= 3) {
        // Check if this run is maximal (not part of a longer run)
        const isMaximal = 
          (end === sortedCards.length - 1 || getRankValue(sortedCards[end + 1].rank) !== ranks[ranks.length - 1] + 1) &&
          (start === 0 || getRankValue(sortedCards[start - 1].rank) !== ranks[0] - 1);
        
        if (isMaximal) {
          combos.push({
            type: 'run',
            cards: subset,
            points: subset.length,
            label: `Run of ${subset.length}`,
          });
        }
      }
    }
  }
  
  // Handle duplicate cards creating multiple runs
  // e.g., 3-4-5-5 = two runs of 3
  const rankCounts: Record<number, CribbageCard[]> = {};
  for (const card of cards) {
    const rv = getRankValue(card.rank);
    if (!rankCounts[rv]) rankCounts[rv] = [];
    rankCounts[rv].push(card);
  }
  
  // Find the longest consecutive sequence
  const uniqueRanks = [...new Set(cards.map(c => getRankValue(c.rank)))].sort((a, b) => a - b);
  let bestRunStart = 0;
  let bestRunLength = 0;
  let currentStart = 0;
  
  for (let i = 1; i <= uniqueRanks.length; i++) {
    if (i === uniqueRanks.length || uniqueRanks[i] !== uniqueRanks[i - 1] + 1) {
      const len = i - currentStart;
      if (len > bestRunLength && len >= 3) {
        bestRunLength = len;
        bestRunStart = currentStart;
      }
      currentStart = i;
    }
  }
  
  if (bestRunLength >= 3) {
    // Generate all permutations of the run with duplicate cards
    const runRanks = uniqueRanks.slice(bestRunStart, bestRunStart + bestRunLength);
    const generateRuns = (idx: number, current: CribbageCard[]): CribbageCard[][] => {
      if (idx === runRanks.length) return [current];
      const results: CribbageCard[][] = [];
      for (const card of rankCounts[runRanks[idx]]) {
        results.push(...generateRuns(idx + 1, [...current, card]));
      }
      return results;
    };
    
    const allRuns = generateRuns(0, []);
    return allRuns.map(run => ({
      type: 'run' as const,
      cards: run,
      points: run.length,
      label: `Run of ${run.length}`,
    }));
  }
  
  return [];
}

/**
 * Check for flush
 */
function findFlush(hand: CribbageCard[], cutCard: CribbageCard | null, isCrib: boolean): ScoringCombo[] {
  const suits = hand.map(c => c.suit);
  const allSameSuit = suits.every(s => s === suits[0]);
  
  if (!allSameSuit) return [];
  
  if (isCrib) {
    // Crib only counts if all 5 match
    if (cutCard && cutCard.suit === suits[0]) {
      return [{
        type: 'flush',
        cards: [...hand, cutCard],
        points: 5,
        label: 'Flush (5 cards)',
      }];
    }
    return [];
  }
  
  // Regular hand: 4 for hand, 5 if cut matches
  if (cutCard && cutCard.suit === suits[0]) {
    return [{
      type: 'flush',
      cards: [...hand, cutCard],
      points: 5,
      label: 'Flush (5 cards)',
    }];
  }
  
  return [{
    type: 'flush',
    cards: hand,
    points: 4,
    label: 'Flush (4 cards)',
  }];
}

/**
 * Check for nobs (Jack matching cut suit)
 */
function findNobs(hand: CribbageCard[], cutCard: CribbageCard | null): ScoringCombo[] {
  if (!cutCard) return [];
  
  for (const card of hand) {
    if (card.rank === 'J' && card.suit === cutCard.suit) {
      return [{
        type: 'nobs',
        cards: [card],
        points: 1,
        label: 'Nobs',
      }];
    }
  }
  
  return [];
}

/**
 * Get all scoring combinations for a hand (for animated display)
 */
export function getHandScoringCombos(
  hand: CribbageCard[],
  cutCard: CribbageCard | null,
  isCrib: boolean = false
): ScoringCombo[] {
  const allCards = cutCard ? [...hand, cutCard] : hand;
  
  const combos: ScoringCombo[] = [
    ...findFifteens(allCards),
    ...findPairsTripsQuads(allCards),
    ...findRuns(allCards),
    ...findFlush(hand, cutCard, isCrib),
    ...findNobs(hand, cutCard),
  ];
  
  return combos;
}

/**
 * Calculate total points from combos
 */
export function getTotalFromCombos(combos: ScoringCombo[]): number {
  return combos.reduce((sum, combo) => sum + combo.points, 0);
}
