/**
 * Shared canonical active-harness predicate for UI warnings.
 *
 * The warning predicate is EXACTLY the runtime execution predicate:
 *   getActiveHarnessCached(dbGameType) !== 'none'
 * which is already fail-closed on the harnesses master gate. There is no
 * separate display-only detection logic that can drift from runtime.
 */

import { useEffect, useState } from 'react';
import {
  ensureHarnessCacheLoaded,
  getActiveHarnessCached,
  subscribeHarnessCache,
  subscribeHarnessesMode,
} from './runtimeCache';
import { getHarnessProfile, isHarnessActive } from './profiles';

/** Map a frontend game-selection id to its game_defaults.game_type key. */
export function toHarnessGameType(gameSelectionId: string): string {
  return gameSelectionId === 'holm-game' ? 'holm' : gameSelectionId;
}

export interface ActiveHarnessInfo {
  /** True only when the master gate is ON and a non-'none' harness is selected. */
  active: boolean;
  /** Canonical harness id ('none' when inactive). */
  id: string;
  /** Exact configured harness display name ('' when inactive). */
  label: string;
}

function read(gameSelectionId: string | null | undefined): ActiveHarnessInfo {
  if (!gameSelectionId) return { active: false, id: 'none', label: '' };
  const gameType = toHarnessGameType(gameSelectionId);
  const id = getActiveHarnessCached(gameType);
  if (!isHarnessActive(id)) return { active: false, id: 'none', label: '' };
  return { active: true, id, label: getHarnessProfile(gameType, id).label };
}

/** Reactive active-harness info for one game (selection id or db game_type). */
export function useActiveHarnessInfo(
  gameSelectionId: string | null | undefined,
): ActiveHarnessInfo {
  const [info, setInfo] = useState<ActiveHarnessInfo>(() => read(gameSelectionId));

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) setInfo(read(gameSelectionId));
    };
    void ensureHarnessCacheLoaded().then(refresh);
    const unsubA = subscribeHarnessCache(refresh);
    const unsubB = subscribeHarnessesMode(refresh);
    return () => {
      cancelled = true;
      unsubA();
      unsubB();
    };
  }, [gameSelectionId]);

  return info;
}

/** Reactive map of gameSelectionId → active harness info, evaluated independently. */
export function useActiveHarnessMap(
  gameSelectionIds: string[],
): Record<string, ActiveHarnessInfo> {
  const key = gameSelectionIds.join(',');
  const [map, setMap] = useState<Record<string, ActiveHarnessInfo>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(',') : [];
    const refresh = () => {
      if (cancelled) return;
      const next: Record<string, ActiveHarnessInfo> = {};
      for (const id of ids) next[id] = read(id);
      setMap(next);
    };
    void ensureHarnessCacheLoaded().then(refresh);
    refresh();
    const unsubA = subscribeHarnessCache(refresh);
    const unsubB = subscribeHarnessesMode(refresh);
    return () => {
      cancelled = true;
      unsubA();
      unsubB();
    };
  }, [key]);

  return map;
}
