import { describe, expect, it } from 'vitest';
import { applyThreeFiveSevenDecisionReceipt } from './decisionReceipt';

const game = {
  id: 'game-1',
  status: 'in_progress',
  current_game_uuid: 'dealer-1',
  current_round: 3,
  last_round_result: null,
  rounds: [{ id: 'round-3', status: 'betting', round_number: 3 }],
};

describe('3-5-7 decision authority receipt', () => {
  it('publishes the committed terminal result without waiting for Realtime or a full fetch', () => {
    const next = applyThreeFiveSevenDecisionReceipt(game, 'game-1', {
      outcome: 'decision_committed',
      game: {
        id: 'game-1',
        current_game_uuid: 'dealer-1',
        current_round: 3,
        total_hands: 2,
        awaiting_next_round: false,
        last_round_result: '🏆 Winner won the game with 3 legs!',
      },
      round: {
        id: 'round-3',
        dealer_game_id: 'dealer-1',
        hand_number: 2,
        round_number: 3,
        status: 'completed',
      },
    });

    expect(next?.last_round_result).toBe('🏆 Winner won the game with 3 legs!');
    expect(next?.rounds?.[0]).toMatchObject({ id: 'round-3', status: 'completed' });
  });

  it('rejects a malformed or cross-session receipt', () => {
    expect(applyThreeFiveSevenDecisionReceipt(game, 'game-1', null)).toBe(game);
    expect(applyThreeFiveSevenDecisionReceipt(game, 'game-1', {
      game: { id: 'game-2', last_round_result: 'wrong session' },
    })).toBe(game);
  });
});
