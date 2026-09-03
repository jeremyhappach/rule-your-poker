import { describe, expect, it } from 'vitest';
import {
  isThreeFiveSevenCurrentRoundHandReady,
  isThreeFiveSevenDecisionSurfaceEnvelopeOpen,
} from './decisionSurfaceEnvelope';

const playable = {
  canDecide: true,
  gameStatus: 'in_progress',
  hasAuthoritativeTimer: true,
  activeTab: 'cards',
  isWaitingPhase: false,
  sessionEndedPhase: false,
  isDealerConfigPhase: false,
  hasCurrentPlayer: true,
  autoFold: false,
};

describe('3-5-7 decision surface envelope', () => {
  it('opens only when the whole committed presentation envelope is playable', () => {
    expect(isThreeFiveSevenDecisionSurfaceEnvelopeOpen(playable)).toBe(true);
  });

  it.each([
    ['chat tab', { activeTab: 'chat' }],
    ['game over', { gameStatus: 'game_over' }],
    ['authoritative session ended before the presentation handoff', { gameStatus: 'session_ended' }],
    ['authoritative timer has not yet hydrated', { hasAuthoritativeTimer: false }],
    ['waiting', { isWaitingPhase: true }],
    ['session ended', { sessionEndedPhase: true }],
    ['dealer setup', { isDealerConfigPhase: true }],
    ['missing player', { hasCurrentPlayer: false }],
    ['auto-fold', { autoFold: true }],
  ])('stays closed for %s', (_label, patch) => {
    expect(isThreeFiveSevenDecisionSurfaceEnvelopeOpen({ ...playable, ...patch })).toBe(false);
  });

  it.each([
    [1, 3],
    [2, 5],
    [3, 7],
  ])('admits only the exact current-round hand for round %i', (roundNumber, cardCount) => {
    expect(isThreeFiveSevenCurrentRoundHandReady({
      roundNumber,
      rawCardCount: cardCount,
      presentedCardCount: cardCount,
    })).toBe(true);
  });

  it('rejects a cached Round 1 hand while Round 2 is awaiting its five-card frame', () => {
    expect(isThreeFiveSevenCurrentRoundHandReady({
      roundNumber: 2,
      rawCardCount: 0,
      presentedCardCount: 3,
    })).toBe(false);
  });

  it('rejects any raw/presented card-count disagreement', () => {
    expect(isThreeFiveSevenCurrentRoundHandReady({
      roundNumber: 3,
      rawCardCount: 7,
      presentedCardCount: 5,
    })).toBe(false);
  });
});
