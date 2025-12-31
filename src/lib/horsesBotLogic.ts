/**
 * Horses Bot Decision Logic
 * 
 * Bot strategy:
 * 1. Always hold 1s (wilds)
 * 2. Consider the current winning hand when deciding what to keep
 * 3. Try to make the best hand that at least ties/beats the winning hand
 */

import { DiceValue, HorsesHand, HorsesHandResult, evaluateHand } from './horsesGameLogic';

interface BotDecisionContext {
  currentDice: DiceValue[];
  rollsRemaining: number;
  currentWinningResult: HorsesHandResult | null;
}

interface HoldDecision {
  diceToHold: boolean[]; // Array of 5 booleans
  targetValue: number;   // The value bot is trying to collect
  reasoning: string;     // For debugging
}

/**
 * Determine which dice the bot should hold based on current state and winning hand
 */
export function getBotHoldDecision(context: BotDecisionContext): HoldDecision {
  const { currentDice, currentWinningResult } = context;
  
  // Count each value
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  currentDice.forEach(d => counts[d.value]++);
  
  const wildCount = counts[1];
  
  // Calculate best possible hand for each target value (6 down to 2)
  const possibleHands: { value: number; count: number; rank: number }[] = [];
  for (let v = 6; v >= 2; v--) {
    const totalCount = Math.min(counts[v] + wildCount, 5);
    // Calculate rank same way as evaluateHand
    let rank: number;
    if (totalCount === 5) {
      rank = 50 + (v - 2);
    } else if (totalCount === 4) {
      rank = 40 + (v - 2);
    } else if (totalCount === 3) {
      rank = 30 + (v - 2);
    } else if (totalCount === 2) {
      rank = 20 + (v - 2);
    } else {
      rank = 10 + v;
    }
    possibleHands.push({ value: v, count: totalCount, rank });
  }
  
  // Sort by rank descending
  possibleHands.sort((a, b) => b.rank - a.rank);
  
  let targetValue: number;
  let reasoning: string;
  
  if (!currentWinningResult) {
    // No winning hand yet - just go for best possible hand
    targetValue = possibleHands[0].value;
    reasoning = `No winning hand to beat. Going for ${possibleHands[0].count} ${targetValue}s.`;
  } else {
    // Need to beat or tie the current winning hand
    const neededRank = currentWinningResult.rank;
    
    // Find best achievable hand that can match or beat the winning rank
    // Consider what's realistically achievable with remaining rolls
    const currentBest = possibleHands[0];
    
    if (currentBest.rank >= neededRank) {
      // We can already match or beat - go for our current best
      targetValue = currentBest.value;
      reasoning = `Can beat/tie winning hand (${currentWinningResult.description}). Going for ${currentBest.count} ${targetValue}s.`;
    } else {
      // Need to find what would beat the winning hand
      // The winning hand rank tells us what we need
      // e.g., if winning is 5 6s (rank 54), we need 5 1s (rank 55) or 5 6s (rank 54)
      // if winning is 4 5s (rank 43), we need 4 6s (44), or 5 of anything (50+)
      
      // Strategy: aim for the highest value that gives us the best chance
      // If winning hand is X count of Y value, we need:
      // - Same count of higher value, OR
      // - Higher count of any value
      
      const winningCount = currentWinningResult.ofAKindCount;
      const winningValue = currentWinningResult.highValue;
      
      // Find target: prefer going for higher count if close, else match count with higher value
      let bestTarget = 6;
      let bestScore = -1;
      
      for (let v = 6; v >= 2; v--) {
        const currentCountForV = counts[v] + wildCount;
        
        // Score: how many more dice do we need to beat/tie?
        // Lower is better
        let neededForTie: number;
        let neededForBeat: number;
        
        if (v > winningValue) {
          // Higher value - need same count to beat
          neededForTie = winningCount;
          neededForBeat = winningCount;
        } else if (v === winningValue) {
          // Same value - need same count to tie
          neededForTie = winningCount;
          neededForBeat = winningCount + 1; // Can't beat with same value (max 5)
        } else {
          // Lower value - need higher count to beat
          neededForTie = winningCount + 1;
          neededForBeat = winningCount + 1;
        }
        
        const shortfall = Math.max(0, neededForTie - currentCountForV);
        // Score based on likelihood of achieving (fewer dice needed = higher score)
        const score = (5 - shortfall) * 10 + v; // Prefer fewer shortfall, then higher value
        
        if (score > bestScore) {
          bestScore = score;
          bestTarget = v;
        }
      }
      
      targetValue = bestTarget;
      reasoning = `Trying to beat ${currentWinningResult.description}. Targeting ${targetValue}s.`;
    }
  }
  
  // Determine which dice to hold
  // Always hold 1s (wilds) and dice matching target value
  const diceToHold = currentDice.map(d => d.value === 1 || d.value === targetValue);
  
  return {
    diceToHold,
    targetValue,
    reasoning,
  };
}

/**
 * Determine if bot should stop rolling early
 */
export function shouldBotStopRolling(
  currentDice: DiceValue[],
  rollsRemaining: number,
  currentWinningResult: HorsesHandResult | null
): boolean {
  const result = evaluateHand(currentDice);
  
  // If we have 5 of a kind, always stop
  if (result.ofAKindCount === 5) {
    return true;
  }
  
  // If we have 4 of a kind with 6s or no winning hand to beat, might stop early
  if (result.ofAKindCount === 4) {
    if (!currentWinningResult) {
      // No winning hand - 4 of a kind is strong, might stop
      return result.highValue >= 5; // Stop on 4 5s or 4 6s with no competition
    }
    
    // Check if we're already winning
    if (result.rank >= currentWinningResult.rank) {
      return true;
    }
  }
  
  // If last roll anyway, no choice
  if (rollsRemaining === 0) {
    return true;
  }
  
  return false;
}

/**
 * Apply hold decisions to a hand
 */
export function applyHoldDecision(hand: HorsesHand, decision: HoldDecision): HorsesHand {
  return {
    ...hand,
    dice: hand.dice.map((d, i) => ({
      ...d,
      isHeld: decision.diceToHold[i],
    })),
  };
}
