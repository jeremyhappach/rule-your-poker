/**
 * Runtime status of the 3-5-7 fetch-trace instrumentation.
 *
 * The pill subscribes to this so the user can visibly confirm that
 * the deployed bundle physically contains — and has successfully
 * persisted a heartbeat for — the guard-chain fetch events
 * (357.fetch.entry / .card_gate / .round_resolution / .players_*).
 *
 * Emitted once per mounted 3-5-7 Game instance from Game.tsx (the
 * same module that owns the fetch trace).
 */

export type FetchTraceStatus = 'pending' | 'ready' | 'failed';

export const FETCH_INSTRUMENTATION_VERSION = 'v1';

let current: FetchTraceStatus = 'pending';
let failureReason: string | null = null;
const listeners = new Set<() => void>();

export function getFetchTraceStatus(): FetchTraceStatus {
  return current;
}

export function getFetchTraceFailureReason(): string | null {
  return failureReason;
}

export function setFetchTraceStatus(next: FetchTraceStatus, reason?: string | null): void {
  current = next;
  failureReason = reason ?? null;
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function subscribeFetchTraceStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
