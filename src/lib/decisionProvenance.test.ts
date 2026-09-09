import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureDecisionInput, createDecisionProvenance, decisionProvenanceSnapshot,
  finishDecisionProvenance, withDecisionProvenance, DECISION_PROVENANCE_HEADER, DECISION_PROVENANCE_PREFIX } from './decisionProvenance';

const identity = { gameId: 'game', dealerGameId: 'dealer', roundId: 'round', playerId: 'player', decision: 'fold' as const };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('decision source evidence without action-path I/O', () => {
  it.each(['mouse', 'touch', 'pen'])('captures %s activation at the button', pointerType => {
    expect(captureDecisionInput({ nativeEvent: { pointerType, isTrusted: true } }))
      .toMatchObject({ source: 'button', modality: pointerType, trusted: true });
  });
  it('distinguishes keyboard/assistive activation and synthetic events', () => {
    expect(captureDecisionInput({ nativeEvent: { detail: 0, isTrusted: false } }))
      .toMatchObject({ modality: 'keyboard_or_assistive', trusted: false });
  });
  it('does not invent a manual activation for an automatic or unknown call', () => {
    expect(createDecisionProvenance(identity)?.source).toBe('unknown');
    expect(createDecisionProvenance(identity, { source: 'auto_fold', activatedAt: 123 }))
      .toMatchObject({ source: 'auto_fold', activatedAt: 123 });
  });
  it('sends one existing request immediately and performs no storage/network work before its result', async () => {
    const storage = vi.fn(); const idle = vi.fn(); const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', { localStorage: { setItem: storage }, requestIdleCallback: idle });
    let resolve!: (value: { data: { outcome: string }; error: null }) => void;
    const response = new Promise<{ data: { outcome: string }; error: null }>(done => { resolve = done; });
    const request = Object.assign(response, { setHeader: vi.fn() });
    const value = createDecisionProvenance(identity)!;
    const pending = withDecisionProvenance(request, value);
    expect(DECISION_PROVENANCE_HEADER).toBe('x-client-info');
    expect(request.setHeader).toHaveBeenCalledExactlyOnceWith(DECISION_PROVENANCE_HEADER, DECISION_PROVENANCE_PREFIX + JSON.stringify(value));
    expect(storage).not.toHaveBeenCalled(); expect(idle).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    const result = { data: { outcome: 'decision_committed' }, error: null };
    resolve(result);
    expect(await pending).toBe(result);
    expect(storage).not.toHaveBeenCalled(); expect(idle).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
    idle.mock.calls[0][0]();
    expect(storage).toHaveBeenCalledOnce();
  });
  it('preserves success when headers or persistence are unavailable', async () => {
    const idle = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem: () => { throw new Error('quota'); } }, requestIdleCallback: idle });
    const result = { data: { outcome: 'decision_committed' }, error: null };
    const request = Object.assign(Promise.resolve(result), { setHeader: () => { throw new Error('headers'); } });
    expect(await withDecisionProvenance(request, createDecisionProvenance(identity))).toBe(result);
    expect(() => idle.mock.calls[0][0]()).not.toThrow();
  });
  it('records replay, server refusal and transport failure separately without swallowing the result', async () => {
    for (const [result, outcome] of [
      [{ data: { deduped: true }, error: null }, 'server_replayed'],
      [{ data: null, error: { message: 'not_player_owner' } }, 'server_rejected'],
    ] as const) {
      const value = createDecisionProvenance(identity)!;
      expect(await withDecisionProvenance(Object.assign(Promise.resolve(result), { setHeader: vi.fn() }), value)).toBe(result);
      expect(decisionProvenanceSnapshot().reverse().find(row => row.requestId === value.requestId)?.outcome).toBe(outcome);
    }
    const value = createDecisionProvenance(identity)!;
    const error = new Error('offline');
    await expect(withDecisionProvenance(Object.assign(Promise.reject(error), { setHeader: vi.fn() }), value)).rejects.toBe(error);
    expect(decisionProvenanceSnapshot().reverse().find(row => row.requestId === value.requestId)?.outcome).toBe('transport_error');
  });
  it('caps local history and survives missing browser crypto', () => {
    for (let n = 0; n < 100; n++) finishDecisionProvenance(createDecisionProvenance(identity), 'completed', Date.now());
    expect(decisionProvenanceSnapshot()).toHaveLength(64);
    vi.stubGlobal('crypto', { randomUUID: () => { throw new Error('unavailable'); } });
    expect(createDecisionProvenance(identity)).toBeUndefined();
  });
});
