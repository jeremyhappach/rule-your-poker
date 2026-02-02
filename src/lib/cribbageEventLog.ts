/**
 * Cribbage event logging - fire-and-forget inserts for hand history.
 * 
 * Retention policy: Real-money games are kept forever; fake-money games
 * are eligible for purge after 30 days (same as player_cards).
 */

import { supabase } from '@/integrations/supabase/client';
import type { CribbageCard, CribbageState } from './cribbageTypes';

export type CribbageEventType = 
  | 'pegging'
  | 'hand_scoring'
  | 'crib_scoring'
  | 'his_heels'
  | 'go';

export interface LogCribbageEventParams {
  roundId: string;
  dealerGameId: string | null;
  handNumber: number;
  playerId: string;
  eventType: CribbageEventType;
  eventSubtype?: string | null; // e.g., '15', 'pair', 'run_3', 'flush', 'nobs'
  cardPlayed?: CribbageCard | null;
  cardsInvolved: CribbageCard[];
  cardsOnTable?: CribbageCard[] | null;
  runningCount?: number | null;
  points: number;
  scoresAfter: Record<string, number>;
}

// Track sequence number per round for ordering events
const sequenceCounters: Map<string, number> = new Map();

function getNextSequence(roundId: string): number {
  const current = sequenceCounters.get(roundId) ?? 0;
  const next = current + 1;
  sequenceCounters.set(roundId, next);
  return next;
}

/**
 * Reset sequence counter for a new round
 */
export function resetCribbageEventSequence(roundId: string): void {
  sequenceCounters.set(roundId, 0);
}

/**
 * Fire-and-forget insert of a cribbage event.
 * Does NOT await - returns immediately.
 */
export function logCribbageEvent(params: LogCribbageEventParams): void {
  const sequenceNumber = getNextSequence(params.roundId);

  // Fire and forget - don't await
  supabase
    .from('cribbage_events')
    .insert({
      round_id: params.roundId,
      dealer_game_id: params.dealerGameId,
      hand_number: params.handNumber,
      player_id: params.playerId,
      event_type: params.eventType,
      event_subtype: params.eventSubtype ?? null,
      card_played: params.cardPlayed as any,
      cards_involved: params.cardsInvolved as any,
      cards_on_table: params.cardsOnTable as any ?? null,
      running_count: params.runningCount ?? null,
      points: params.points,
      scores_after: params.scoresAfter as any,
      sequence_number: sequenceNumber,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[CRIBBAGE_EVENT] Failed to log event:', error.message, params.eventType);
      }
    });
}

/**
 * Helper: Build scores_after object from current state
 */
export function buildScoresAfter(state: CribbageState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const [playerId, ps] of Object.entries(state.playerStates)) {
    scores[playerId] = ps.pegScore;
  }
  return scores;
}

/**
 * Log a pegging card play event
 */
export function logPeggingCardPlayed(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string,
  cardPlayed: CribbageCard,
  cardsOnTableAfter: CribbageCard[],
  runningCount: number,
  points: number,
  eventSubtype: string | null,
  scoresAfter: Record<string, number>
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'pegging',
    eventSubtype,
    cardPlayed,
    cardsInvolved: points > 0 ? cardsOnTableAfter : [cardPlayed],
    cardsOnTable: cardsOnTableAfter,
    runningCount,
    points,
    scoresAfter,
  });
}

/**
 * Log a "Go" point event
 */
export function logGoPoint(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string,
  runningCount: number,
  scoresAfter: Record<string, number>
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'go',
    eventSubtype: null,
    cardPlayed: null,
    cardsInvolved: [],
    cardsOnTable: null,
    runningCount,
    points: 1,
    scoresAfter,
  });
}

/**
 * Log "His Heels" (cut card is a Jack)
 */
export function logHisHeels(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string,
  cutCard: CribbageCard,
  scoresAfter: Record<string, number>
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'his_heels',
    eventSubtype: null,
    cardPlayed: null,
    cardsInvolved: [cutCard],
    cardsOnTable: null,
    runningCount: null,
    points: 2,
    scoresAfter,
  });
}

/**
 * Log a hand scoring combo (during counting phase)
 */
export function logHandScoringCombo(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string,
  comboType: string, // e.g., '15', 'pair', 'run_4', 'flush', 'nobs'
  cardsInvolved: CribbageCard[],
  points: number,
  scoresAfter: Record<string, number>
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'hand_scoring',
    eventSubtype: comboType,
    cardPlayed: null,
    cardsInvolved,
    cardsOnTable: null,
    runningCount: null,
    points,
    scoresAfter,
  });
}

/**
 * Log a crib scoring combo
 */
export function logCribScoringCombo(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string, // Always the dealer
  comboType: string,
  cardsInvolved: CribbageCard[],
  points: number,
  scoresAfter: Record<string, number>
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'crib_scoring',
    eventSubtype: comboType,
    cardPlayed: null,
    cardsInvolved,
    cardsOnTable: null,
    runningCount: null,
    points,
    scoresAfter,
  });
}
