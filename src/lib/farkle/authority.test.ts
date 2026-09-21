import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { advanceFarklePostgame, applyFarkleAction, createFarkleActionRequest } from './authority';
import { farkleTestState } from './__fixtures__/testState';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
const rpc = vi.mocked(supabase.rpc);
beforeEach(() => rpc.mockReset());

describe('Farkle action transport', () => {
  it('retries postgame with only the original settled identity', async () => {
    const scope = { gameId: 'session', dealerGameId: 'dealer', roundId: 'round', handNumber: 1 };
    let attempt = 0;
    rpc.mockImplementation((() => ({ abortSignal: () => ++attempt === 1 ? Promise.reject(new Error('network failed'))
      : Promise.resolve({ data: { outcome: 'already_advanced', status: 'game_selection' }, error: null }) })) as never);
    expect((await advanceFarklePostgame(scope)).outcome).toBe('already_advanced');
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]).toEqual({ p_game_id: 'session', p_dealer_game_id: 'dealer', p_round_id: 'round', p_hand_number: 1 });
  });
  it('reuses the exact receipt identity and payload after an uncertain network response', async () => {
    const state = farkleTestState();
    const selected = [1, 0];
    const request = createFarkleActionRequest({ gameId: 'game', dealerGameId: 'dealer', roundId: state._authorityScope, handNumber: 1 }, state.currentTurnPlayerId, state, 'hold', selected);
    selected.push(5);
    let attempt = 0;
    rpc.mockImplementation((() => ({ abortSignal: () => ++attempt === 1 ? Promise.reject(new Error('network failed')) : Promise.resolve({ data: { outcome: 'applied', deduped: true, state }, error: null }) })) as never);
    expect((await applyFarkleAction(request)).deduped).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_selection: [0, 1], p_request_id: request.requestId, p_expected_sequence: 1 });
  });
  it('rejects a response for another round instead of presenting it', async () => {
    const state = farkleTestState();
    const request = createFarkleActionRequest({ gameId: 'game', dealerGameId: 'dealer', roundId: state._authorityScope, handNumber: 1 }, state.currentTurnPlayerId, state, 'roll');
    rpc.mockReturnValue({ abortSignal: async () => ({ data: { outcome: 'applied', state: { ...state, _authorityScope: 'different' } }, error: null }) } as never);
    await expect(applyFarkleAction(request)).rejects.toThrow('mismatched round');
  });
});
