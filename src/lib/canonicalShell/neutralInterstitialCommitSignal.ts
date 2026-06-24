/**
 * neutralInterstitialCommitSignal — module-level signal indicating
 * whether the canonical NeutralInterstitial is currently mounted
 * (i.e. has "committed") for a given gameId.
 *
 * Used by surfaces (e.g. MobileGameTable Holm terminal-presentation
 * latch) that need to hold terminal/celebration presentation in place
 * until the shell has actually swapped to the neutral interstitial —
 * regardless of announcement TTLs, game.status transitions, or
 * current_game_uuid clearing.
 *
 * This is NOT instrumentation. It is the shell→surface boundary
 * signal that the neutral interstitial mount has occurred. Mount
 * side-effects in NeutralInterstitial publish here; consumers
 * subscribe via useNeutralInterstitialCommitted().
 */

import { useSyncExternalStore } from 'react';

type Listener = () => void;

const committedSet = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function setNeutralInterstitialCommitted(
  gameId: string | null | undefined,
  committed: boolean,
): void {
  const key = gameId ?? '__no_game__';
  const had = committedSet.has(key);
  if (committed && !had) {
    committedSet.add(key);
    emit();
  } else if (!committed && had) {
    committedSet.delete(key);
    emit();
  }
}

export function isNeutralInterstitialCommitted(
  gameId: string | null | undefined,
): boolean {
  const key = gameId ?? '__no_game__';
  return committedSet.has(key);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe to whether the NeutralInterstitial is currently mounted
 * for the given gameId. Returns the current boolean and re-renders
 * the consumer whenever the signal flips.
 */
export function useNeutralInterstitialCommitted(
  gameId: string | null | undefined,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isNeutralInterstitialCommitted(gameId),
    () => false,
  );
}
