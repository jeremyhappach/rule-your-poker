import { describe, expect, it } from 'vitest';
import {
  deriveThreeFiveSevenAllFoldPresentation,
  parseThreeFiveSevenAllFoldDecisionResult,
  selectThreeFiveSevenAllFoldPresentation,
} from './allFoldPresentation';

const exact = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-3',
  handNumber: 1,
  roundNumber: 3,
  transferCursor: 4,
};

describe('3-5-7 all-fold presentation identity', () => {
  it('consumes the initiating client RPC result without a Realtime echo', () => {
    expect(parseThreeFiveSevenAllFoldDecisionResult('game-1', {
      outcome: 'decision_committed',
      resolution: {
        outcome: 'all_fold',
        presentation_kind: 'pussy_tax',
        presentation_transfer_cursor: 4,
        dealer_game_id: 'dealer-1',
        round_id: 'round-3',
        hand_number: 1,
        round_number: 3,
      },
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-1',
        total_hands: 1,
        current_round: 3,
        awaiting_next_round: true,
        last_round_result: 'All players folded',
      },
      round: {
        id: 'round-3',
        dealer_game_id: 'dealer-1',
        hand_number: 1,
        round_number: 3,
        status: 'completed',
      },
    })).toEqual(exact);
  });

  it('rejects a direct result without matching committed game and round state', () => {
    expect(parseThreeFiveSevenAllFoldDecisionResult('game-1', {
      resolution: {
        outcome: 'all_fold',
        presentation_kind: 'pussy_tax',
        presentation_transfer_cursor: 4,
        dealer_game_id: 'dealer-1',
        round_id: 'round-3',
        hand_number: 1,
        round_number: 3,
      },
      game: { id: 'game-1', awaiting_next_round: false },
      round: { id: 'round-3', status: 'completed' },
    })).toBeNull();
  });

  it('derives the peer presentation only from an exact completed all-fold round', () => {
    expect(deriveThreeFiveSevenAllFoldPresentation({
      gameId: 'game-1',
      gameType: '3-5-7',
      dealerGameId: 'dealer-1',
      roundId: 'round-3',
      handNumber: 1,
      roundNumber: 3,
      roundStatus: 'completed',
      awaitingNextRound: true,
      lastRoundResult: 'All players folded',
      pussyTaxEnabled: true,
      pussyTaxValue: 1,
      transferCursor: 4,
    })).toEqual(exact);
  });

  it('does not let a late direct replay cross into a newer round', () => {
    const newer = { ...exact, roundId: 'round-4', roundNumber: 1 };
    expect(selectThreeFiveSevenAllFoldPresentation(exact, newer)).toEqual(newer);
  });
});
