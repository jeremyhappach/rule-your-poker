import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { settleCribbageGame } from './cribbageSettleGame';

const identity = {
  gameId: '11111111-1111-4111-8111-111111111111',
  roundId: '22222222-2222-4222-8222-222222222222',
  dealerGameId: '33333333-3333-4333-8333-333333333333',
  handNumber: 7,
};

describe('settleCribbageGame', () => {
  beforeEach(() => rpc.mockReset());

  it('sends only immutable authoritative identity to the settlement RPC', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'settled',
        result_id: '44444444-4444-4444-8444-444444444444',
        hand_number: 7,
        winner_player_id: '55555555-5555-4555-8555-555555555555',
        amount_per_loser: 6,
        total_winner_gain: 12,
        terminal_disposition: 'session_ended',
      },
      error: null,
    });

    const result = await settleCribbageGame(identity);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('cribbage_settle_game', {
      p_game_id: identity.gameId,
      p_round_id: identity.roundId,
      p_dealer_game_id: identity.dealerGameId,
      p_hand_number: identity.handNumber,
    });
    expect(result).toEqual({
      status: 'settled',
      resultId: '44444444-4444-4444-8444-444444444444',
      handNumber: 7,
      terminalDisposition: 'session_ended',
      winnerPlayerId: '55555555-5555-4555-8555-555555555555',
      amountPerLoser: 6,
      totalWinnerGain: 12,
      legacyResult: false,
    });
  });

  it('accepts an idempotent replay response without inventing financial data', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'already_settled',
        result_id: '44444444-4444-4444-8444-444444444444',
        hand_number: 7,
        terminal_disposition: 'game_over',
      },
      error: null,
    });

    await expect(settleCribbageGame(identity)).resolves.toMatchObject({
      status: 'already_settled',
      terminalDisposition: 'game_over',
      amountPerLoser: null,
      totalWinnerGain: null,
    });
  });

  it('fails loudly when the database transaction fails', async () => {
    const error = { code: 'P0001', message: 'identity mismatch', details: '', hint: '' };
    rpc.mockResolvedValue({ data: null, error });

    await expect(settleCribbageGame(identity)).rejects.toBe(error);
  });

  it('rejects a malformed success payload', async () => {
    rpc.mockResolvedValue({ data: { status: 'settled' }, error: null });

    await expect(settleCribbageGame(identity)).rejects.toThrow(/invalid settlement result/);
  });
});
