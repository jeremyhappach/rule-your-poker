import { describe, expect, it } from 'vitest';
import {
  isThreeFiveSevenRolloverCursorReleased,
  parseThreeFiveSevenRolloverAdvanceResult,
  selectThreeFiveSevenRolloverPresentation,
  type ThreeFiveSevenRolloverPresentation,
} from './rolloverPresentation';

const exact: ThreeFiveSevenRolloverPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-game-2',
  roundId: 'round-h2-r1',
  handNumber: 2,
  roundNumber: 1,
  transferCursor: 14,
};

describe('3-5-7 rollover presentation identity', () => {
  it('consumes the exact committed H2/R1 RPC result', () => {
    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 1,
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-game-2',
        chip_transfer_cursor: 14,
      },
      round: {
        id: 'round-h2-r1',
        dealer_game_id: 'dealer-game-2',
        hand_number: 2,
        round_number: 1,
      },
    })).toEqual(exact);
  });

  it('rejects a mismatched or non-rollover RPC identity', () => {
    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 1,
      game: {
        id: 'other-game',
        current_game_uuid: 'dealer-game-2',
        chip_transfer_cursor: 14,
      },
      round: {
        id: 'round-h2-r1',
        dealer_game_id: 'dealer-game-2',
        hand_number: 2,
        round_number: 1,
      },
    })).toBeNull();

    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 2,
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-game-2',
        chip_transfer_cursor: 14,
      },
      round: {
        id: 'round-h2-r2',
        dealer_game_id: 'dealer-game-2',
        hand_number: 2,
        round_number: 2,
      },
    })).toBeNull();
  });

  it('prefers the direct result for the initiating client', () => {
    expect(selectThreeFiveSevenRolloverPresentation(exact, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      transferCursor: 99,
    })).toEqual(exact);
  });

  it('lets a peer select the exact committed cursor after refetch', () => {
    expect(selectThreeFiveSevenRolloverPresentation(null, {
      gameId: 'game-1',
      gameType: '357',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      transferCursor: 14,
    })).toEqual(exact);
  });

  it('does not allow a late direct result to cross a newer hand identity', () => {
    expect(selectThreeFiveSevenRolloverPresentation(exact, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h3-r1',
      handNumber: 3,
      roundNumber: 1,
      transferCursor: 20,
    })).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h3-r1',
      handNumber: 3,
      roundNumber: 1,
      transferCursor: 20,
    });
  });

  it('blocks H2/R1 until an exact positive cursor is available', () => {
    expect(selectThreeFiveSevenRolloverPresentation(null, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      transferCursor: null,
    })).toBeNull();
  });

  it.each(['unknown', 'queued', 'running', 'reconciling'] as const)(
    'keeps the deal blocked while cursor 14 is %s',
    (cursorState) => {
      expect(isThreeFiveSevenRolloverCursorReleased(exact, cursorState)).toBe(false);
    },
  );

  it.each(['settled', 'reconciled'] as const)(
    'releases the deal when cursor 14 is durably %s',
    (cursorState) => {
      expect(isThreeFiveSevenRolloverCursorReleased(exact, cursorState)).toBe(true);
    },
  );
});
