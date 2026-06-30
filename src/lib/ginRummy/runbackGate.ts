/**
 * Gin Runback Gate — local lifecycle boundary set the instant the
 * Run It Back action is invoked from DealerGameSetup. While set:
 *
 *   - GinRummyGameTable forces isPlayable = false
 *   - render-owned committed identity & accepted presentation are forced null
 *   - no DealRuntime / orchestrator / felt / overlay / opponent cardbacks mount
 *
 * Released ONLY by GinRummyGameTable after all of:
 *   - a new committed Gin presentation identity exists
 *   - new dealerGameId differs from the outgoing dealerGameId
 *   - an authoritative snapshot matching that full new tuple has been accepted
 *
 * It is never cleared on RPC resolve, poll, or timeout.
 */
import { useSyncExternalStore } from 'react';

type RunbackState = { gameId: string } | null;

let state: RunbackState = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function beginGinRunback(gameId: string): void {
  if (!gameId) return;
  if (state && state.gameId === gameId) return;
  state = { gameId };
  emit();
}

export function clearGinRunback(gameId: string): void {
  if (!state || state.gameId !== gameId) return;
  state = null;
  emit();
}

export function getGinRunbackSnapshot(): RunbackState {
  return state;
}

export function subscribeGinRunback(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGinRunbackPending(gameId: string | null | undefined): boolean {
  const snap = useSyncExternalStore(subscribeGinRunback, getGinRunbackSnapshot, getGinRunbackSnapshot);
  return !!gameId && !!snap && snap.gameId === gameId;
}
