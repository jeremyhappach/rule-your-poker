import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { advanceHolmPostgame } from './holmPostgameAuthority';

describe('Holm postgame authority client', () => {
  beforeEach(() => rpc.mockReset());

  it('submits the exact terminal identity and parses a replay receipt', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'already_advanced',
        status: 'game_selection',
        dealer_position: 4,
        config_deadline: '2026-08-23T17:30:00.000Z',
      },
      error: null,
    });

    await expect(advanceHolmPostgame({
      gameId: '11111111-1111-4111-8111-111111111111',
      roundId: '22222222-2222-4222-8222-222222222222',
      dealerGameId: '33333333-3333-4333-8333-333333333333',
      handNumber: 7,
    })).resolves.toEqual({
      outcome: 'already_advanced',
      status: 'game_selection',
      dealerPosition: 4,
      configDeadline: '2026-08-23T17:30:00.000Z',
    });

    expect(rpc).toHaveBeenCalledWith('holm_advance_postgame', {
      p_game_id: '11111111-1111-4111-8111-111111111111',
      p_round_id: '22222222-2222-4222-8222-222222222222',
      p_dealer_game_id: '33333333-3333-4333-8333-333333333333',
      p_hand_number: 7,
    });
  });

  it('surfaces database failures instead of treating the handoff as complete', async () => {
    const error = {
      code: 'P0001',
      message: 'advance_standard_postgame:holm_settlement_not_committed:0',
    };
    rpc.mockResolvedValue({ data: null, error });

    await expect(advanceHolmPostgame({
      gameId: '11111111-1111-4111-8111-111111111111',
      roundId: '22222222-2222-4222-8222-222222222222',
      dealerGameId: '33333333-3333-4333-8333-333333333333',
      handNumber: 7,
    })).rejects.toBe(error);
  });

  it('rejects malformed success payloads', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'unknown' }, error: null });

    await expect(advanceHolmPostgame({
      gameId: '11111111-1111-4111-8111-111111111111',
      roundId: '22222222-2222-4222-8222-222222222222',
      dealerGameId: '33333333-3333-4333-8333-333333333333',
      handNumber: 7,
    })).rejects.toThrow('Unexpected Holm postgame outcome: unknown');
  });
});

describe('Holm postgame ownership wiring', () => {
  it('routes Holm to PostgreSQL before the legacy browser leader/evaluation chain', () => {
    const gameSource = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');
    const authoritativeCall = gameSource.indexOf('const postgame = await advanceHolmPostgame({');
    const leaderChain = gameSource.indexOf('// P0 GUARD (MUT-02): Single-executor leader election.');

    expect(authoritativeCall).toBeGreaterThan(0);
    expect(leaderChain).toBeGreaterThan(authoritativeCall);
    expect(gameSource.slice(authoritativeCall, leaderChain)).toContain('return;');
  });

  it('keeps connected and timer recovery on the same hardened private owner', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20260823171449_holm_postgame_authority.sql', import.meta.url),
      'utf8',
    );
    const proof = readFileSync(
      new URL('../../supabase/tests/holm_postgame_authority_rollback_proof.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toContain('RETURN private.advance_standard_postgame(');
    expect(migration).toContain("result.event_kind = 'chucky_final_award'");
    expect(migration).toContain("v_round.status IS DISTINCT FROM 'completed'");
    expect(migration).toContain('FOR UPDATE;');
    expect(proof).toContain('private.advance_due_canonical_game_timers(1)');
  });
});
