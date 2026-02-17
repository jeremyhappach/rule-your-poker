/**
 * Gin Rummy Bot Decision Logic
 * 
 * Handles all bot decisions:
 * 1. First draw: take or pass the upcard
 * 2. Draw phase: stock vs discard
 * 3. Discard phase: which card to discard
 * 4. Knock/Gin detection
 * 5. Laying off cards on opponent's melds
 */

import type { GinRummyCard, GinRummyState, Meld } from './ginRummyTypes';
import { findOptimalMelds, canLayOff, findLayOffOptions } from './ginRummyScoring';
import { KNOCK_DEADWOOD_LIMIT } from './ginRummyTypes';

// ─── Card Helpers ───────────────────────────────────────────────

const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

function cardDeadwoodValue(card: GinRummyCard): number {
  return card.value;
}

/** Check if a card has \"meld potential\" — how useful is it for building melds? */
function meldPotential(card: GinRummyCard, hand: GinRummyCard[]): number {
  let score = 0;

  // Count same-rank cards (set potential)
  const sameRank = hand.filter(c => c.rank === card.rank && c.suit !== card.suit);
  score += sameRank.length * 3; // Each pair/triplet is very valuable

  // Count adjacent same-suit cards (run potential)
  const cardOrder = RANK_ORDER[card.rank];
  const sameSuit = hand.filter(c => c.suit === card.suit && c.rank !== card.rank);
  
  for (const c of sameSuit) {
    const diff = Math.abs(RANK_ORDER[c.rank] - cardOrder);
    if (diff === 1) score += 3; // Adjacent = strong run potential
    else if (diff === 2) score += 1; // Gap of 1 = weak potential
  }

  return score;
}

/** Evaluate how good the hand is with a hypothetical card added */
function evaluateHandWith(hand: GinRummyCard[], addCard: GinRummyCard): number {
  const testHand = [...hand, addCard];
  const { deadwoodValue } = findOptimalMelds(testHand);
  // Lower deadwood = better; also consider meld potential
  return -deadwoodValue + meldPotential(addCard, hand) * 0.5;
}

// ─── First Draw Decision ────────────────────────────────────────

/**
 * Should the bot take the face-up card during the first draw?
 * Heuristic: take it if it significantly improves the hand (reduces deadwood by 3+ or completes a meld).
 */
export function shouldBotTakeFirstDraw(
  hand: GinRummyCard[],
  upCard: GinRummyCard
): boolean {
  const currentGrouping = findOptimalMelds(hand);
  
  // Try adding the upcard and removing each card to find best result
  let bestImprovement = 0;
  
  for (let i = 0; i < hand.length; i++) {
    const testHand = [...hand];
    testHand.splice(i, 1);
    testHand.push(upCard);
    const newGrouping = findOptimalMelds(testHand);
    const improvement = currentGrouping.deadwoodValue - newGrouping.deadwoodValue;
    bestImprovement = Math.max(bestImprovement, improvement);
  }

  // Take if it improves deadwood by 3+ points, or has high meld potential
  return bestImprovement >= 3 || meldPotential(upCard, hand) >= 6;
}

// ─── Draw Decision ──────────────────────────────────────────────

/**
 * Should the bot draw from discard or stock?
 * Returns 'discard' or 'stock'.
 */
export function botChooseDrawSource(
  hand: GinRummyCard[],
  topDiscard: GinRummyCard | null
): 'stock' | 'discard' {
  if (!topDiscard) return 'stock';

  const currentGrouping = findOptimalMelds(hand);
  
  // Evaluate hand improvement from taking the discard
  let bestImprovementFromDiscard = 0;
  for (let i = 0; i < hand.length; i++) {
    const testHand = [...hand];
    testHand.splice(i, 1);
    testHand.push(topDiscard);
    const newGrouping = findOptimalMelds(testHand);
    const improvement = currentGrouping.deadwoodValue - newGrouping.deadwoodValue;
    bestImprovementFromDiscard = Math.max(bestImprovementFromDiscard, improvement);
  }

  // Take discard if it provides meaningful improvement
  // Stock is a gamble but doesn't reveal info to opponent
  if (bestImprovementFromDiscard >= 2) return 'discard';
  if (meldPotential(topDiscard, hand) >= 5) return 'discard';
  
  return 'stock';
}

// ─── Discard Decision ───────────────────────────────────────────

/**
 * Choose which card index to discard from an 11-card hand.
 * Returns the index into the hand array.
 */
export function botChooseDiscard(
  hand: GinRummyCard[],
  drawnFromDiscard: GinRummyCard | null
): number {
  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    
    // Cannot discard the card just drawn from discard pile
    if (drawnFromDiscard && card.rank === drawnFromDiscard.rank && card.suit === drawnFromDiscard.suit) {
      continue;
    }

    const remaining = hand.filter((_, j) => j !== i);
    const grouping = findOptimalMelds(remaining);
    
    // Score: lower deadwood is better, penalize high-value discards less (they help us)
    // But also factor in meld potential of what we're keeping
    const score = -grouping.deadwoodValue;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// ─── Knock Decision ─────────────────────────────────────────────

/**
 * Should the bot knock (or gin) instead of just discarding?
 * Returns { shouldKnock: boolean, discardIndex: number }
 */
export function botShouldKnock(
  hand: GinRummyCard[],
  drawnFromDiscard: GinRummyCard | null
): { shouldKnock: boolean; discardIndex: number } {
  // Try each possible discard and check if we can knock
  let bestKnockIdx = -1;
  let bestDeadwood = Infinity;

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (drawnFromDiscard && card.rank === drawnFromDiscard.rank && card.suit === drawnFromDiscard.suit) {
      continue;
    }

    const remaining = hand.filter((_, j) => j !== i);
    const grouping = findOptimalMelds(remaining);
    
    if (grouping.deadwoodValue <= KNOCK_DEADWOOD_LIMIT && grouping.deadwoodValue < bestDeadwood) {
      bestDeadwood = grouping.deadwoodValue;
      bestKnockIdx = i;
    }
  }

  if (bestKnockIdx === -1) {
    return { shouldKnock: false, discardIndex: botChooseDiscard(hand, drawnFromDiscard) };
  }

  // Always knock with gin (deadwood = 0)
  if (bestDeadwood === 0) {
    return { shouldKnock: true, discardIndex: bestKnockIdx };
  }

  // Knock if deadwood is low enough (aggressive: ≤ 6, conservative: ≤ 3)
  // Use moderate threshold
  const shouldKnock = bestDeadwood <= 7;
  
  return {
    shouldKnock,
    discardIndex: shouldKnock ? bestKnockIdx : botChooseDiscard(hand, drawnFromDiscard),
  };
}

// ─── Lay Off Decision ───────────────────────────────────────────

/**
 * Find all cards the bot should lay off on the knocker's melds.
 * Returns array of { card, onMeldIndex } to lay off.
 * Bot lays off everything it can (greedy).
 */
export function botGetLayOffs(
  hand: GinRummyCard[],
  knockerMelds: Meld[]
): { card: GinRummyCard; onMeldIndex: number }[] {
  return findLayOffOptions(hand, knockerMelds);
}
