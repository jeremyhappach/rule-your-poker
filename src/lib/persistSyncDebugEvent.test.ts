import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, insert } = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from },
}));

vi.mock('@/lib/clientContext', () => ({
  getClientId: () => 'test-client',
}));

import { resetInvariantEventDedup } from './invariantEventLogger';
import {
  persistSyncDebugEvent,
  refreshSyncDebugFlag,
} from './persistSyncDebugEvent';

describe('production diagnostic posture', () => {
  beforeEach(() => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
    from.mockReset();
    from.mockReturnValue({ insert });
    resetInvariantEventDedup();
    refreshSyncDebugFlag();
  });

  it('routes invariant violations to the canonical debug_events sink', async () => {
    persistSyncDebugEvent({
      gameId: '11111111-1111-4111-8111-111111111111',
      gameType: 'yahtzee',
      handNumber: 4,
      roundId: '22222222-2222-4222-8222-222222222222',
      eventType: 'invariant',
      severity: 'error',
      eventName: 'impossible-dice-state',
      payload: { dieIndex: 2 },
    });

    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(from).toHaveBeenCalledWith('debug_events');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'impossible-dice-state',
      payload: expect.objectContaining({
        diagnosticKind: 'invariant',
        gameType: 'yahtzee',
        handNumber: 4,
        dieIndex: 2,
      }),
    }));
  });

  it('edge-deduplicates the same invariant identity', async () => {
    const event = {
      gameId: '11111111-1111-4111-8111-111111111111',
      gameType: 'cribbage',
      handNumber: 2,
      roundId: '22222222-2222-4222-8222-222222222222',
      eventType: 'invariant' as const,
      severity: 'error' as const,
      eventName: 'score-reversion',
      payload: { playerId: 'player-1' },
    };

    persistSyncDebugEvent(event);
    persistSyncDebugEvent(event);

    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
  });

  it('keeps ordinary transitions silent when no debug channel is enabled', () => {
    persistSyncDebugEvent({
      gameId: '11111111-1111-4111-8111-111111111111',
      gameType: 'cribbage',
      handNumber: 2,
      eventType: 'transition',
      severity: 'info',
      eventName: 'snapshot-accepted',
    });

    expect(from).not.toHaveBeenCalled();
  });
});
