/**
 * Compatibility adapters for existing presentation callbacks. Canonical
 * history is captured by the database; clients no longer write event rows.
 */

import type { CribbageCard, CribbageState } from './cribbageTypes';

export type CribbageEventType = 
  | 'pegging'
  | 'hand_scoring'
  | 'crib_scoring'
  | 'crib_reveal'
  | 'his_heels'
  | 'go'
  | 'cut_card';

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
  /**
   * Deterministic per-event ordering number.
   * IMPORTANT: This is part of the DB dedupe key.
   */
  sequenceNumber?: number;
}

export function resetCribbageEventSequence(_roundId: string): void {}

/**
 * Retained while presentation callbacks migrate; intentionally has no writes.
 */
export function logCribbageEvent(_params: LogCribbageEventParams): void {
  // Compatibility only: history is written by the authoritative database transaction.
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
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
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
    sequenceNumber,
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
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
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
    sequenceNumber,
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
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
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
    sequenceNumber,
  });
}

/**
 * Log cut card reveal event
 */
export function logCutCardReveal(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string,
  cutCard: CribbageCard,
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'cut_card',
    eventSubtype: null,
    cardPlayed: cutCard,
    cardsInvolved: [cutCard],
    cardsOnTable: null,
    runningCount: null,
    points: 0,
    scoresAfter,
    sequenceNumber,
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
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
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
    sequenceNumber,
  });
}

/**
 * Log crib reveal - all 4 crib cards before scoring starts.
 * This provides the full crib hand for history display.
 */
export function logCribReveal(
  roundId: string,
  dealerGameId: string | null,
  handNumber: number,
  playerId: string, // Always the dealer
  cribCards: CribbageCard[],
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
): void {
  logCribbageEvent({
    roundId,
    dealerGameId,
    handNumber,
    playerId,
    eventType: 'crib_reveal',
    eventSubtype: null,
    cardPlayed: null,
    cardsInvolved: cribCards,
    cardsOnTable: null,
    runningCount: null,
    points: 0,
    scoresAfter,
    sequenceNumber,
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
  scoresAfter: Record<string, number>,
  sequenceNumber?: number
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
    sequenceNumber,
  });
}
