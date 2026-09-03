import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: supabaseMocks.from } }));

import {
  GAME_FREEZE_TRACE_MAX_ENTRIES, getGameFreezeTraceSnapshot,
  recordGameFreezeTrace, resetGameFreezeTraceForTest, sendGameFreezeTrace,
  setGameFreezeTraceIdentity, startGameFreezeTrace, stopGameFreezeTrace,
} from './gameFreezeTrace';

describe('Game freeze trace', () => {
  beforeEach(() => {
    resetGameFreezeTraceForTest();
    supabaseMocks.from.mockReset();
    supabaseMocks.insert.mockReset();
    supabaseMocks.from.mockReturnValue({ insert: supabaseMocks.insert });
  });

  it('is inert until the player explicitly starts it', () => {
    recordGameFreezeTrace('realtime.status', { status: 'SUBSCRIBED' });
    expect(getGameFreezeTraceSnapshot().entries).toEqual([]);
    setGameFreezeTraceIdentity({ gameId: 'game-a', gameType: 'yahtzee', dealerGameId: 'dealer-a', roundId: 'round-a', handNumber: 3, phase: 'playing', gameStatus: 'in_progress', viewerUserId: 'user-a' });
    expect(startGameFreezeTrace()).toBe(true);
    expect(getGameFreezeTraceSnapshot().mode).toBe('recording');
  });

  it('bounds captured evidence and freezes it on stop', () => {
    setGameFreezeTraceIdentity({ gameId: 'game-a', gameType: 'holm' });
    startGameFreezeTrace();
    for (let index = 0; index < GAME_FREEZE_TRACE_MAX_ENTRIES + 10; index += 1) recordGameFreezeTrace('authoritative.fetch', { index });
    stopGameFreezeTrace();
    const stopped = getGameFreezeTraceSnapshot();
    expect(stopped.mode).toBe('stopped');
    expect(stopped.entries).toHaveLength(GAME_FREEZE_TRACE_MAX_ENTRIES);
    recordGameFreezeTrace('must-not-record');
    expect(getGameFreezeTraceSnapshot().entries).toEqual(stopped.entries);
  });

  it('sends one frozen game-neutral incident capsule to debug_events', async () => {
    supabaseMocks.insert.mockResolvedValue({ error: null });
    setGameFreezeTraceIdentity({ gameId: 'game-a', gameType: 'cribbage', roundId: 'round-a', viewerUserId: 'user-a' });
    startGameFreezeTrace();
    recordGameFreezeTrace('realtime.status', { status: 'CHANNEL_ERROR' });
    stopGameFreezeTrace();
    await expect(sendGameFreezeTrace()).resolves.toBe(true);
    expect(supabaseMocks.from).toHaveBeenCalledWith('debug_events');
    expect(supabaseMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      game_id: 'game-a', round_id: 'round-a', user_id: 'user-a',
      client_role: 'game-freeze-recorder', event_type: 'game.freeze_trace',
    }));
  });
});
