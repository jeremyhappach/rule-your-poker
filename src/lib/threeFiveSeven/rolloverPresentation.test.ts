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
  openingTransferRequired: true,
  transferCursor: 14,
};

describe('3-5-7 rollover presentation identity', () => {
  it('consumes the exact committed H1/R1 bootstrap result', () => {
    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 1,
      round_number: 1,
      opening_transfer_required: true,
      opening_transfer_cursor: 7,
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-game-1',
        chip_transfer_cursor: 99,
      },
      round: {
        id: 'round-h1-r1',
        dealer_game_id: 'dealer-game-1',
        hand_number: 1,
        round_number: 1,
        three_five_seven_opening_transfer_cursor: 7,
      },
    })).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-h1-r1',
      handNumber: 1,
      roundNumber: 1,
      openingTransferRequired: true,
      transferCursor: 7,
    });
  });

  it('consumes the exact committed H2/R1 RPC result', () => {
    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 1,
      opening_transfer_required: true,
      opening_transfer_cursor: 14,
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
        three_five_seven_opening_transfer_cursor: 14,
      },
    })).toEqual(exact);
  });

  it('rejects a mismatched or non-rollover RPC identity', () => {
    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 1,
      opening_transfer_required: true,
      opening_transfer_cursor: 14,
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
        three_five_seven_opening_transfer_cursor: 14,
      },
    })).toBeNull();

    expect(parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 2,
      round_number: 2,
      opening_transfer_required: true,
      opening_transfer_cursor: 14,
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
        three_five_seven_opening_transfer_cursor: 14,
      },
    })).toBeNull();
  });

  it('prefers the exact direct result for the initiating client', () => {
    expect(selectThreeFiveSevenRolloverPresentation(exact, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      openingTransferRequired: true,
      openingTransferCursor: 14,
    })).toEqual(exact);
  });

  it('rejects a stale direct cursor for the same round and uses the exact round claim', () => {
    expect(selectThreeFiveSevenRolloverPresentation({
      ...exact,
      transferCursor: 13,
    }, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      openingTransferRequired: true,
      openingTransferCursor: 14,
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
      openingTransferRequired: true,
      openingTransferCursor: 14,
    })).toEqual(exact);
  });

  it('lets a peer select the committed H1 cursor after refetch', () => {
    expect(selectThreeFiveSevenRolloverPresentation(null, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-h1-r1',
      handNumber: 1,
      roundNumber: 1,
      openingTransferRequired: true,
      openingTransferCursor: 7,
    })).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-h1-r1',
      handNumber: 1,
      roundNumber: 1,
      openingTransferRequired: true,
      transferCursor: 7,
    });
  });

  it('does not allow a late direct result to cross a newer hand identity', () => {
    expect(selectThreeFiveSevenRolloverPresentation(exact, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h3-r1',
      handNumber: 3,
      roundNumber: 1,
      openingTransferRequired: true,
      openingTransferCursor: 20,
    })).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h3-r1',
      handNumber: 3,
      roundNumber: 1,
      openingTransferRequired: true,
      transferCursor: 20,
    });
  });

  it('blocks a charged H2/R1 until an exact positive cursor is available', () => {
    expect(selectThreeFiveSevenRolloverPresentation(null, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h2-r1',
      handNumber: 2,
      roundNumber: 1,
      openingTransferRequired: true,
      openingTransferCursor: null,
    })).toBeNull();
  });

  it('admits a zero-charge opening immediately without a transfer batch', () => {
    const zeroCharge = parseThreeFiveSevenRolloverAdvanceResult('game-1', {
      hand_number: 1,
      round_number: 1,
      opening_transfer_required: false,
      opening_transfer_cursor: null,
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-game-1',
        chip_transfer_cursor: 22,
      },
      round: {
        id: 'round-zero-r1',
        dealer_game_id: 'dealer-game-1',
        hand_number: 1,
        round_number: 1,
        three_five_seven_opening_transfer_cursor: null,
      },
    });
    expect(zeroCharge).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-zero-r1',
      handNumber: 1,
      roundNumber: 1,
      openingTransferRequired: false,
      transferCursor: null,
    });
    expect(selectThreeFiveSevenRolloverPresentation(null, {
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-zero-r1',
      handNumber: 1,
      roundNumber: 1,
      openingTransferRequired: false,
      openingTransferCursor: null,
    })).toEqual(zeroCharge);
    expect(isThreeFiveSevenRolloverCursorReleased(zeroCharge, 'unknown')).toBe(true);
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
