/**
 * Runtime status of the 3-5-7 fetch-trace instrumentation.
 *
 * Two-stage readiness contract, scoped **per mounted Game instance**:
 *
 *   'pending' → session just began, no heartbeat yet
 *   'loaded'  → heartbeat write for THIS session resolved OK
 *   'ready'   → THIS session has persisted at least one matched
 *               invocation/outcome pair (same fetchGenerationId, both
 *               onResult callbacks resolved OK)
 *   'failed'  → a persistence callback for THIS session resolved with
 *               an error
 *
 * A "session" is a Game mount. Game.tsx calls `beginFetchTraceSession`
 * with the current gameId (or any stable per-mount key) as soon as it
 * renders. That clears the previous mount's ack accounting so the
 * pill accurately reflects THIS mount, not a stale historical latch.
 */

export type FetchTraceStatus = 'pending' | 'loaded' | 'ready' | 'failed';

export const FETCH_INSTRUMENTATION_VERSION = 'v3';

let current: FetchTraceStatus = 'pending';
let failureReason: string | null = null;
const listeners = new Set<() => void>();

// Per-session ack accounting. Cleared on every beginFetchTraceSession.
let currentSessionKey: string | null = null;
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

export function getFetchTraceSessionKey(): string | null {
  return currentSessionKey;
}

/**
 * Called by Game.tsx once per mounted instance (idempotent per key).
 * Resets ack accounting so READY reflects only THIS mount's pair.
 * Acks that arrive tagged with a different sessionKey are ignored.
 */
export function beginFetchTraceSession(sessionKey: string): void {
  if (currentSessionKey === sessionKey) return;
  currentSessionKey = sessionKey;
  invocationAcks.clear();
  outcomeAcks.clear();
  matchedPairSeen = false;
  current = 'pending';
  failureReason = null;
  notify();
}

export function setFetchTraceStatus(next: FetchTraceStatus, reason?: string | null): void {
  current = next;
  failureReason = reason ?? null;
  notify();
}

/** Called by Game.tsx when the heartbeat write callback resolves. */
export function markHeartbeatResult(
  sessionKey: string | null,
  ok: boolean,
  reason?: string | null,
): void {
  if (sessionKey !== null && sessionKey !== currentSessionKey) return; // stale mount
  if (!ok) {
    current = 'failed';
    failureReason = reason ?? 'heartbeat_failed';
    notify();
    return;
  }
  if (current !== 'ready') {
    current = 'loaded';
    failureReason = null;
    notify();
  }
}

/** Called by Game.tsx when the 357.fetch.invocation write callback resolves. */
export function markInvocationAck(
  sessionKey: string | null,
  fetchGenerationId: number,
  ok: boolean,
  reason?: string | null,
): void {
  if (sessionKey !== null && sessionKey !== currentSessionKey) return; // stale mount
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
export function markOutcomeAck(
  sessionKey: string | null,
  fetchGenerationId: number,
  ok: boolean,
  reason?: string | null,
): void {
  if (sessionKey !== null && sessionKey !== currentSessionKey) return; // stale mount
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
