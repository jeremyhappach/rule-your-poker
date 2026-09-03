import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabaseMocks.from },
}));
import {
  CRIBBAGE_LIVENESS_TRACE_MAX_ENTRIES,
  getCribbageLivenessTraceSnapshot,
  recordCribbageLivenessTrace,
  resetCribbageLivenessTraceForTest,
  sendCribbageLivenessTrace,
  setCribbageLivenessTraceIdentity,
  startCribbageLivenessTrace,
  stopCribbageLivenessTrace,
} from './livenessTrace';

describe('Cribbage liveness trace', () => {
  beforeEach(() => {
    resetCribbageLivenessTraceForTest();
    supabaseMocks.from.mockReset();
    supabaseMocks.insert.mockReset();
    supabaseMocks.from.mockReturnValue({ insert: supabaseMocks.insert });
  });

  it('is inert until the player explicitly starts it', () => {
    recordCribbageLivenessTrace('realtime.status', { status: 'SUBSCRIBED' });
    expect(getCribbageLivenessTraceSnapshot().entries).toEqual([]);

    setCribbageLivenessTraceIdentity({
      gameId: 'game-a',
      dealerGameId: 'dealer-a',
      roundId: 'round-a',
      handNumber: 3,
      phase: 'pegging',
      gameStatus: 'in_progress',
      viewerUserId: 'user-a',
    });
    expect(startCribbageLivenessTrace()).toBe(true);
    expect(getCribbageLivenessTraceSnapshot().mode).toBe('recording');
  });

  it('bounds captured evidence and freezes it on stop', () => {
    setCribbageLivenessTraceIdentity({ gameId: 'game-a' });
    startCribbageLivenessTrace();
    for (let index = 0; index < CRIBBAGE_LIVENESS_TRACE_MAX_ENTRIES + 10; index += 1) {
      recordCribbageLivenessTrace('authoritative.fetch', { index });
    }

    stopCribbageLivenessTrace();
    const stopped = getCribbageLivenessTraceSnapshot();
    expect(stopped.mode).toBe('stopped');
    expect(stopped.entries).toHaveLength(CRIBBAGE_LIVENESS_TRACE_MAX_ENTRIES);

    recordCribbageLivenessTrace('must-not-record', {});
    expect(getCribbageLivenessTraceSnapshot().entries).toEqual(stopped.entries);
  });

  it('sends one frozen, bounded incident capsule to debug_events', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: null });
    setCribbageLivenessTraceIdentity({ gameId: 'game-a', roundId: 'round-a', viewerUserId: 'user-a' });
    startCribbageLivenessTrace();
    recordCribbageLivenessTrace('realtime.status', { status: 'CHANNEL_ERROR' });
    stopCribbageLivenessTrace();

    await expect(sendCribbageLivenessTrace()).resolves.toBe(true);
    expect(supabaseMocks.from).toHaveBeenCalledWith('debug_events');
    expect(supabaseMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      game_id: 'game-a',
      round_id: 'round-a',
      user_id: 'user-a',
      client_role: 'cribbage-liveness-recorder',
      event_type: 'cribbage.liveness_trace',
    }));
  });
});
