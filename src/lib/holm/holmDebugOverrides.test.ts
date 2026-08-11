import { beforeEach, describe, expect, it, vi } from 'vitest';

const { harnessState, refreshState, refreshHarnessCache } = vi.hoisted(() => {
  const refreshState = { ok: true };
  return {
    harnessState: { id: 'none' as string },
    refreshState,
    refreshHarnessCache: vi.fn(async () => refreshState.ok),
  };
});

vi.mock('@/lib/debugHarness/runtimeCache', () => ({
  ensureHarnessCacheLoaded: vi.fn(async () => {}),
  getActiveHarnessCached: () => harnessState.id,
  isHarnessCacheLoaded: () => true,
  refreshHarnessCache,
}));

import {
  getHolmForcedWinner,
  getHolmForcedWinnerAsync,
} from './holmDebugOverrides';

beforeEach(() => {
  harnessState.id = 'none';
  refreshState.ok = true;
  refreshHarnessCache.mockClear();
});

describe('Holm forced-winner harness', () => {
  it('does not override the natural result when the active harness is none', async () => {
    expect(getHolmForcedWinner()).toBeNull();
    await expect(getHolmForcedWinnerAsync()).resolves.toBeNull();
    expect(refreshHarnessCache).toHaveBeenCalledOnce();
  });

  it('uses a forced outcome only when the execution boundary returns an active profile', async () => {
    harnessState.id = 'force_player_beats_chucky';
    expect(getHolmForcedWinner()).toBe('player');
    await expect(getHolmForcedWinnerAsync()).resolves.toBe('player');

    harnessState.id = 'force_chucky_beats_player';
    expect(getHolmForcedWinner()).toBe('chucky');
  });

  it('fails closed if the full execution boundary cannot be refreshed', async () => {
    harnessState.id = 'force_player_beats_chucky';
    refreshState.ok = false;

    await expect(getHolmForcedWinnerAsync()).resolves.toBeNull();
  });
});
