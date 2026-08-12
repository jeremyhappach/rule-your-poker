import { describe, expect, it } from 'vitest';

import {
  getHolmChuckyLossContinuationKey,
  getHolmChuckyLossContinuationSource,
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

describe('getHolmChuckyLossContinuationKey', () => {
  const chuckyLoss = {
    gameId: 'game-1',
    gameType: 'holm-game',
    gameStatus: 'in_progress',
    dealerGameId: 'dealer-1',
    roundId: 'round-3',
    roundStatus: 'completed',
    handNumber: 3,
    transferCursor: 5,
    awaitingNextRound: true,
    lastRoundResult: 'Chucky beat Player with One Pair. -$8',
    participantPresent: true,
  };

  it('keys an exact committed loss for historical/reconnect continuation', () => {
    expect(getHolmChuckyLossContinuationKey(chuckyLoss)).toBe(
      'game-1:dealer-1:round-3:h3:c5',
    );
  });

  it.each([
    { awaitingNextRound: false },
    { roundStatus: 'betting' },
    { transferCursor: null },
    { participantPresent: false },
    { lastRoundResult: 'Player beat Chucky with Two Pair! Won $8' },
  ])('rejects a non-recovery continuation state %#', (override) => {
    expect(getHolmChuckyLossContinuationKey({ ...chuckyLoss, ...override })).toBeNull();
  });
});

describe('getHolmChuckyLossContinuationSource', () => {
  it('recovers a historical entry whose committed batch cannot replay', () => {
    expect(getHolmChuckyLossContinuationSource({
      observedLive: false,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: null,
    })).toBe('historical-entry');
  });

  it('recovers only the exact live round from an authoritative reconnect', () => {
    expect(getHolmChuckyLossContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: { dealerGameId: 'dealer-1', roundId: 'round-3' },
    })).toBe('realtime-reconnect');
    expect(getHolmChuckyLossContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-4',
      reconnectIdentity: { dealerGameId: 'dealer-1', roundId: 'round-3' },
    })).toBeNull();
  });

  it('leaves an uninterrupted live loss owned by presentation completion', () => {
    expect(getHolmChuckyLossContinuationSource({
      observedLive: true,
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      reconnectIdentity: null,
    })).toBeNull();
  });
});
