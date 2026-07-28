/**
 * Runtime status of the 3-5-7 fetch-trace instrumentation.
 *
 * Two-stage readiness contract:
 *
 *   'pending' → initial
 *   'loaded'  → 357.fetch.instrumentation_loaded heartbeat write resolved OK
 *   'ready'   → at least one 357.fetch.invocation AND its matching
 *               357.fetch.outcome (same fetchGenerationId) both had
 *               their persistence callbacks resolve OK in this session
 *   'failed'  → any persistence callback resolved with an error
 *
 * READY is *never* set purely from the heartbeat. That was the
 * previous false-positive: the heartbeat is 'invariant' and always
 * writes, but the fetch lifecycle events were gated in production.
 * With the gate fixed we still require a proven matched pair.
 */

export type FetchTraceStatus = 'pending' | 'loaded' | 'ready' | 'failed';

export const FETCH_INSTRUMENTATION_VERSION = 'v2';

let current: FetchTraceStatus = 'pending';
let failureReason: string | null = null;
const listeners = new Set<() => void>();

// Per-generation write acknowledgements, so we only flip to 'ready'
// when the SAME fetchGenerationId has both an invocation-write and
// an outcome-write confirmed by the persistence layer.
const invocationAcks = new Set<number>();
const outcomeAcks = new Set<number>();
let matchedPairSeen = false;

function notify(): void {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function getFetchTraceStatus(): FetchTraceStatus {
  return current;
}

export function getFetchTraceFailureReason(): string | null {
  return failureReason;
}

export function setFetchTraceStatus(next: FetchTraceStatus, reason?: string | null): void {
  current = next;
  failureReason = reason ?? null;
  notify();
}

/** Called by Game.tsx when the heartbeat write callback resolves. */
export function markHeartbeatResult(ok: boolean, reason?: string | null): void {
  if (!ok) {
    current = 'failed';
    failureReason = reason ?? 'heartbeat_failed';
    notify();
    return;
  }
  // Only advance to 'loaded' if we haven't already reached 'ready'.
  if (current !== 'ready') {
    current = 'loaded';
    failureReason = null;
    notify();
  }
}

/** Called by Game.tsx when the 357.fetch.invocation write callback resolves. */
export function markInvocationAck(fetchGenerationId: number, ok: boolean, reason?: string | null): void {
  if (!ok) {
    current = 'failed';
    failureReason = reason ?? 'invocation_write_failed';
    notify();
    return;
  }
  invocationAcks.add(fetchGenerationId);
  maybePromoteToReady(fetchGenerationId);
}

/** Called by Game.tsx when the 357.fetch.outcome write callback resolves. */
export function markOutcomeAck(fetchGenerationId: number, ok: boolean, reason?: string | null): void {
  if (!ok) {
    current = 'failed';
    failureReason = reason ?? 'outcome_write_failed';
    notify();
    return;
  }
  outcomeAcks.add(fetchGenerationId);
  maybePromoteToReady(fetchGenerationId);
}

function maybePromoteToReady(fetchGenerationId: number): void {
  if (matchedPairSeen) return;
  if (invocationAcks.has(fetchGenerationId) && outcomeAcks.has(fetchGenerationId)) {
    matchedPairSeen = true;
    current = 'ready';
    failureReason = null;
    notify();
  }
}

export function subscribeFetchTraceStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
