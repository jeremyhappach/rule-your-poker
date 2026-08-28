import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

import { advanceYahtzeePostgame, applyYahtzeeAction, applyYahtzeeAutoRollAction, setYahtzeeHolds } from './yahtzeeAuthority';
import { startYahtzeeRound } from './yahtzeeRoundLogic';
import type { YahtzeeState } from './yahtzeeTypes';

const state: YahtzeeState = {
  currentTurnPlayerId: '22222222-2222-4222-8222-222222222222',
  playerStates: {},
  gamePhase: 'playing',
  turnOrder: [],
  currentRound: 1,
  actionSequence: 9,
};

describe('Yahtzee authority RPC clients', () => {
  beforeEach(() => rpc.mockReset());

  it('submits an exact action sequence and returns the committed state to the initiator', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'applied', action: 'roll', action_sequence: 9, state },
      error: null,
    });

    await expect(applyYahtzeeAction({
      roundId: '11111111-1111-4111-8111-111111111111',
      playerId: '22222222-2222-4222-8222-222222222222',
      action: 'roll',
      expectedActionSequence: 8,
    })).resolves.toMatchObject({ outcome: 'applied', actionSequence: 9, state });

    expect(rpc).toHaveBeenCalledWith('yahtzee_apply_action', {
      _round_id: '11111111-1111-4111-8111-111111111111',
      _player_id: '22222222-2222-4222-8222-222222222222',
      _action: 'roll',
      _die_index: null,
      _category: null,
      _hold_mask: null,
      _expected_action_sequence: 8,
    });
  });

  it('throws database errors instead of treating cleanup or action failure as success', async () => {
    const error = { code: 'P0001', message: 'identity mismatch' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(applyYahtzeeAction({
      roundId: '11111111-1111-4111-8111-111111111111',
      playerId: '22222222-2222-4222-8222-222222222222',
      action: 'hold',
      dieIndex: 0,
      expectedActionSequence: 9,
    })).rejects.toBe(error);
  });

  it('uses the owner-only Auto-roll adapter for a paced fake-money bot action', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'applied', action: 'roll', action_sequence: 10, state },
      error: null,
    });

    await expect(applyYahtzeeAutoRollAction({
      roundId: '11111111-1111-4111-8111-111111111111',
      playerId: '22222222-2222-4222-8222-222222222222',
      action: 'bot_roll',
      holdMask: [false, true, false, false, true],
      expectedActionSequence: 9,
    })).resolves.toMatchObject({ outcome: 'applied', actionSequence: 10, state });

    expect(rpc).toHaveBeenCalledWith('yahtzee_apply_auto_roll_action', {
      _round_id: '11111111-1111-4111-8111-111111111111',
      _player_id: '22222222-2222-4222-8222-222222222222',
      _action: 'bot_roll',
      _category: null,
      _hold_mask: [false, true, false, false, true],
      _expected_action_sequence: 9,
    });
  });

  it('commits a complete hold mask under the exact action sequence', async () => {
    rpc.mockResolvedValue({
      data: { outcome: 'applied', action: 'set_holds', action_sequence: 10, state },
      error: null,
    });

    await expect(setYahtzeeHolds({
      roundId: '11111111-1111-4111-8111-111111111111',
      playerId: '22222222-2222-4222-8222-222222222222',
      holdMask: [true, false, true, false, true],
      expectedActionSequence: 9,
    })).resolves.toMatchObject({
      outcome: 'applied',
      action: 'set_holds',
      actionSequence: 10,
    });

    expect(rpc).toHaveBeenCalledWith('yahtzee_set_holds', {
      _round_id: '11111111-1111-4111-8111-111111111111',
      _player_id: '22222222-2222-4222-8222-222222222222',
      _hold_mask: [true, false, true, false, true],
      _expected_action_sequence: 9,
    });
  });

  it('bootstraps atomically and exposes the committed round to the initiating client', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'started',
        deduped: false,
        round_id: '11111111-1111-4111-8111-111111111111',
        dealer_game_id: '33333333-3333-4333-8333-333333333333',
        hand_number: 1,
        state,
      },
      error: null,
    });
    await expect(startYahtzeeRound(
      '44444444-4444-4444-8444-444444444444',
      true,
    )).resolves.toMatchObject({
      outcome: 'started',
      roundId: '11111111-1111-4111-8111-111111111111',
      state,
    });
    expect(rpc).toHaveBeenCalledWith('start_yahtzee_round', {
      _game_id: '44444444-4444-4444-8444-444444444444',
      _predecessor_round_id: null,
    });
  });

  it('replays an exact postgame identity and parses the stored result', async () => {
    rpc.mockResolvedValue({
      data: {
        outcome: 'already_advanced',
        status: 'waiting',
        dealer_position: 4,
        config_deadline: null,
      },
      error: null,
    });
    await expect(advanceYahtzeePostgame({
      gameId: '44444444-4444-4444-8444-444444444444',
      roundId: '11111111-1111-4111-8111-111111111111',
      dealerGameId: '33333333-3333-4333-8333-333333333333',
      handNumber: 5,
    })).resolves.toEqual({
      outcome: 'already_advanced',
      status: 'waiting',
      dealerPosition: 4,
      configDeadline: null,
    });
  });
});

describe('Yahtzee browser ownership boundary', () => {
  it('contains no direct round-state writer in the table or bootstrap client', () => {
    const table = readFileSync(new URL('../components/YahtzeeGameTable.tsx', import.meta.url), 'utf8');
    const bootstrap = readFileSync(new URL('./yahtzeeRoundLogic.ts', import.meta.url), 'utf8');
    expect(table).not.toContain('updateYahtzeeState');
    expect(table).not.toMatch(/\.from\(["']rounds["']\)[\s\S]{0,200}\.update\(\{\s*yahtzee_state/);
    expect(bootstrap).not.toMatch(/\.from\(["']rounds["']\)[\s\S]{0,200}\.insert\(/);
  });

  it('initializes the timer display-name helper before timer state can use it', () => {
    const table = readFileSync(new URL('../components/YahtzeeGameTable.tsx', import.meta.url), 'utf8');
    const helper = table.indexOf('const getPlayerUsername = (player: Player) =>');
    const timerState = table.indexOf('const yahtzeeShellTimerState =');

    expect(helper).toBeGreaterThan(-1);
    expect(timerState).toBeGreaterThan(helper);
  });

  it('exposes the fake-money auto-roll rejoin control without granting table-state writes', () => {
    const table = readFileSync(new URL('../components/YahtzeeGameTable.tsx', import.meta.url), 'utf8');

    expect(table).toContain('data-yahtzee-auto-roll=""');
    expect(table).toContain('Auto-roll enabled (uncheck to rejoin)');
    expect(table).toContain('onAutoFoldChange?.(myPlayer.id, false)');
    expect(table).toContain('const isMyAutoRollTurn = isMyTurn && !isRealMoney');
    expect(table).toContain('Auto-rolling…');
    expect(table).toContain('applyYahtzeeAutoRollAction');
  });

  it('coalesces optimistic die taps into the authoritative full-mask RPC', () => {
    const table = readFileSync(new URL('../components/YahtzeeGameTable.tsx', import.meta.url), 'utf8');
    const toggleStart = table.indexOf('const handleToggleHold');
    const toggleEnd = table.indexOf('/* ---- Score category ---- */', toggleStart);
    const toggleHandler = table.slice(toggleStart, toggleEnd);

    expect(toggleHandler).toContain('holdIntentRef.current =');
    expect(toggleHandler).toContain('setLocalDice(optimisticDice)');
    expect(toggleHandler).toContain('ensureHoldMaskSynced()');
    expect(toggleHandler).not.toContain("action: 'hold'");
    expect(table).toContain('setYahtzeeHolds({');
    expect(table).toContain('traceContext={useCached ? undefined : {');
  });
});
