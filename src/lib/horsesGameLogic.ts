/**
 * Horses Dice Game Logic
 * 
 * Rules:
 * - 5 dice, up to 3 rolls per turn
 * - Players can hold dice between rolls
 * - 1s are wild (count as any number)
 * - Hand rankings: Five of a kind > Four of a kind > Three of a kind > Pair > High card
 * - Within same rank, higher dice value wins (e.g., Five 6s > Five 5s)
 * - Exception: Five 1s (pure wilds) is the best possible hand
 * - Ties cause everyone to re-ante and restart
 */

export interface DiceValue {
  value: number; // 1-6
  isHeld: boolean;
}

// Alias for external use
export type HorsesDie = DiceValue;

export interface HorsesHand {
  dice: DiceValue[];
  rollsRemaining: number;
  isComplete: boolean;
}

export interface HorsesHandResult {
  rank: number; // Higher = better (0-55 scale)
  description: string; // e.g., "4 6s", "3 5s", "6 high"
  ofAKindCount: number; // How many of a kind (1-5)
  highValue: number; // The value being matched (1-6)
}

/**
 * Create initial dice state for a new turn
 */
export function createInitialHand(): HorsesHand {
  return {
    dice: [
      { value: 0, isHeld: false },
      { value: 0, isHeld: false },
      { value: 0, isHeld: false },
      { value: 0, isHeld: false },
      { value: 0, isHeld: false },
    ],
    rollsRemaining: 3,
    isComplete: false,
  };
}

/**
 * Roll a single die (returns 1-6)
 */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Roll all unheld dice
 */
export function rollDice(hand: HorsesHand): HorsesHand {
  if (hand.rollsRemaining <= 0 || hand.isComplete) {
    return hand;
  }

  const newDice = hand.dice.map(die => ({
    value: die.isHeld ? die.value : rollDie(),
    isHeld: die.isHeld,
  }));

  const rollsRemaining = hand.rollsRemaining - 1;
  const isComplete = rollsRemaining === 0;

  // If complete, mark all dice as held
  if (isComplete) {
    newDice.forEach(die => die.isHeld = true);
  }

  return {
    dice: newDice,
    rollsRemaining,
    isComplete,
  };
}

/**
 * Toggle hold state for a specific die
 */
export function toggleHold(hand: HorsesHand, dieIndex: number): HorsesHand {
  if (hand.isComplete || hand.rollsRemaining === 3) {
    // Can't hold before first roll or after completing
    return hand;
  }

  const newDice = hand.dice.map((die, idx) => ({
    ...die,
    isHeld: idx === dieIndex ? !die.isHeld : die.isHeld,
  }));

  return {
    ...hand,
    dice: newDice,
  };
}

/**
 * Lock in the current hand (end turn early)
 */
export function lockInHand(hand: HorsesHand): HorsesHand {
  if (hand.rollsRemaining === 3) {
    // Must roll at least once
    return hand;
  }

  const newDice = hand.dice.map(die => ({
    ...die,
    isHeld: true,
  }));

  return {
    dice: newDice,
    rollsRemaining: 0,
    isComplete: true,
  };
}

/**
 * Evaluate a completed hand and return its rank
 * 
 * Ranking system (higher = better):
 * - Five 1s (pure wilds): 55 (best)
 * - Five 6s: 54
 * - Five 5s: 53
 * - Five 4s: 52
 * - Five 3s: 51
 * - Five 2s: 50
 * - Four 6s: 44
 * - Four 5s: 43
 * - ... etc down to
 * - Pair of 2s: 22
 * - 6 high: 16
 * - 5 high: 15
 * - ... down to 2 high: 12
 */
export function evaluateHand(dice: DiceValue[]): HorsesHandResult {
  const values = dice.map(d => d.value);
  
  // Count each value (1-6)
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  values.forEach(v => counts[v]++);
  
  const wildCount = counts[1]; // 1s are wild
  
  // Special case: Five 1s (pure wilds) - best hand
  if (wildCount === 5) {
    return {
      rank: 100, // Highest possible
      description: "5 1s (Wilds!)",
      ofAKindCount: 5,
      highValue: 1,
    };
  }
  
  // For each non-wild value (6 down to 2), calculate best possible of-a-kind
  // by adding wilds to that value's count
  // Higher values are BETTER, so we want 6s to beat 5s, etc.
  let bestOfAKind = 0;
  let bestValue = 0;
  
  for (let value = 6; value >= 2; value--) {
    const totalWithWilds = counts[value] + wildCount;
    // Take the first (highest value) that gives us the most of-a-kind
    // Or if equal count, prefer higher value
    if (totalWithWilds > bestOfAKind) {
      bestOfAKind = totalWithWilds;
      bestValue = value;
    } else if (totalWithWilds === bestOfAKind && value > bestValue) {
      bestValue = value;
    }
  }
  
  // Cap at 5 (can't have more than 5 of a kind with 5 dice)
  bestOfAKind = Math.min(bestOfAKind, 5);
  
  // Calculate rank - HIGHER dice value = HIGHER rank
  // Ranking: Five 6s > Five 5s > Five 4s > Five 3s > Five 2s > Four 6s > etc.
  // Formula: rank = (ofAKindCount * 10) + diceValue
  // Five 6s = 56, Five 5s = 55, Five 4s = 54, Five 3s = 53, Five 2s = 52
  // Four 6s = 46, Four 5s = 45, etc.
  // This ensures higher dice values beat lower ones within same of-a-kind
  
  let rank: number;
  let description: string;
  
  if (bestOfAKind >= 2) {
    rank = (bestOfAKind * 10) + bestValue;
    description = `${bestOfAKind} ${bestValue}s`;
  } else {
    // High card - no pairs, no wilds helping
    // Find highest non-wild value
    const highCard = Math.max(...values.filter(v => v !== 1), 0) || Math.max(...values);
    rank = 10 + highCard; // 6 high = 16, 5 high = 15, etc.
    description = `${highCard} high`;
  }
  
  console.log(`[HORSES] Evaluated hand: ${values.join(',')} -> ${description} (rank: ${rank})`);
  
  return {
    rank,
    description,
    ofAKindCount: bestOfAKind,
    highValue: bestValue || Math.max(...values),
  };
}

/**
 * Compare two hands and return the winner
 * Returns: 1 if hand1 wins, -1 if hand2 wins, 0 if tie
 */
export function compareHands(hand1: HorsesHandResult, hand2: HorsesHandResult): number {
  if (hand1.rank > hand2.rank) return 1;
  if (hand1.rank < hand2.rank) return -1;
  return 0; // Tie
}

/**
 * Determine winner from multiple hands
 * Returns array of winning player indices (multiple if tie)
 */
export function determineWinners(hands: HorsesHandResult[]): number[] {
  if (hands.length === 0) return [];
  
  let maxRank = -1;
  const winners: number[] = [];
  
  hands.forEach((hand, idx) => {
    if (hand.rank > maxRank) {
      maxRank = hand.rank;
      winners.length = 0;
      winners.push(idx);
    } else if (hand.rank === maxRank) {
      winners.push(idx);
    }
  });
  
  return winners;
}

/**
 * Format dice values for display
 */
export function formatDiceDisplay(dice: DiceValue[]): string {
  return dice.map(d => d.value || '?').join(' ');
}

/**
 * Check if all dice have been rolled at least once
 */
export function hasRolledOnce(hand: HorsesHand): boolean {
  return hand.rollsRemaining < 3;
}

/**
 * Get the number of held dice
 */
export function getHeldCount(hand: HorsesHand): number {
  return hand.dice.filter(d => d.isHeld).length;
}
