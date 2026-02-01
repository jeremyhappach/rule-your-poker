/**
 * Cribbage Bot Decision Logic
 * 
 * Handles:
 * 1. Discarding cards to crib
 * 2. Playing pegging cards
 * 3. Calling "go" when appropriate
 */

import type { CribbageCard, CribbageState, CribbagePlayerState } from './cribbageTypes';
import { getCardPointValue, hasPlayableCard } from './cribbageScoring';
import { DISCARD_COUNT } from './cribbageTypes';

/**
 * Get the numeric rank value for sorting
 */
function getRankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

/**
 * Score a potential hand (simplified heuristic)
 * Higher score = better hand to keep
 */
function scoreHand(cards: CribbageCard[], cutCard: CribbageCard | null): number {
  let score = 0;
  
  // Count 15s
  const values = cards.map(c => getCardPointValue(c));
  // Check all combinations for 15s (simplified - just pairs and triples)
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[i] + values[j] === 15) score += 2;
      for (let k = j + 1; k < values.length; k++) {
        if (values[i] + values[j] + values[k] === 15) score += 2;
      }
    }
  }
  
  // Count pairs
  const ranks = cards.map(c => c.rank);
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i + 1; j < ranks.length; j++) {
      if (ranks[i] === ranks[j]) score += 2;
    }
  }
  
  // Check for runs (simplified - 3-card runs)
  const sortedRanks = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
  for (let i = 0; i <= sortedRanks.length - 3; i++) {
    if (sortedRanks[i + 1] === sortedRanks[i] + 1 && 
        sortedRanks[i + 2] === sortedRanks[i] + 2) {
      score += 3;
    }
  }
  
  // Check for flush (all same suit)
  if (cards.length >= 4 && cards.every(c => c.suit === cards[0].suit)) {
    score += cards.length;
  }
  
  // Bonus for 5s (they make 15s easily)
  score += cards.filter(c => getCardPointValue(c) === 5).length * 0.5;
  
  return score;
}

/**
 * Determine which cards the bot should discard to crib
 */
export function getBotDiscardIndices(
  hand: CribbageCard[],
  playerCount: number,
  isDealer: boolean
): number[] {
  const discardCount = DISCARD_COUNT[playerCount] || 2;
  
  // Generate all possible discard combinations
  const indices = hand.map((_, i) => i);
  const combinations: number[][] = [];
  
  if (discardCount === 1) {
    for (let i = 0; i < hand.length; i++) {
      combinations.push([i]);
    }
  } else if (discardCount === 2) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        combinations.push([i, j]);
      }
    }
  }
  
  // Score each combination (based on kept hand)
  let bestDiscard = combinations[0];
  let bestScore = -Infinity;
  
  for (const discardIndices of combinations) {
    const keptCards = hand.filter((_, i) => !discardIndices.includes(i));
    const discardedCards = discardIndices.map(i => hand[i]);
    
    let keepScore = scoreHand(keptCards, null);
    
    // If dealer, crib cards help us
    // If not dealer, crib cards help opponent (so we prefer low-scoring discards)
    let cribAdjust = scoreHand(discardedCards, null) * 0.5;
    if (!isDealer) {
      cribAdjust = -cribAdjust; // Penalize giving good cards to opponent's crib
    }
    
    // Avoid giving 5s to opponent's crib (they easily make 15s)
    if (!isDealer) {
      const fiveCount = discardedCards.filter(c => getCardPointValue(c) === 5).length;
      cribAdjust -= fiveCount * 2;
    }
    
    const totalScore = keepScore + cribAdjust;
    
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDiscard = discardIndices;
    }
  }
  
  return bestDiscard;
}

/**
 * Determine which card the bot should play during pegging
 */
export function getBotPeggingCardIndex(
  playerState: CribbagePlayerState,
  currentCount: number,
  playedCards: { playerId: string; card: CribbageCard }[]
): number | null {
  const playableCards: { index: number; card: CribbageCard; score: number }[] = [];
  
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    const cardValue = getCardPointValue(card);
    
    if (currentCount + cardValue <= 31) {
      // Calculate pegging potential
      let score = 0;
      const newCount = currentCount + cardValue;
      
      // 15 = 2 points
      if (newCount === 15) score += 20;
      
      // 31 = 2 points
      if (newCount === 31) score += 20;
      
      // Check for pairs with last played card
      if (playedCards.length > 0) {
        const lastCard = playedCards[playedCards.length - 1].card;
        if (lastCard.rank === card.rank) {
          score += 20; // Pair = 2 points
          
          // Check for three of a kind
          if (playedCards.length > 1 && 
              playedCards[playedCards.length - 2].card.rank === card.rank) {
            score += 40; // Three of a kind = 6 points
          }
        }
      }
      
      // Check for runs
      if (playedCards.length >= 2) {
        const recentRanks = playedCards.slice(-2).map(p => getRankValue(p.card.rank));
        const myRank = getRankValue(card.rank);
        const allRanks = [...recentRanks, myRank].sort((a, b) => a - b);
        
        if (allRanks[1] === allRanks[0] + 1 && allRanks[2] === allRanks[1] + 1) {
          score += 30; // 3-card run = 3 points
        }
      }
      
      // Prefer leaving count that's hard to make 15/31
      // Avoid leaving count at 5 or 21 (easy to hit 15/31)
      if (newCount === 5 || newCount === 21) {
        score -= 5;
      }
      
      // Prefer playing lower value cards first (save high cards)
      score -= cardValue * 0.5;
      
      playableCards.push({ index: i, card, score });
    }
  }
  
  if (playableCards.length === 0) {
    return null; // Must call go
  }
  
  // Sort by score descending and return best card
  playableCards.sort((a, b) => b.score - a.score);
  return playableCards[0].index;
}

/**
 * Check if bot should call go (has no playable cards)
 */
export function shouldBotCallGo(
  playerState: CribbagePlayerState,
  currentCount: number
): boolean {
  return !hasPlayableCard(playerState.hand, currentCount);
}
