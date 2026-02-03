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
  buildScoresAfter,
  resetCribbageEventSequence,
} from './cribbageEventLog';
import { getHandScoringCombos } from './cribbageScoringDetails';

interface CribbageEventContext {
  roundId: string;
  dealerGameId: string | null;
  handNumber: number;
}

/**
 * Hook to fetch and provide cribbage event logging context
 */
export function useCribbageEventContext(roundId: string): CribbageEventContext | null {
  const [context, setContext] = useState<CribbageEventContext | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchContext = async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('dealer_game_id, hand_number')
        .eq('id', roundId)
        .single();

      if (error) {
        console.error('[CRIBBAGE_EVENT] Failed to fetch context:', error);
        return;
      }

      const ctx: CribbageEventContext = {
        roundId,
        dealerGameId: data?.dealer_game_id ?? null,
        handNumber: data?.hand_number ?? 1,
      };

      setContext(ctx);
      // Reset sequence counter for this round
      resetCribbageEventSequence(roundId);
    };

    fetchContext();
  }, [roundId]);

  return context;
}

/**
 * Describe pegging points for event subtype
 */
function describePeggingSubtype(
  points: number,
  newCount: number,
  oldPlayedCards: { playerId: string; card: CribbageCard }[],
  newCard: CribbageCard
): string | null {
  if (points === 0) return null;

  const parts: string[] = [];

  // Check for 15 or 31
  if (newCount === 15) parts.push('15');
  if (newCount === 31) parts.push('31');

  // Check for pairs
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
  if (!ctx) return;

  const oldScore = oldState.playerStates[playerId]?.pegScore ?? 0;
  const newScore = newState.playerStates[playerId]?.pegScore ?? 0;
  const points = newScore - oldScore;

  const cardsOnTable = newState.pegging.playedCards.map(pc => pc.card);
  const runningCount = newState.pegging.currentCount;

  const subtype = describePeggingSubtype(
    points,
    runningCount,
    oldState.pegging.playedCards,
    cardPlayed
  );

  logPeggingCardPlayed(
    ctx.roundId,
    ctx.dealerGameId,
    ctx.handNumber,
    playerId,
    cardPlayed,
    cardsOnTable,
    runningCount,
    points,
    subtype,
    buildScoresAfter(newState)
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
  if (!ctx) return;

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
        buildScoresAfter(newState)
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
  if (!ctx || !newState.cutCard) return;

  // Only log if there was a his_heels event
  if (newState.lastEvent?.type !== 'his_heels') return;

  logHisHeels(
    ctx.roundId,
    ctx.dealerGameId,
    ctx.handNumber,
    newState.dealerPlayerId,
    newState.cutCard,
    buildScoresAfter(newState)
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
  if (!ctx || !state.cutCard) return;

  // Process each player's hand
  for (const player of players) {
    if (player.id === state.dealerPlayerId) continue; // Dealer goes last

    const hand = state.pegging.playedCards
      .filter(pc => pc.playerId === player.id)
      .map(pc => pc.card);

    const combos = getHandScoringCombos(hand, state.cutCard, false);

    for (const combo of combos) {
      runningScores[player.id] = (runningScores[player.id] ?? 0) + combo.points;

      logHandScoringCombo(
        ctx.roundId,
        ctx.dealerGameId,
        ctx.handNumber,
        player.id,
        combo.type,
        combo.cards,
        combo.points,
        { ...runningScores }
      );
    }
  }

  // Dealer's hand
  const dealerHand = state.pegging.playedCards
    .filter(pc => pc.playerId === state.dealerPlayerId)
    .map(pc => pc.card);

  const dealerCombos = getHandScoringCombos(dealerHand, state.cutCard, false);

  for (const combo of dealerCombos) {
    runningScores[state.dealerPlayerId] = (runningScores[state.dealerPlayerId] ?? 0) + combo.points;

    logHandScoringCombo(
      ctx.roundId,
      ctx.dealerGameId,
      ctx.handNumber,
      state.dealerPlayerId,
      combo.type,
      combo.cards,
      combo.points,
      { ...runningScores }
    );
  }

  // Crib scoring (dealer only)
  const cribCombos = getHandScoringCombos(state.crib, state.cutCard, true);

  for (const combo of cribCombos) {
    runningScores[state.dealerPlayerId] = (runningScores[state.dealerPlayerId] ?? 0) + combo.points;

    logCribScoringCombo(
      ctx.roundId,
      ctx.dealerGameId,
      ctx.handNumber,
      state.dealerPlayerId,
      combo.type,
      combo.cards,
      combo.points,
      { ...runningScores }
    );
  }
}
