/**
 * useDebugHarness — runtime accessor for the active debug harness
 * profile id for a given game type.
 *
 * Returns the executable game harness from the canonical runtime cache.
 * A configured selection is intentionally not enough: this returns 'none'
 * unless the global Harnesses Mode gate is on and the cache has loaded.
 *
 * Usage:
 *   const harness = useDebugHarness('cribbage');
 *   if (harness === 'quick_skunk') { ...deterministic setup... }
 */

import { useEffect, useState } from 'react';
import { getHarnessProfile, type DebugHarnessId } from './profiles';
import {
  ensureHarnessCacheLoaded,
  getActiveHarnessCached,
  subscribeHarnessCache,
  subscribeHarnessesMode,
} from './runtimeCache';

export function useDebugHarness(gameType: string | null | undefined): DebugHarnessId {
  const [harness, setHarness] = useState<DebugHarnessId>('none');

  useEffect(() => {
    if (!gameType) {
      setHarness('none');
      return;
    }
    let cancelled = false;

    const sync = () => {
      if (cancelled) return;
      // Validate against the registry so a stale/unknown id never leaks into runtime branches.
      setHarness(getHarnessProfile(gameType, getActiveHarnessCached(gameType)).id);
    };

    void ensureHarnessCacheLoaded().then(sync);
    const unsubscribeHarness = subscribeHarnessCache(sync);
    const unsubscribeMode = subscribeHarnessesMode(sync);

    return () => {
      cancelled = true;
      unsubscribeHarness();
      unsubscribeMode();
    };
  }, [gameType]);

  return harness;
}

/** Imperative one-shot read for non-component code (bots, setup helpers). */
export async function readDebugHarness(gameType: string): Promise<DebugHarnessId> {
  await ensureHarnessCacheLoaded();
  return getHarnessProfile(gameType, getActiveHarnessCached(gameType)).id;
}
