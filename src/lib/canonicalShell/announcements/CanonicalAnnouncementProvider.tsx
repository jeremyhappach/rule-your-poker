/**
 * CanonicalAnnouncementProvider — shell-owned announcement orchestration.
 *
 * Responsibilities:
 *   - Receives semantic events via `emit()` (see useAnnouncements).
 *   - Scoped, boundary-aware dedupe — NOT a forever-seen Map.
 *     Seen-ids are bucketed by current (dealerGameId, roundId) scope
 *     and dropped when the scope changes.
 *   - Queue with priority preemption: higher-priority events become
 *     active immediately, displacing the current visible event.
 *     Replaced events are NOT requeued (preemption, not interruption).
 *   - 'replace' behavior for stateful types (waiting/configuring): a
 *     new event of the same type updates in place instead of stacking.
 *   - Boundary teardown: when shell scope (dealerGameId or roundId)
 *     changes, drop any queued/active events whose scope no longer
 *     matches, AND reset the seen-id buckets for the departing scope.
 *
 * Scope source: derived from PersistentTableShell context (gameId =
 * dealerGameId). Game.tsx is NOT involved — provider is shell-owned.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_BEHAVIOR,
  DEFAULT_PRIORITY,
  DEFAULT_TTL_MS,
  type AnnouncementEvent,
  type AnnouncementScope,
  type AnnouncementType,
} from './types';

interface ResolvedAnnouncement extends AnnouncementEvent {
  resolvedPriority: number;
  resolvedBehavior: 'enqueue' | 'replace';
  enqueuedAt: number;
}

interface AnnouncementContextValue {
  active: ResolvedAnnouncement | null;
  emit: (event: AnnouncementEvent) => void;
  dismiss: (id: string) => void;
  clearScope: (scope: AnnouncementScope) => void;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

export interface CanonicalAnnouncementProviderProps {
  /** Current dealerGameId from shell. null = no active dealer game. */
  dealerGameId?: string | null;
  /** Optional roundId for round-scoped dedupe. */
  roundId?: string | null;
  children: ReactNode;
}

function scopeMatches(eventScope: AnnouncementScope, current: AnnouncementScope): boolean {
  // Event with no scope keys is ambient — survives all boundaries.
  const wantsDealer = eventScope.dealerGameId !== undefined;
  const wantsRound = eventScope.roundId !== undefined;
  if (!wantsDealer && !wantsRound) return true;
  if (wantsDealer && eventScope.dealerGameId !== current.dealerGameId) return false;
  if (wantsRound && eventScope.roundId !== current.roundId) return false;
  return true;
}

function resolve(event: AnnouncementEvent): ResolvedAnnouncement {
  return {
    ...event,
    resolvedPriority: event.priority ?? DEFAULT_PRIORITY[event.type] ?? 0,
    resolvedBehavior: event.behavior ?? DEFAULT_BEHAVIOR[event.type] ?? 'enqueue',
    ttlMs: event.ttlMs ?? DEFAULT_TTL_MS[event.type],
    enqueuedAt: Date.now(),
  };
}

export function CanonicalAnnouncementProvider({
  dealerGameId = null,
  roundId = null,
  children,
}: CanonicalAnnouncementProviderProps) {
  const currentScope = useMemo<AnnouncementScope>(
    () => ({ dealerGameId, roundId }),
    [dealerGameId, roundId],
  );

  // Queue (excluding the active event). Sorted by priority on insert.
  const queueRef = useRef<ResolvedAnnouncement[]>([]);
  const [active, setActive] = useState<ResolvedAnnouncement | null>(null);

  // Scoped seen-id buckets. Key = scope signature.
  // When scope changes, the OLD bucket is discarded, so re-emits of the
  // same id under a new scope are NOT deduped.
  const seenRef = useRef<Map<string, Set<string>>>(new Map());
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scopeKey = useCallback((s: AnnouncementScope) => {
    return `${s.dealerGameId ?? 'null'}::${s.roundId ?? 'null'}`;
  }, []);

  const clearTtl = useCallback(() => {
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current);
      ttlTimerRef.current = null;
    }
  }, []);

  const promoteNext = useCallback(() => {
    clearTtl();
    const queue = queueRef.current;
    // Drop any queued events whose scope is no longer current.
    while (queue.length > 0 && !scopeMatches(queue[0].scope, currentScope)) {
      queue.shift();
    }
    const next = queue.shift() ?? null;
    setActive(next);
    if (next?.ttlMs && next.ttlMs > 0) {
      const id = next.id;
      ttlTimerRef.current = setTimeout(() => {
        ttlTimerRef.current = null;
        setActive((cur) => {
          if (cur && cur.id === id) {
            // Promote next on next tick to avoid setState-in-setState.
            queueMicrotask(promoteNext);
            return null;
          }
          return cur;
        });
      }, next.ttlMs);
    }
  }, [clearTtl, currentScope]);

  const emit = useCallback(
    (event: AnnouncementEvent) => {
      // Reject events whose scope is already stale.
      if (!scopeMatches(event.scope, currentScope)) {
        return;
      }
      const resolved = resolve(event);

      // Scoped dedupe.
      const bucketKey = scopeKey(currentScope);
      let bucket = seenRef.current.get(bucketKey);
      if (!bucket) {
        bucket = new Set();
        seenRef.current.set(bucketKey, bucket);
      }
      if (bucket.has(event.id)) {
        // Already seen in this scope — idempotent no-op.
        return;
      }
      bucket.add(event.id);

      // Replace behavior: collapse same-type entries.
      if (resolved.resolvedBehavior === 'replace') {
        queueRef.current = queueRef.current.filter((q) => q.type !== resolved.type);
        if (active && active.type === resolved.type) {
          // Update active in place if same type.
          clearTtl();
          setActive(resolved);
          if (resolved.ttlMs && resolved.ttlMs > 0) {
            const id = resolved.id;
            ttlTimerRef.current = setTimeout(() => {
              ttlTimerRef.current = null;
              setActive((cur) => {
                if (cur && cur.id === id) {
                  queueMicrotask(promoteNext);
                  return null;
                }
                return cur;
              });
            }, resolved.ttlMs);
          }
          return;
        }
      }

      // Priority preemption: if higher-priority than active, displace.
      if (active && resolved.resolvedPriority > active.resolvedPriority) {
        clearTtl();
        // Active is dropped (preempted) — not requeued.
        setActive(resolved);
        if (resolved.ttlMs && resolved.ttlMs > 0) {
          const id = resolved.id;
          ttlTimerRef.current = setTimeout(() => {
            ttlTimerRef.current = null;
            setActive((cur) => {
              if (cur && cur.id === id) {
                queueMicrotask(promoteNext);
                return null;
              }
              return cur;
            });
          }, resolved.ttlMs);
        }
        return;
      }

      // No active → become active.
      if (!active) {
        setActive(resolved);
        if (resolved.ttlMs && resolved.ttlMs > 0) {
          const id = resolved.id;
          ttlTimerRef.current = setTimeout(() => {
            ttlTimerRef.current = null;
            setActive((cur) => {
              if (cur && cur.id === id) {
                queueMicrotask(promoteNext);
                return null;
              }
              return cur;
            });
          }, resolved.ttlMs);
        }
        return;
      }

      // Enqueue, sorted by priority desc, then FIFO.
      const q = queueRef.current;
      let insertAt = q.length;
      for (let i = 0; i < q.length; i++) {
        if (resolved.resolvedPriority > q[i].resolvedPriority) {
          insertAt = i;
          break;
        }
      }
      q.splice(insertAt, 0, resolved);
    },
    [active, clearTtl, currentScope, promoteNext, scopeKey],
  );

  const dismiss = useCallback(
    (id: string) => {
      setActive((cur) => {
        if (cur && cur.id === id) {
          queueMicrotask(promoteNext);
          return null;
        }
        return cur;
      });
      queueRef.current = queueRef.current.filter((q) => q.id !== id);
    },
    [promoteNext],
  );

  const clearScope = useCallback(
    (scope: AnnouncementScope) => {
      queueRef.current = queueRef.current.filter((q) => !scopeMatches(q.scope, scope));
      // Drop the seen-bucket for that scope.
      seenRef.current.delete(scopeKey(scope));
      setActive((cur) => {
        if (cur && scopeMatches(cur.scope, scope)) {
          queueMicrotask(promoteNext);
          return null;
        }
        return cur;
      });
    },
    [promoteNext, scopeKey],
  );

  // Boundary teardown: when scope changes, drop stale events and reset
  // dedupe buckets that are no longer current.
  const prevScopeRef = useRef<AnnouncementScope>(currentScope);
  useEffect(() => {
    const prev = prevScopeRef.current;
    const sameDealer = prev.dealerGameId === currentScope.dealerGameId;
    const sameRound = prev.roundId === currentScope.roundId;
    if (sameDealer && sameRound) return;

    // Drop active/queued events that no longer match new scope.
    queueRef.current = queueRef.current.filter((q) => scopeMatches(q.scope, currentScope));
    setActive((cur) => {
      if (cur && !scopeMatches(cur.scope, currentScope)) {
        clearTtl();
        queueMicrotask(promoteNext);
        return null;
      }
      return cur;
    });

    // Reset stale dedupe buckets — keep only the bucket for the new scope.
    const keepKey = scopeKey(currentScope);
    for (const k of Array.from(seenRef.current.keys())) {
      if (k !== keepKey) seenRef.current.delete(k);
    }

    prevScopeRef.current = currentScope;
  }, [currentScope, clearTtl, promoteNext, scopeKey]);

  useEffect(() => () => clearTtl(), [clearTtl]);

  const value = useMemo<AnnouncementContextValue>(
    () => ({ active, emit, dismiss, clearScope }),
    [active, emit, dismiss, clearScope],
  );

  return (
    <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>
  );
}

export function useAnnouncementContext(): AnnouncementContextValue | null {
  return useContext(AnnouncementContext);
}

export function useAnnouncements() {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) {
    // Safe no-op outside provider — keeps gameplay surfaces resilient.
    return {
      emit: () => {},
      dismiss: () => {},
      clearScope: () => {},
    };
  }
  return { emit: ctx.emit, dismiss: ctx.dismiss, clearScope: ctx.clearScope };
}

// Re-export for tests / debug trigger.
export type { AnnouncementType };
