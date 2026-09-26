import { beforeEach, describe, expect, it, vi } from 'vitest';
import { farkleTestState } from './__fixtures__/testState';
import { recordFarkleBankIntent } from './bankProvenance';
import { createFarkleActionRequest } from './authority';

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert }) } }));
beforeEach(() => insert.mockReset().mockResolvedValue({ error: null }));

describe('non-authoritative Farkle Bank diagnostics', () => {
  const state = farkleTestState();
  const scope = { gameId: 'session', dealerGameId: 'dealer', roundId: state._authorityScope, handNumber: 1 };
  it('links an otherwise unattributed Bank to the immutable request identity', () => {
    const request = createFarkleActionRequest(scope, state.currentTurnPlayerId, state, 'bank');
    const before = JSON.stringify(request);
    recordFarkleBankIntent(request, state);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'farkle_bank_intent',
      payload: expect.objectContaining({ diagnosticOnly: true, requestId: request.requestId,
        expectedSequence: state.actionSequence, activation: expect.objectContaining({ source: 'unattributed' }) }) }));
    expect(JSON.stringify(request)).toBe(before);
  });
  it('does not record rolls or holds and cannot throw into gameplay', async () => {
    recordFarkleBankIntent(createFarkleActionRequest(scope, state.currentTurnPlayerId, state, 'roll'), state);
    expect(insert).not.toHaveBeenCalled();
    const request = createFarkleActionRequest(scope, state.currentTurnPlayerId, state, 'bank');
    insert.mockImplementationOnce(() => { throw Error('diagnostic unavailable'); });
    expect(() => recordFarkleBankIntent(request, state)).not.toThrow();
    insert.mockRejectedValueOnce(Error('offline'));
    recordFarkleBankIntent(request, state);
    await Promise.resolve();
  });
});
