import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosClient, ChaosDomSnapshot } from './continuousObserver';
import { waitForDecisionCapture } from './decisionCapture';

const scope = { gameId: 'game-1', dealerGameId: 'dealer-1', roundId: 'round-1' };
const lock = { field: 'decisionLocks', roundId: scope.roundId, value: 'player-1' } as const;
const completed = { field: 'roundStatus', roundId: scope.roundId, value: 'completed' } as const;
const snapshot = (overrides: Partial<ChaosDomSnapshot> = {}): ChaosDomSnapshot => ({
  ...scope, wallTime: Date.now(), decisionLocks: ['player-1'], roundStatus: 'betting', ...overrides,
} as ChaosDomSnapshot);

describe('scripted decision capture barrier', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => vi.useRealTimers());

  it('keeps the next action pending until both clients capture the exact lock', async () => {
    const rows: Record<ChaosClient, ChaosDomSnapshot | null> = { host: snapshot(), peer: null };
    let nextActionAdmitted = false;
    const pending = waitForDecisionCapture({ latestSnapshot: client => rows[client] }, scope, lock, Date.now())
      .then(receipt => { nextActionAdmitted = true; return receipt; });
    await vi.advanceTimersByTimeAsync(800);
    expect(nextActionAdmitted).toBe(false);
    rows.peer = snapshot();
    await vi.advanceTimersByTimeAsync(25);
    const receipt = await pending;
    expect(receipt.host.progressMs).toBe(0);
    expect(receipt.peer.progressMs).toBe(800);
    expect(nextActionAdmitted).toBe(true);
  });

  it('requires the completed round on both clients before evidence can be sealed', async () => {
    const rows = { host: snapshot({ roundStatus: 'completed' }), peer: snapshot() };
    let sealed = false;
    const pending = waitForDecisionCapture({ latestSnapshot: client => rows[client] }, scope, completed, Date.now())
      .then(receipt => { sealed = true; return receipt; });
    await vi.advanceTimersByTimeAsync(500);
    expect(sealed).toBe(false);
    rows.peer = snapshot({ roundStatus: 'completed' });
    await vi.advanceTimersByTimeAsync(25);
    expect((await pending).peer.progressMs).toBe(500);
  });

  it.each([
    ['absent capture', null],
    ['wrong session', { gameId: 'other-game' }],
    ['wrong dealer game', { dealerGameId: 'other-dealer' }],
    ['wrong round', { roundId: 'other-round' }],
    ['another player lock', { decisionLocks: ['other-player'] }],
    ['a completed round instead of the missing lock', { decisionLocks: [], roundStatus: 'completed' }],
    ['pre-click evidence', { wallTime: 9_999 }],
    ['evidence after the deadline', { wallTime: 16_001 }],
  ] as Array<[string, Partial<ChaosDomSnapshot> | null]>)('rejects %s', async (_label, overrides) => {
    const peer = overrides === null ? null : snapshot(overrides);
    const pending = waitForDecisionCapture({ latestSnapshot: client => client === 'host' ? snapshot() : peer }, scope, lock, Date.now());
    const rejection = expect(pending).rejects.toThrow('within six seconds of the click');
    await vi.advanceTimersByTimeAsync(6_000);
    await rejection;
  });

  it('counts time spent awaiting the RPC against the original six-second budget', async () => {
    await vi.advanceTimersByTimeAsync(5_900);
    const pending = waitForDecisionCapture({ latestSnapshot: () => null }, scope, lock, 10_000);
    const rejection = expect(pending).rejects.toThrow('within six seconds of the click');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });
});
