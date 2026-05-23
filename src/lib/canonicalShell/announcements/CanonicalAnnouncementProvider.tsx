/**
 * CanonicalAnnouncementProvider — shell-owned announcement orchestration.
 *
 * Two-track model:
 *
 *  Transient track:
 *    - Priority queue of discrete event bursts (match_win, round_win,
 *      chip_award). Higher priority preempts current transient (preempted
 *      transient is dropped, not requeued).
 *    - Auto-dismissed by TTL; on dismiss, next transient promotes.
 *    - Scoped, boundary-aware dedupe by event id (NOT a forever Map).
 *
 *  Ambient track:
 *    - Single slot for persistent contextual state (dealer_configuring,
 *      waiting_for_*, dealer_selection_in_progress).
 *    - Latest ambient replaces prior ambient (no stacking).
 *    - No TTL — persists until superseded, explicitly cleared, or
 *      scope boundary teardown.
 *    - Transient events render OVER ambient. When transient ends,
 *      ambient is still there and renders again — observers never
 *      stare at unexplained felt.
 *
 * Boundary teardown:
 *    When shell scope (dealerGameId or roundId) changes, drop active /
 *    queued / ambient events whose scope no longer matches, and reset
 *    the seen-id dedupe buckets for departing scopes.
 *
 * Scope source: derived from PersistentTableShell (gameId =
 * dealerGameId). Game.tsx is not involved — provider is shell-owned.
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
  isAmbientBehavior,
  type AnnouncementBehavior,
  type AnnouncementEvent,
  type AnnouncementScope,
  type AnnouncementType,
} from './types';
import { persistRailTelemetry } from './railTelemetry';

interface ResolvedAnnouncement extends AnnouncementEvent {
  resolvedPriority: number;
  resolvedBehavior: AnnouncementBehavior;
  enqueuedAt: number;
}

interface AnnouncementContextValue {
  /** Currently visible event — transient (if any) wins, else ambient. */
  active: ResolvedAnnouncement | null;
  /** Underlying ambient state, exposed for diagnostics/tests. */
  ambient: ResolvedAnnouncement | null;
  /** Currently visible transient burst, if any. */
  transient: ResolvedAnnouncement | null;
  /**
   * Authenticated viewer's user id, threaded by PersistentTableShell.
   * Used by the rail layer to gate actor-only events (cta_prompt).
   * Null in unauthenticated / pre-login surfaces and in tests that do
   * not set it.
   */
  viewerUserId: string | null;
  emit: (event: AnnouncementEvent) => void;
  dismiss: (id: string) => void;
  clearScope: (scope: AnnouncementScope) => void;
  /** Explicitly clear ambient (e.g. game leaves a passive phase). */
  clearAmbient: (type?: AnnouncementType) => void;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

export interface CanonicalAnnouncementProviderProps {
  dealerGameId?: string | null;
  roundId?: string | null;
  /**
   * Authenticated viewer's user id. Threaded so the rail layer can
   * enforce actor-only visibility on cta_prompt events. Null is safe:
   * a cta_prompt whose payload carries actorUserId will be suppressed
   * (defense in depth — emitters are also expected to only fire on
   * the actor's own client).
   */
  viewerUserId?: string | null;
  children: ReactNode;
}

function scopeMatches(eventScope: AnnouncementScope, current: AnnouncementScope): boolean {
  // dealerGameId: enforce equality whenever the event specifies one.
  // null/undefined on the event side = unscoped (matches any dealerGame).
  if (eventScope.dealerGameId != null) {
    if (eventScope.dealerGameId !== current.dealerGameId) return false;
  }
  // roundId: only enforce equality when BOTH sides specify a non-null value.
  // The shell-owned provider is mounted with roundId=null (dealerGame-scoped
  // ownership boundary). Per-game emits often carry a finer roundId for
  // future-proofing; treating the provider's null as a wildcard at this
  // dimension preserves the dealerGame-only contract and prevents silent
  // drops of round-scoped events like `match_win` / `waiting_for_player`.
  if (eventScope.roundId != null && current.roundId != null) {
    if (eventScope.roundId !== current.roundId) return false;
  }
  return true;
}

function resolve(event: AnnouncementEvent): ResolvedAnnouncement {
  const behavior = event.behavior ?? DEFAULT_BEHAVIOR[event.type] ?? 'enqueue';
  return {
    ...event,
    resolvedPriority: event.priority ?? DEFAULT_PRIORITY[event.type] ?? 0,
    resolvedBehavior: behavior,
    ttlMs: isAmbientBehavior(behavior) ? undefined : event.ttlMs ?? DEFAULT_TTL_MS[event.type],
    enqueuedAt: Date.now(),
  };
}

export function CanonicalAnnouncementProvider({
  dealerGameId = null,
  roundId = null,
  viewerUserId = null,
  children,
}: CanonicalAnnouncementProviderProps) {
  const currentScope = useMemo<AnnouncementScope>(
    () => ({ dealerGameId, roundId }),
    [dealerGameId, roundId],
  );

  // --- Transient track ---
  const queueRef = useRef<ResolvedAnnouncement[]>([]);
  const [transient, setTransient] = useState<ResolvedAnnouncement | null>(null);
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Ambient track ---
  const [ambient, setAmbient] = useState<ResolvedAnnouncement | null>(null);

  // --- Scoped dedupe (transient only) ---
  const seenRef = useRef<Map<string, Set<string>>>(new Map());

  const scopeKey = useCallback(
    (s: AnnouncementScope) => `${s.dealerGameId ?? 'null'}::${s.roundId ?? 'null'}`,
    [],
  );

  const clearTtl = useCallback(() => {
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current);
      ttlTimerRef.current = null;
    }
  }, []);

  const armTtl = useCallback((next: ResolvedAnnouncement) => {
    if (!next.ttlMs || next.ttlMs <= 0) return;
    const id = next.id;
    ttlTimerRef.current = setTimeout(() => {
      ttlTimerRef.current = null;
      setTransient((cur) => {
        if (cur && cur.id === id) {
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
    }, next.ttlMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promoteNextTransient = useCallback(() => {
    clearTtl();
    const queue = queueRef.current;
    while (queue.length > 0 && !scopeMatches(queue[0].scope, currentScope)) {
      queue.shift();
    }
    const next = queue.shift() ?? null;
    setTransient(next);
    if (next) armTtl(next);
  }, [clearTtl, currentScope, armTtl]);

  const emit = useCallback(
    (event: AnnouncementEvent) => {
      if (!scopeMatches(event.scope, currentScope)) {
        persistRailTelemetry({
          eventName: 'rail-emit-rejected',
          severity: 'warn',
          announcementId: event.id,
          announcementType: event.type,
          emittedScope: event.scope,
          providerScope: currentScope,
          reason: 'scope-mismatch',
        });
        return;
      }
      const resolved = resolve(event);
      persistRailTelemetry({
        eventName: 'rail-emit-accepted',
        announcementId: event.id,
        announcementType: event.type,
        behavior: resolved.resolvedBehavior,
        emittedScope: event.scope,
        providerScope: currentScope,
        actorUserId:
          (event.payload as { actorUserId?: string } | undefined)?.actorUserId ?? null,
        extra: { priority: resolved.resolvedPriority, ttlMs: resolved.ttlMs ?? null },
      });

      // ---- Ambient path: dedicated slot, replaces prior ambient. ----
      if (isAmbientBehavior(resolved.resolvedBehavior)) {
        setAmbient((prev) => {
          // Same id refresh → keep existing (idempotent no-op for identity).
          if (prev && prev.id === resolved.id && prev.type === resolved.type) {
            // Update payload if changed.
            return { ...prev, ...resolved };
          }
          return resolved;
        });
        return;
      }

      // ---- Transient path: scoped dedupe + priority queue. ----
      const bucketKey = scopeKey(currentScope);
      let bucket = seenRef.current.get(bucketKey);
      if (!bucket) {
        bucket = new Set();
        seenRef.current.set(bucketKey, bucket);
      }
      if (bucket.has(event.id)) return; // idempotent
      bucket.add(event.id);

      // Preempt current transient if higher priority.
      if (transient && resolved.resolvedPriority > transient.resolvedPriority) {
        clearTtl();
        setTransient(resolved);
        armTtl(resolved);
        return;
      }

      // No active transient → become active.
      if (!transient) {
        setTransient(resolved);
        armTtl(resolved);
        return;
      }

      // Otherwise enqueue priority-desc, FIFO within tie.
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
    [currentScope, transient, clearTtl, armTtl, scopeKey],
  );

  const dismiss = useCallback(
    (id: string) => {
      let matchedTransient = false;
      let matchedAmbient = false;
      setTransient((cur) => {
        if (cur && cur.id === id) {
          matchedTransient = true;
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
      setAmbient((cur) => {
        if (cur && cur.id === id) {
          matchedAmbient = true;
          return null;
        }
        return cur;
      });
      queueRef.current = queueRef.current.filter((q) => q.id !== id);
      persistRailTelemetry({
        eventName: 'rail-dismiss',
        announcementId: id,
        providerScope: currentScope,
        extra: { matchedTransient, matchedAmbient },
      });
    },
    [promoteNextTransient, currentScope],
  );

  const clearAmbient = useCallback(
    (type?: AnnouncementType) => {
      let clearedId: string | null = null;
      let clearedType: AnnouncementType | null = null;
      setAmbient((cur) => {
        if (!cur) return null;
        if (type && cur.type !== type) return cur;
        clearedId = cur.id;
        clearedType = cur.type;
        return null;
      });
      persistRailTelemetry({
        eventName: 'rail-clear-ambient',
        announcementId: clearedId,
        announcementType: clearedType,
        providerScope: currentScope,
        reason: type ? `type-scoped:${type}` : 'broad',
      });
    },
    [currentScope],
  );

  const clearScope = useCallback(
    (scope: AnnouncementScope) => {
      queueRef.current = queueRef.current.filter((q) => !scopeMatches(q.scope, scope));
      seenRef.current.delete(scopeKey(scope));
      setTransient((cur) => {
        if (cur && scopeMatches(cur.scope, scope)) {
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
      setAmbient((cur) => (cur && scopeMatches(cur.scope, scope) ? null : cur));
    },
    [promoteNextTransient, scopeKey],
  );

  // Boundary teardown.
  const prevScopeRef = useRef<AnnouncementScope>(currentScope);
  useEffect(() => {
    const prev = prevScopeRef.current;
    if (
      prev.dealerGameId === currentScope.dealerGameId &&
      prev.roundId === currentScope.roundId
    ) {
      return;
    }

    queueRef.current = queueRef.current.filter((q) => scopeMatches(q.scope, currentScope));
    setTransient((cur) => {
      if (cur && !scopeMatches(cur.scope, currentScope)) {
        clearTtl();
        queueMicrotask(promoteNextTransient);
        return null;
      }
      return cur;
    });
    setAmbient((cur) => (cur && !scopeMatches(cur.scope, currentScope) ? null : cur));

    const keepKey = scopeKey(currentScope);
    for (const k of Array.from(seenRef.current.keys())) {
      if (k !== keepKey) seenRef.current.delete(k);
    }

    prevScopeRef.current = currentScope;
  }, [currentScope, clearTtl, promoteNextTransient, scopeKey]);

  useEffect(() => () => clearTtl(), [clearTtl]);

  // Active = transient if present, else ambient.
  const active = transient ?? ambient;

  const value = useMemo<AnnouncementContextValue>(
    () => ({ active, ambient, transient, viewerUserId, emit, dismiss, clearScope, clearAmbient }),
    [active, ambient, transient, viewerUserId, emit, dismiss, clearScope, clearAmbient],
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
    // Fail loudly: a rail semantic event was emitted without canonical
    // shell rail ownership. In dev this throws so the wiring gap is
    // caught at the call site. In production we degrade to no-ops to
    // avoid bricking the surface, but warn once per session.
    if (import.meta.env?.DEV) {
      throw new Error(
        '[canonical-rail] useAnnouncements() called outside CanonicalAnnouncementProvider. ' +
          'Rail semantic events require shell ownership — mount PersistentTableShell above this tree.',
      );
    }
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __canonicalRailWarned?: boolean };
      if (!w.__canonicalRailWarned) {
        w.__canonicalRailWarned = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[canonical-rail] useAnnouncements() used without provider; emits will no-op.',
        );
      }
    }
    return {
      emit: () => {},
      dismiss: () => {},
      clearScope: () => {},
      clearAmbient: () => {},
    };
  }
  return {
    emit: ctx.emit,
    dismiss: ctx.dismiss,
    clearScope: ctx.clearScope,
    clearAmbient: ctx.clearAmbient,
  };
}

export type { AnnouncementType };
