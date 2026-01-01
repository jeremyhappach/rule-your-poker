/**
 * Ship Captain Crew (SCC) Dice Game Logic
 * 
 * Rules:
 * - 5 dice, up to 3 rolls per turn
 * - Must lock Ship (6), Captain (5), Crew (4) in SEQUENCE before cargo counts
 * - These auto-freeze when rolled and cannot be unfrozen
 * - After getting 6-5-4, the remaining two dice are "cargo"
 * - Cargo dice are ALL or NOTHING: re-roll both or lock in your hand
 * - Score is sum of cargo (2-12), or "NQ" (Not Qualified) if you don't get 6-5-4
 * - Highest cargo sum wins; ties cause re-ante
 */

export interface SCCDie {
  value: number; // 1-6, or 0 if not rolled yet
  isHeld: boolean;
  isSCC: boolean; // true if this die is locked as Ship/Captain/Crew
  sccType?: 'ship' | 'captain' | 'crew'; // which SCC position this die represents
}

export interface SCCHand {
  dice: SCCDie[];
  rollsRemaining: number;
  isComplete: boolean;
  hasShip: boolean;
  hasCaptain: boolean;
  hasCrew: boolean;
}

export interface SCCHandResult {
  rank: number; // 0 = NQ, 2-12 = cargo sum (higher = better)
  description: string; // e.g., "Cargo: 11" or "NQ"
  isQualified: boolean;
  cargoSum: number; // 0 if not qualified
}

/**
 * Create initial dice state for a new turn
 */
export function createInitialSCCHand(): SCCHand {
  return {
    dice: [
      { value: 0, isHeld: false, isSCC: false },
      { value: 0, isHeld: false, isSCC: false },
      { value: 0, isHeld: false, isSCC: false },
      { value: 0, isHeld: false, isSCC: false },
      { value: 0, isHeld: false, isSCC: false },
    ],
    rollsRemaining: 3,
    isComplete: false,
    hasShip: false,
    hasCaptain: false,
    hasCrew: false,
  };
}

/**
 * Roll a single die (returns 1-6)
 */
function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Process a roll: apply auto-freeze logic for 6-5-4 in sequence
 */
export function rollSCCDice(hand: SCCHand): SCCHand {
  if (hand.rollsRemaining <= 0 || hand.isComplete) {
    return hand;
  }

  // Roll all non-held dice
  const newDice = hand.dice.map(die => ({
    ...die,
    value: die.isHeld ? die.value : rollDie(),
  }));

  // Track what we have
  let hasShip = hand.hasShip;
  let hasCaptain = hand.hasCaptain;
  let hasCrew = hand.hasCrew;

  // Auto-freeze logic: must get 6 (Ship) first, then 5 (Captain), then 4 (Crew)
  // Only freeze one of each type, in sequence

  // Check for Ship (6) if we don't have it yet
  if (!hasShip) {
    const shipIndex = newDice.findIndex(d => d.value === 6 && !d.isSCC);
    if (shipIndex !== -1) {
      newDice[shipIndex].isHeld = true;
      newDice[shipIndex].isSCC = true;
      newDice[shipIndex].sccType = 'ship';
      hasShip = true;
    }
  }

  // Check for Captain (5) if we have Ship but not Captain
  if (hasShip && !hasCaptain) {
    const captainIndex = newDice.findIndex(d => d.value === 5 && !d.isSCC);
    if (captainIndex !== -1) {
      newDice[captainIndex].isHeld = true;
      newDice[captainIndex].isSCC = true;
      newDice[captainIndex].sccType = 'captain';
      hasCaptain = true;
    }
  }

  // Check for Crew (4) if we have Ship and Captain but not Crew
  if (hasShip && hasCaptain && !hasCrew) {
    const crewIndex = newDice.findIndex(d => d.value === 4 && !d.isSCC);
    if (crewIndex !== -1) {
      newDice[crewIndex].isHeld = true;
      newDice[crewIndex].isSCC = true;
      newDice[crewIndex].sccType = 'crew';
      hasCrew = true;
    }
  }

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
    hasShip,
    hasCaptain,
    hasCrew,
  };
}

/**
 * Lock in the current hand (stop rolling early)
 * Can only be done after first roll and only if you have full SCC (qualified)
 */
export function lockInSCCHand(hand: SCCHand): SCCHand {
  if (hand.rollsRemaining === 3) {
    // Must roll at least once
    return hand;
  }

  // Can only lock in if qualified (have 6-5-4)
  if (!hand.hasShip || !hand.hasCaptain || !hand.hasCrew) {
    // Not qualified - can't lock in, must keep rolling
    return hand;
  }

  const newDice = hand.dice.map(die => ({
    ...die,
    isHeld: true,
  }));

  return {
    ...hand,
    dice: newDice,
    rollsRemaining: 0,
    isComplete: true,
  };
}

/**
 * Evaluate a completed SCC hand
 */
export function evaluateSCCHand(hand: SCCHand): SCCHandResult {
  // Check if qualified (has 6-5-4)
  if (!hand.hasShip || !hand.hasCaptain || !hand.hasCrew) {
    console.log('[SCC] Hand not qualified - missing Ship/Captain/Crew');
    return {
      rank: 0,
      description: "NQ",
      isQualified: false,
      cargoSum: 0,
    };
  }

  // Find the two cargo dice (non-SCC dice)
  const cargoDice = hand.dice.filter(d => !d.isSCC);
  const cargoSum = cargoDice.reduce((sum, d) => sum + d.value, 0);

  console.log(`[SCC] Qualified with cargo sum: ${cargoSum}`);

  return {
    rank: cargoSum, // 2-12, higher is better
    description: `${cargoSum}`,
    isQualified: true,
    cargoSum,
  };
}

/**
 * Compare two SCC hands
 * Returns: 1 if hand1 wins, -1 if hand2 wins, 0 if tie
 * NQ hands always lose to qualified hands
 */
export function compareSCCHands(hand1: SCCHandResult, hand2: SCCHandResult): number {
  // NQ always loses to qualified
  if (!hand1.isQualified && !hand2.isQualified) return 0; // Both NQ = tie
  if (!hand1.isQualified) return -1; // hand1 NQ, hand2 qualified
  if (!hand2.isQualified) return 1;  // hand1 qualified, hand2 NQ

  // Both qualified - compare cargo sums
  if (hand1.cargoSum > hand2.cargoSum) return 1;
  if (hand1.cargoSum < hand2.cargoSum) return -1;
  return 0; // Tie
}

/**
 * Determine winners from multiple hands
 * Returns array of winning player indices (multiple if tie)
 */
export function determineSCCWinners(hands: SCCHandResult[]): number[] {
  if (hands.length === 0) return [];

  // First, check if anyone is qualified
  const qualifiedHands = hands.map((h, i) => ({ ...h, index: i })).filter(h => h.isQualified);

  if (qualifiedHands.length === 0) {
    // Everyone NQ - everyone ties (re-ante)
    return hands.map((_, i) => i);
  }

  // Find max cargo sum among qualified
  const maxCargo = Math.max(...qualifiedHands.map(h => h.cargoSum));
  
  // Return all players with max cargo
  return qualifiedHands
    .filter(h => h.cargoSum === maxCargo)
    .map(h => h.index);
}

/**
 * Get the ordered display of dice: SCC dice first (gold), then cargo dice
 * Returns dice in display order with their original indices
 */
export function getSCCDisplayOrder(hand: SCCHand): { die: SCCDie; originalIndex: number }[] {
  const result: { die: SCCDie; originalIndex: number }[] = [];
  
  // First add SCC dice in order: Ship, Captain, Crew
  const shipDie = hand.dice.findIndex(d => d.sccType === 'ship');
  const captainDie = hand.dice.findIndex(d => d.sccType === 'captain');
  const crewDie = hand.dice.findIndex(d => d.sccType === 'crew');
  
  if (shipDie !== -1) {
    result.push({ die: hand.dice[shipDie], originalIndex: shipDie });
  }
  if (captainDie !== -1) {
    result.push({ die: hand.dice[captainDie], originalIndex: captainDie });
  }
  if (crewDie !== -1) {
    result.push({ die: hand.dice[crewDie], originalIndex: crewDie });
  }
  
  // Then add cargo dice (non-SCC)
  hand.dice.forEach((die, idx) => {
    if (!die.isSCC) {
      result.push({ die, originalIndex: idx });
    }
  });
  
  return result;
}

/**
 * Check if player is qualified (has Ship, Captain, Crew)
 */
export function isQualified(hand: SCCHand): boolean {
  return hand.hasShip && hand.hasCaptain && hand.hasCrew;
}

/**
 * Format hand for display
 */
export function formatSCCDisplay(hand: SCCHand): string {
  const displayOrder = getSCCDisplayOrder(hand);
  return displayOrder.map(d => d.die.value || '?').join(' ');
}

/**
 * Check if all dice have been rolled at least once
 */
export function hasRolledOnce(hand: SCCHand): boolean {
  return hand.rollsRemaining < 3;
}
