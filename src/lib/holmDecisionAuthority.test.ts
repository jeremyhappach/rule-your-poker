import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { submitHolmDecision } from './holmDecisionAuthority';

const identity = {
  gameId: '11111111-1111-4111-8111-111111111111',
  roundId: '22222222-2222-4222-8222-222222222222',
  playerId: '33333333-3333-4333-8333-333333333333',
  decision: 'fold' as const,
};

describe('Holm exact decision authority client', () => {
  beforeEach(() => rpc.mockReset());

  it('makes the exact RPC its first and only authority request', async () => {
    rpc.mockResolvedValue({
      data: {
        round_id: identity.roundId,
        turn_sequence: 7,
        current_turn_position: 2,
        decision_deadline: '2026-09-01T16:00:00.000Z',
      },
      error: null,
    });

    await expect(submitHolmDecision(identity)).resolves.toMatchObject({
      round_id: identity.roundId,
      turn_sequence: 7,
      current_turn_position: 2,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('holm_submit_decision', {
      p_game_id: identity.gameId,
      p_round_id: identity.roundId,
      p_player_id: identity.playerId,
      p_decision: 'fold',
    });
  });

  it('surfaces an authoritative RPC rejection', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_current_turn' } });
    await expect(submitHolmDecision(identity)).rejects.toThrow(
      'Holm decision failed: not_current_turn',
    );
  });

  it('routes every live Holm decision owner around the legacy generic preflights', () => {
    const game = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');
    const bot = readFileSync(new URL('./botPlayer.ts', import.meta.url), 'utf8');
    const generic = readFileSync(new URL('./gameLogic.ts', import.meta.url), 'utf8');

    expect(game.match(/submitHolmDecision\(\{/g)).toHaveLength(2);
    expect(bot).toContain('await runHolmBotDecisionAfterDelay(');
    expect(bot).toContain('submitHolmDecision({');
    expect(generic).toContain('return submitHolmDecision({');
  });
});
