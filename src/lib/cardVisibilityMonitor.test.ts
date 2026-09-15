// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { observeCardVisibility, type CardVisibilityContract } from './cardVisibilityMonitor';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
it('requires fresh confirmation when card admission changes between coalesced checks', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const root = document.createElement('div'); document.body.append(root);
  const contract: CardVisibilityContract = { gameId: 'g', dealerGameId: 'd', roundId: 'r', handNumber: 1, roundNumber: 1,
    handContextId: 'r:h1', runtimeHandContextId: 'r:h1', viewerId: 'viewer', gameType: 'holm-game', phase: 'GAMEPLAY', active: true,
    selfExpected: 4, communityExpected: 0, communityFaces: 0, selfDataCount: 4, communityDataCount: 0, settledCount: 4,
    pendingIntents: 0, paused: false, canAct: true };
  const incident = vi.fn();
  const observer = observeCardVisibility(root, () => contract, incident);
  try {
    await vi.advanceTimersByTimeAsync(250); // First missing-card sample; confirmation is pending.
    expect(incident).not.toHaveBeenCalled();
    contract.selfExpected = 0; observer.update(); // Cards tab intentionally leaves.
    contract.selfExpected = 4; observer.update(); // A new admission before the coalesced scan.
    await vi.advanceTimersByTimeAsync(250);
    expect(incident, 'An interrupted expectation cannot reuse its old confirmation').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(incident, 'A genuinely sustained loss still records once').toHaveBeenCalledTimes(1);
    expect(incident.mock.calls[0][0].at).toBeGreaterThan(Date.now() - 500);
  } finally { observer.stop(); }
});
