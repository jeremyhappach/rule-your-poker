/**
 * Cribbage event logging hook - provides context for fire-and-forget event logging.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CribbageState, CribbageCard } from './cribbageTypes';
import {
  logPeggingCardPlayed,
  logGoPoint,
  logHisHeels,
  logHandScoringCombo,
  logCribScoringCombo,
  logCutCardReveal,
  buildScoresAfter,
  resetCribbageEventSequence,
} from './cribbageEventLog';
import { getHandScoringCombos } from './cribbageScoringDetails';
import { getCardPointValue } from './cribbageScoring';
import {
  seqCribScoring,
  seqCutCard,
  seqGoAfterPlay,
  seqHandScoring,
  seqHisHeels,
  seqPeggingPlay,
} from './cribbageEventSequence';

export interface CribbageEventContext {
  roundId: string;
  dealerGameId: string | null;
  handNumber: number;
}

/**
 * Synchronously derive cribbage event context from props.
 * 
 * CRITICAL FIX: The previous async implementation caused a race condition where
 * events fired before the DB fetch completed were permanently lost. This version
 * derives context synchronously from props that are already available.
 * 
 * @param roundId - The current round ID
 * @param dealerGameId - The dealer game ID (passed as prop from Game.tsx)
 * @param handNumber - The hand number from cribbage state
 */
export function useCribbageEventContext(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number | undefined
): CribbageEventContext | null {
  const lastRoundIdRef = useRef<string | null>(null);

  // Reset sequence counter when round changes
  useEffect(() => {
    if (!roundId) {
      lastRoundIdRef.current = null;
      return;
    }

    if (lastRoundIdRef.current !== roundId) {
      lastRoundIdRef.current = roundId;
      resetCribbageEventSequence(roundId);
    }
  }, [roundId]);

  // Return null if we don't have minimum required data
  if (!roundId || handNumber === undefined) {
    // Only log once per unique combination to avoid spam
    console.warn('[CRIBBAGE_EVENT_CTX] Context unavailable:', { roundId: roundId || '(empty)', dealerGameId, handNumber });
    return null;
  }

  // Synchronously return context - no async fetch needed!
  return {
    roundId,
    dealerGameId,
    handNumber,
  };
}

/**
 * Describe pegging points for event subtype
 */
function describePeggingSubtype(
  points: number,
  newCount: number,
  oldPlayedCards: { playerId: string; card: CribbageCard }[],
  newCard: CribbageCard,
  isLastCardOfHand: boolean
): string | null {
  if (points === 0) return null;

  const parts: string[] = [];

  // Check for pairs first (before 15/31 so order is logical: "3 of a kind + 31")
  let pairCount = 1;
  for (let i = oldPlayedCards.length - 1; i >= 0; i--) {
    if (oldPlayedCards[i].card.rank === newCard.rank) {
      pairCount++;
    } else {
      break;
    }
  }
  if (pairCount === 2) parts.push('pair');
  else if (pairCount === 3) parts.push('three_of_a_kind');
  else if (pairCount === 4) parts.push('four_of_a_kind');

  // Check for 15 or 31
  if (newCount === 15) parts.push('15');
  if (newCount === 31) parts.push('31');

  // Check for runs - need to detect actual run length, not points
  if (oldPlayedCards.length >= 2) {
    // Calculate remaining points after 15/31 and pairs
    const totalPoints = points - (newCount === 15 ? 2 : 0) - (newCount === 31 ? 2 : 0);
    const pairPts = pairCount >= 2 ? (pairCount * (pairCount - 1) / 2) * 2 : 0;
    const runPts = totalPoints - pairPts;
    
    // In cribbage, runs score 1 point per card, so run points = run length
    // A run of 3 = 3 points, run of 4 = 4 points, etc.
    if (runPts >= 3) {
      parts.push(`run of ${runPts}`);
    }
  }

  // Check for "last" - player gets 1 point for playing the last card (not already at 31)
  if (isLastCardOfHand && newCount !== 31) {
    parts.push('last');
  }

  return parts.length > 0 ? parts.join('+') : null;
}
/**
 * Log pegging card play event after state mutation.
 * All clients can safely call this - atomic DB guard prevents duplicates.
 */
export function logPeggingPlay(
  ctx: CribbageEventContext | null,
  oldState: CribbageState,
  newState: CribbageState,
  playerId: string,
  cardPlayed: CribbageCard
): void {
  if (!ctx) {
    console.warn('[CRIBBAGE_EVENT] logPeggingPlay called with null context - event will not be logged');
    return;
  }
  if (!ctx) return;

  const oldScore = oldState.playerStates[playerId]?.pegScore ?? 0;
  const newScore = newState.playerStates[playerId]?.pegScore ?? 0;
  const points = newScore - oldScore;

  const cardsOnTable = newState.pegging.playedCards.map(pc => pc.card);
  
  // Calculate the actual running count at the moment of play (before any reset)
  // This is critical because hitting 31 triggers beginNewPeggingRun which resets count to 0
  const cardValue = getCardPointValue(cardPlayed);
  const actualRunningCount = oldState.pegging.currentCount + cardValue;

  // Only use cards from the current sequence for subtype description
  const currentSequenceCards = oldState.pegging.playedCards.slice(oldState.pegging.sequenceStartIndex);
  
  // Check if this is the last card of the entire hand (all players out of cards after this play)
  const playerHand = newState.playerStates[playerId]?.hand ?? [];
  const isLastCardOfHand = Object.values(newState.playerStates).every(
    ps => ps.hand.length === 0
  );
  
  const subtype = describePeggingSubtype(
    points,
    actualRunningCount,
    currentSequenceCards,
    cardPlayed,
    isLastCardOfHand
  );

  // Deterministic per-play sequence number so multiple clients dedupe correctly.
  const playIndex = newState.pegging.playedCards.length; // 1-based after play
  const sequenceNumber = seqPeggingPlay(playIndex);

  logPeggingCardPlayed(
    ctx.roundId,
    ctx.dealerGameId,
    ctx.handNumber,
    playerId,
    cardPlayed,
    cardsOnTable,
    actualRunningCount, // Use actual count, not post-reset count
    points,
    subtype,
    buildScoresAfter(newState),
    sequenceNumber
  );
}

/**
 * Log "Go" point event after state mutation.
 * All clients can safely call this - atomic DB guard prevents duplicates.
 */
export function logGoPointEvent(
  ctx: CribbageEventContext | null,
  oldState: CribbageState,
  newState: CribbageState
): void {
  if (!ctx) {
    console.warn('[CRIBBAGE_EVENT] logGoPointEvent called with null context - event will not be logged');
    return;
  }

  const playIndex = newState.pegging.playedCards.length;
  const sequenceNumber = seqGoAfterPlay(playIndex);

  // Find who got the go point by comparing scores
  for (const [playerId, ps] of Object.entries(newState.playerStates)) {
    const oldScore = oldState.playerStates[playerId]?.pegScore ?? 0;
    if (ps.pegScore > oldScore) {
      logGoPoint(
        ctx.roundId,
        ctx.dealerGameId,
        ctx.handNumber,
        playerId,
        oldState.pegging.currentCount,
        buildScoresAfter(newState),
        sequenceNumber
      );
      break;
    }
  }
}

/**
 * Log "His Heels" event when cut card is a Jack.
 * All clients can safely call this - atomic DB guard prevents duplicates.
 */
export function logHisHeelsEvent(
  ctx: CribbageEventContext | null,
  newState: CribbageState
): void {
  if (!ctx) {
    console.warn('[CRIBBAGE_EVENT] logHisHeelsEvent called with null context - event will not be logged');
    return;
  }
  if (!newState.cutCard) return;

  // Only log if there was a his_heels event
  if (newState.lastEvent?.type !== 'his_heels') return;

  logHisHeels(
    ctx.roundId,
    ctx.dealerGameId,
    ctx.handNumber,
    newState.dealerPlayerId,
    newState.cutCard,
    buildScoresAfter(newState),
    seqHisHeels()
  );
}

/**
 * Log cut card reveal event when entering pegging phase.
 * All clients can safely call this - atomic DB guard prevents duplicates.
 */
export function logCutCardEvent(
  ctx: CribbageEventContext | null,
  state: CribbageState
): void {
  if (!ctx) {
    console.warn('[CRIBBAGE_EVENT] logCutCardEvent called with null context - event will not be logged');
    return;
  }
  if (!ctx || !state.cutCard) return;

  logCutCardReveal(
    ctx.roundId,
    ctx.dealerGameId,
    ctx.handNumber,
    // DB requires a valid player_id; attribute the reveal to the dealer.
    state.dealerPlayerId,
    state.cutCard,
    buildScoresAfter(state),
    seqCutCard()
  );
}

/**
 * Log all hand and crib scoring events during counting phase.
 * Call this when transitioning to counting phase.
 * All clients can safely call this - atomic DB guard prevents duplicates.
 */
export function logCountingScoringEvents(
  ctx: CribbageEventContext | null,
  state: CribbageState,
  players: { id: string }[],
  runningScores: Record<string, number>
): void {
  if (!ctx) {
    console.warn('[CRIBBAGE_EVENT] logCountingScoringEvents called with null context - event will not be logged');
    return;
  }
  if (!ctx || !state.cutCard) return;

  // Deterministic scoring order:
  // - Everyone except dealer
  // - Dealer
  const scoringOrder = state.turnOrder
    .filter((id) => id !== state.dealerPlayerId)
    .concat(state.dealerPlayerId);

  // Process each player's hand
  for (let playerOrderIndex = 0; playerOrderIndex < scoringOrder.length; playerOrderIndex++) {
    const playerId = scoringOrder[playerOrderIndex];
    if (!playerId) continue;

    const hand = state.pegging.playedCards
      .filter(pc => pc.playerId === playerId)
      .map(pc => pc.card);

    const combos = getHandScoringCombos(hand, state.cutCard, false);

    for (let comboIndex = 0; comboIndex < combos.length; comboIndex++) {
      const combo = combos[comboIndex];
      runningScores[playerId] = (runningScores[playerId] ?? 0) + combo.points;

      logHandScoringCombo(
        ctx.roundId,
        ctx.dealerGameId,
        ctx.handNumber,
        playerId,
        combo.type,
        combo.cards,
        combo.points,
        { ...runningScores },
        seqHandScoring(playerOrderIndex, comboIndex)
      );
    }
  }

  // Crib scoring (dealer only)
  const cribCombos = getHandScoringCombos(state.crib, state.cutCard, true);

  for (let comboIndex = 0; comboIndex < cribCombos.length; comboIndex++) {
    const combo = cribCombos[comboIndex];
    runningScores[state.dealerPlayerId] = (runningScores[state.dealerPlayerId] ?? 0) + combo.points;

    logCribScoringCombo(
      ctx.roundId,
      ctx.dealerGameId,
      ctx.handNumber,
      state.dealerPlayerId,
      combo.type,
      combo.cards,
      combo.points,
      { ...runningScores },
      seqCribScoring(comboIndex)
    );
  }
}
