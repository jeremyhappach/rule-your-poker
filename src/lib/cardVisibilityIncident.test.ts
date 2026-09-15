// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), auth: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mock.auth }, from: () => ({ upsert: (...args: unknown[]) => ({ abortSignal: () => mock.send(...args) }) }),
} }));
import { retainCardVisibilityIncident, flushCardVisibilityIncidents, CARD_INCIDENT_KEY } from './cardVisibilityIncident';
import type { CardVisibilitySample } from './cardVisibilityMonitor';
const sample: CardVisibilitySample = {
  at: 100, reason: 'card-dom', contract: { gameId: 'a', dealerGameId: 'b', roundId: 'c', viewerId: 'viewer',
    handNumber: 2, roundNumber: 1, handContextId: 'h2', runtimeHandContextId: 'h2', gameType: 'holm-game', phase: 'GAMEPLAY',
    active: true, selfExpected: 4, communityExpected: 4, communityFaces: 2, selfDataCount: 4, communityDataCount: 4,
    settledCount: 12, pendingIntents: 0, paused: false, canAct: true },
  self: { nodes: 0, visible: 0, faces: 0, blocked: ['surface-absent'] },
  community: { nodes: 4, visible: 4, faces: 2, blocked: [] }, failures: ['self-cards-missing'],
};
const settle = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); vi.clearAllMocks(); mock.auth.mockResolvedValue({ data: { session: { user: { id: 'viewer' } } } }); mock.send.mockResolvedValue({ error: null }); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('card incident delivery', () => {
  it('retains first loss, retries the same UUID and removes only after acknowledgement', async () => {
    mock.send.mockResolvedValueOnce({ error: { message: 'offline' } });
    retainCardVisibilityIncident(sample, []); await settle();
    const pending = JSON.parse(localStorage.getItem(CARD_INCIDENT_KEY)!);
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    pending[0].lastAttempt = 0; localStorage.setItem(CARD_INCIDENT_KEY, JSON.stringify(pending));
    await flushCardVisibilityIncidents();
    expect(mock.send.mock.calls[0][0].id).toBe(mock.send.mock.calls[1][0].id);
    expect(mock.send.mock.calls[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(JSON.parse(localStorage.getItem(CARD_INCIDENT_KEY)!)).toEqual([]);
  });
  it('does not retry on every gameplay render or deliver under a different user', async () => {
    mock.send.mockResolvedValue({ error: {} }); retainCardVisibilityIncident(sample, []); await settle();
    await flushCardVisibilityIncidents(); await flushCardVisibilityIncidents(); expect(mock.send).toHaveBeenCalledTimes(1);
    const pending = JSON.parse(localStorage.getItem(CARD_INCIDENT_KEY)!); pending[0].lastAttempt = 0;
    localStorage.setItem(CARD_INCIDENT_KEY, JSON.stringify(pending));
    mock.auth.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
    await flushCardVisibilityIncidents(); expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it('bounds pending incidents and attempts without deleting the first failure', async () => {
    mock.auth.mockResolvedValue({ data: { session: null } });
    for (let i = 0; i < 20; i++) retainCardVisibilityIncident({ ...sample, contract: { ...sample.contract, handContextId: `h${i}` } }, []);
    await settle(); const pending = JSON.parse(localStorage.getItem(CARD_INCIDENT_KEY)!);
    expect(pending).toHaveLength(8); expect(pending[0].sample.contract.handContextId).toBe('h0');
    expect(mock.send).not.toHaveBeenCalled();
  });
});
