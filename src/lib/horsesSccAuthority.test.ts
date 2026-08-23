import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import {
  advanceHorsesSccCompletedRound,
  advanceHorsesSccPostgame,
} from './horsesSccAuthority';

const identity = {
  gameId: '11111111-1111-4111-8111-111111111111',
  roundId: '22222222-2222-4222-8222-222222222222',
  dealerGameId: '33333333-3333-4333-8333-333333333333',
  handNumber: 4,
};

const rpcIdentity = {
  p_game_id: identity.gameId,
  p_round_id: identity.roundId,
  p_dealer_game_id: identity.dealerGameId,
  p_hand_number: identity.handNumber,
};

describe('Horses/SCC completed-round authority client', () => {
  beforeEach(() => rpc.mockReset());

  it('submits exact identity and parses an authoritative tie rollover', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'already_advanced',
        transition: 'tie_rollover',
        hand_number: 5,
        round_number: 5,
        ante_amount: 2,
        active_count: 2,
        pot: 14,
        pre_chips: { a: 100, b: 90 },
        post_chips: { a: 98, b: 88 },
      },
      error: null,
    });

    await expect(advanceHorsesSccCompletedRound(identity)).resolves.toEqual({
      status: 'already_advanced',
      transition: 'tie_rollover',
      terminalDisposition: null,
      handNumber: 5,
      roundNumber: 5,
      anteAmount: 2,
      activeCount: 2,
      pot: 14,
      preChips: { a: 100, b: 90 },
      postChips: { a: 98, b: 88 },
    });
    expect(rpc).toHaveBeenCalledWith(
      'horses_scc_advance_completed_round',
      rpcIdentity,
    );
  });

  it('surfaces database errors and rejects malformed receipts', async () => {
    const error = { code: 'P0001', message: 'round_identity_mismatch' };
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(advanceHorsesSccCompletedRound(identity)).rejects.toBe(error);

    rpc.mockResolvedValueOnce({ data: { status: 'advanced' }, error: null });
    await expect(advanceHorsesSccCompletedRound(identity)).rejects.toThrow(
      'Unexpected Horses/SCC completed-round outcome',
    );
  });
});

describe('Horses/SCC postgame authority client', () => {
  beforeEach(() => rpc.mockReset());

  it('submits exact presentation identity and parses replay-safe postgame', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'already_advanced',
        status: 'game_selection',
        dealer_position: 2,
        config_deadline: '2026-08-23T18:00:00.000Z',
      },
      error: null,
    });

    await expect(advanceHorsesSccPostgame(identity)).resolves.toEqual({
      outcome: 'already_advanced',
      status: 'game_selection',
      dealerPosition: 2,
      configDeadline: '2026-08-23T18:00:00.000Z',
    });
    expect(rpc).toHaveBeenCalledWith('horses_scc_advance_postgame', rpcIdentity);
  });
});

describe('Horses/SCC progression ownership wiring', () => {
  it('removes connected tie progression from the browser multi-write chain', () => {
    const controller = readFileSync(
      new URL('../hooks/useHorsesMobileController.ts', import.meta.url),
      'utf8',
    );
    const start = controller.indexOf('const processWin = async () => {');
    const end = controller.indexOf('// RECOVERY: If gamePhase is "playing"', start);
    const completedRoundOwner = controller.slice(start, end);

    expect(completedRoundOwner).toContain('await advanceHorsesSccCompletedRound({');
    expect(completedRoundOwner).not.toContain('startHorsesRound(');
    expect(completedRoundOwner).not.toContain('startSCCRound(');
    expect(completedRoundOwner).not.toContain('settleHorsesGame(');
    expect(completedRoundOwner).not.toContain('.from("game_results")');
    expect(completedRoundOwner).not.toContain('awaiting_next_round: true');
  });

  it('routes dice postgame before legacy leader election and removes its client timer', () => {
    const gameSource = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');
    const authoritativeCall = gameSource.indexOf('await advanceHorsesSccPostgame({');
    const leaderChain = gameSource.indexOf('// P0 GUARD (MUT-02): Single-executor leader election.');

    expect(authoritativeCall).toBeGreaterThan(0);
    expect(leaderChain).toBeGreaterThan(authoritativeCall);
    expect(gameSource.slice(authoritativeCall, leaderChain)).toContain('return;');
    expect(gameSource).not.toContain('// SAFETY AUTO-ADVANCE (Horses / SCC only):');
  });

  it('keeps connected and no-client paths on exact shared PostgreSQL owners', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20260823173530_horses_scc_connected_authority.sql', import.meta.url),
      'utf8',
    );
    const proof = readFileSync(
      new URL('../../supabase/tests/horses_scc_connected_authority_rollback_proof.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toContain('public.horses_scc_advance_completed_round');
    expect(migration).toContain("result.settlement_key = 'horses_terminal'");
    expect(migration).toContain("v_round.horses_state ->> 'gamePhase' IS DISTINCT FROM 'complete'");
    expect(migration).toContain('RETURN private.advance_standard_postgame(');
    expect(proof).toContain('private.advance_due_canonical_game_timers(1)');
    expect(proof).toContain('connected-authority-tie-one');
  });
});
