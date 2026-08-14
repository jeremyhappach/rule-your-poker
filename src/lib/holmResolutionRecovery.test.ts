import { describe, expect, it } from 'vitest';

import {
  getHolmContinuationKey,
  getHolmContinuationSource,
  getHolmResolutionRecoveryKey,
} from './holmResolutionRecovery';

const eligible = {
  gameId: 'game-1',
  gameType: 'holm-game',
  gameStatus: 'in_progress',
  dealerGameId: 'dealer-game-1',
  roundId: 'round-1',
  roundStatus: 'betting',
  allDecisionsInForRound: true,
  participantPresent: true,
};

describe('getHolmResolutionRecoveryKey', () => {
  it('admits the all-decisions-in betting edge using full game identity', () => {
    expect(getHolmResolutionRecoveryKey(eligible)).toBe(
      'game-1:dealer-game-1:round-1',
    );
  });

  it.each([
    { gameType: '3-5-7-game' },
    { gameStatus: 'game_over' },
    { roundStatus: 'processing' },
    { allDecisionsInForRound: false },
    { participantPresent: false },
  ])('rejects non-recovery state %#', (override) => {
    expect(getHolmResolutionRecoveryKey({ ...eligible, ...override })).toBeNull();
  });
});

describe('getHolmContinuationKey', () => {
  const continuingResult = {
    gameId: 'game-1',
    gameType: 'holm-game',
    gameStatus: 'in_progress',
    gamePaused: false,
    dealerGameId: 'dealer-1',
    roundId: 'round-3',
    roundStatus: 'completed',
    handNumber: 3,
    awaitingNextRound: true,
    lastRoundResult: 'Player won showdown and continues vs Chucky.',
    participantPresent: true,
  };

  it('keys the exact committed predecessor for historical/reconnect continuation', () => {
    expect(getHolmContinuationKey(continuingResult)).toBe(
      'game-1:dealer-1:round-3:h3',
    );
  });

  it.each([
    'Player won showdown and continues vs Chucky.',
    'Players tied the showdown and continue vs Chucky.',
    'Chucky beat Player with One Pair. -$8',
    'Chucky tied the remaining players. Stakes continue.',
    'Everyone folded. Pussy Tax resolved; next hand prepared.',
  ])('admits every continuing result shape, including zero-transfer results: %s', (lastRoundResult) => {
    expect(getHolmContinuationKey({ ...continuingResult, lastRoundResult })).toBe(
      'game-1:dealer-1:round-3:h3',
    );
  });

  it.each([
    { awaitingNextRound: false },
    { roundStatus: 'betting' },
    { gamePaused: true },
    { participantPresent: false },
    { lastRoundResult: '' },
  ])('rejects a non-recovery continuation state %#', (override) => {
    expect(getHolmContinuationKey({ ...continuingResult, ...override })).toBeNull();
  });
});

describe('getHolmContinuationSource', () => {
  it('recovers a historical entry whose committed batch cannot replay', () => {
    expect(getHolmContinuationSource({
      observedLive: false,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: null,
    })).toBe('historical-entry');
  });

  it('recovers only the exact live round from an authoritative reconnect', () => {
    expect(getHolmContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: { dealerGameId: 'dealer-1', roundId: 'round-3' },
    })).toBe('realtime-reconnect');
    expect(getHolmContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-4',
      reconnectIdentity: { dealerGameId: 'dealer-1', roundId: 'round-3' },
    })).toBeNull();
  });

  it('leaves an uninterrupted live result owned by presentation completion', () => {
    expect(getHolmContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: null,
    })).toBeNull();
  });
});
