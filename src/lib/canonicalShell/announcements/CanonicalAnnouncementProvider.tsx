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
import { recordAnnouncementDebugEvent } from './announcementDebugLog';

const traceAnnouncementRuntime = (event: string, payload: Record<string, unknown> = {}) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get('trace_gin_announcements') === '1' ||
      window.localStorage.getItem('ptp_trace_gin_announcements') === '1';
    if (!enabled) return;
    console.log('[ANN_RUNTIME_TRACE]', event, {
      t: Math.round(performance.now()),
      ...payload,
    });
  } catch {
    // no-op: diagnostic only
  }
};

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
  /**
   * Resolve when the transient with `id` leaves the active slot (TTL,
   * dismissal, preemption, or scope teardown). If the event is not
   * active and not queued at call time, resolves immediately. Intended
   * for sequencing a follow-up action behind an announcement's actual
   * lifecycle — avoids duplicating TTL constants at call sites.
   */
  waitForDismiss: (id: string) => Promise<void>;
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

  // --- waitForDismiss support ---
  // Resolvers waiting for a specific transient id to leave the active slot.
  // Drained whenever a transient with that id is removed for any reason
  // (TTL, dismiss, preemption, scope teardown). Minimal: no public broadcast,
  // no per-event lifecycle bus — just enough to gate one follow-up action.
  const pendingDismissRef = useRef<Map<string, Array<() => void>>>(new Map());
  // Synchronous mirror of current transient id, so waitForDismiss called
  // immediately after emit() can see the post-emit state without waiting
  // for React to flush.
  const transientIdRef = useRef<string | null>(null);

  const drainDismiss = useCallback((id: string) => {
    const list = pendingDismissRef.current.get(id);
    if (!list) return;
    pendingDismissRef.current.delete(id);
    for (const resolve of list) resolve();
  }, []);


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
    const type = next.type;
    const ttlMs = next.ttlMs;
    ttlTimerRef.current = setTimeout(() => {
      ttlTimerRef.current = null;
      setTransient((cur) => {
        if (cur && cur.id === id) {
          recordAnnouncementDebugEvent(
            'lifecycle',
            `ttl-expired ${type} id=${id.slice(0, 8)}`,
            { stage: 'ttl-expired', id, type, ttlMs },
          );
          transientIdRef.current = null;
          drainDismiss(id);
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
    }, next.ttlMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drainDismiss]);

  const promoteNextTransient = useCallback(() => {
    const queue = queueRef.current;
    const beforeLen = queue.length;
    const candidates = queue.map((q) => ({
      id: q.id.slice(0, 8), type: q.type, priority: q.resolvedPriority,
    }));
    const mwInQueue = queue.find((q) => q.type === 'match_win') ?? null;
    recordAnnouncementDebugEvent(
      'lifecycle',
      `promotion-pass-start qlen=${beforeLen} transientRef=${transientIdRef.current?.slice(0,8) ?? 'null'}`,
      {
        stage: 'promotion-pass-start',
        queueLen: beforeLen,
        candidates,
        transientIdRef: transientIdRef.current,
        matchWinInQueue: mwInQueue ? { id: mwInQueue.id } : null,
        currentScope,
      },
    );

    // Ownership guard: a promotion task is "owned" by the slot state
    // it was scheduled to follow up on. If the slot has since been
    // taken by a newer transient (e.g. a preempt that ran between
    // the scheduling of this microtask and its execution), we must
    // not touch the slot or the TTL timer — both belong to the new
    // owner. Bail before clearTtl/setTransient so we don't clobber
    // the in-flight transient or cancel its TTL.
    if (transientIdRef.current != null && queue.length === 0) {
      recordAnnouncementDebugEvent(
        'lifecycle',
        `promotion-skip-stale transientRef=${transientIdRef.current.slice(0,8)}`,
        {
          stage: 'promotion-skip-stale',
          reason: 'slot-owned-by-newer-transient',
          transientIdRef: transientIdRef.current,
        },
      );
      return;
    }

    clearTtl();
    while (queue.length > 0 && !scopeMatches(queue[0].scope, currentScope)) {
      const dropped = queue.shift()!;
      recordAnnouncementDebugEvent(
        'lifecycle',
        `promotion-drop-scope ${dropped.type} id=${dropped.id.slice(0, 8)}`,
        { stage: 'promotion-drop-scope', id: dropped.id, type: dropped.type, scope: dropped.scope, currentScope },
      );
      drainDismiss(dropped.id);
    }
    const next = queue.shift() ?? null;
    if (next) {
      recordAnnouncementDebugEvent(
        'lifecycle',
        `promotion-selected ${next.type} id=${next.id.slice(0, 8)}`,
        { stage: 'promotion-selected', id: next.id, type: next.type, priority: next.resolvedPriority },
      );
    } else {
      recordAnnouncementDebugEvent(
        'lifecycle',
        `promotion-none transientRef=${transientIdRef.current?.slice(0,8) ?? 'null'}`,
        {
          stage: 'promotion-none',
          transientIdRef: transientIdRef.current,
        },
      );
    }
    transientIdRef.current = next?.id ?? null;
    setTransient((prev) => {
      // Second-line ownership guard at update time: if the slot has
      // a value but the queue produced no successor, only clear if
      // the slot is still the one we expected. Otherwise a newer
      // transient was installed between scheduling and apply — leave
      // it alone.
      if (prev && !next) {
        recordAnnouncementDebugEvent(
          'lifecycle',
          `promotion-clear ${prev.type}→null id=${prev.id.slice(0,8)}`,
          {
            stage: 'promotion-clear',
            prev: { id: prev.id, type: prev.type, priority: prev.resolvedPriority },
          },
        );
      } else if (prev && next && prev.id !== next.id) {
        recordAnnouncementDebugEvent(
          'lifecycle',
          `promotion-replace ${prev.type}→${next.type}`,
          {
            stage: 'promotion-replace',
            prev: { id: prev.id, type: prev.type },
            next: { id: next.id, type: next.type },
          },
        );
      }
      return next;
    });
    if (next) armTtl(next);
  }, [clearTtl, currentScope, armTtl, drainDismiss]);


  const emit = useCallback(
    (event: AnnouncementEvent) => {
      const isMW = event.type === 'match_win';
      recordAnnouncementDebugEvent(
        'lifecycle',
        `emit-requested ${event.type} id=${event.id.slice(0, 8)}`,
        {
          stage: 'emit-requested', type: event.type, id: event.id,
          scope: event.scope, currentScope, isMatchWin: isMW,
        },
      );
      if (!scopeMatches(event.scope, currentScope)) {
        traceAnnouncementRuntime('emit:dropped:scope-mismatch', {
          id: event.id, type: event.type, eventScope: event.scope, currentScope,
        });
        recordAnnouncementDebugEvent(
          'lifecycle',
          `emit-rejected ${event.type} reason=scope-mismatch`,
          { stage: 'emit-rejected', reason: 'scope-mismatch', id: event.id, type: event.type, eventScope: event.scope, currentScope },
        );
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[canonical-rail] emit dropped — scope mismatch', {
            id: event.id, type: event.type, eventScope: event.scope, currentScope,
          });
        }
        return;
      }
      const resolved = resolve(event);
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[canonical-rail] emit', {
          id: event.id, type: event.type, behavior: resolved.resolvedBehavior,
        });
      }
      recordAnnouncementDebugEvent('emit', `${event.type} id=${event.id.slice(0,8)} (${resolved.resolvedBehavior})`, {
        type: event.type, id: event.id, behavior: resolved.resolvedBehavior,
        priority: resolved.resolvedPriority, scope: resolved.scope,
      });

      // ---- Ambient path: dedicated slot, replaces prior ambient. ----
      if (isAmbientBehavior(resolved.resolvedBehavior)) {
        traceAnnouncementRuntime('emit:accepted:ambient', {
          id: resolved.id, type: resolved.type, scope: resolved.scope,
        });
        recordAnnouncementDebugEvent(
          'lifecycle',
          `emit-accepted-ambient ${resolved.type} id=${resolved.id.slice(0, 8)}`,
          { stage: 'emit-accepted-ambient', id: resolved.id, type: resolved.type },
        );
        setAmbient((prev) => {
          if (prev && prev.id === resolved.id && prev.type === resolved.type) {
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
      if (bucket.has(event.id)) {
        recordAnnouncementDebugEvent(
          'lifecycle',
          `emit-rejected ${event.type} reason=dedupe id=${event.id.slice(0, 8)}`,
          { stage: 'emit-rejected', reason: 'dedupe', id: event.id, type: event.type, bucketKey },
        );
        return;
      }
      bucket.add(event.id);

      traceAnnouncementRuntime('emit:accepted:transient', {
        id: resolved.id, type: resolved.type, scope: resolved.scope,
        priority: resolved.resolvedPriority,
        hasActiveTransient: !!transient, activeTransientId: transient?.id ?? null,
      });
      recordAnnouncementDebugEvent(
        'lifecycle',
        `emit-accepted-transient ${resolved.type} id=${resolved.id.slice(0, 8)} pri=${resolved.resolvedPriority}`,
        {
          stage: 'emit-accepted-transient', id: resolved.id, type: resolved.type,
          priority: resolved.resolvedPriority,
          activeTransient: transient ? { id: transient.id, type: transient.type, priority: transient.resolvedPriority } : null,
          ambient: ambient ? { id: ambient.id, type: ambient.type } : null,
          queueLenBefore: queueRef.current.length,
        },
      );

      // Preempt current transient if higher priority.
      if (transient && resolved.resolvedPriority > transient.resolvedPriority) {
        clearTtl();
        traceAnnouncementRuntime('transient:preempt', {
          droppedId: transient.id, nextId: resolved.id,
        });
        recordAnnouncementDebugEvent(
          'lifecycle',
          `preempt ${transient.type}→${resolved.type} id=${resolved.id.slice(0, 8)}`,
          {
            stage: 'preempt',
            beforeState: {
              transientId: transientIdRef.current,
              transientClosureType: transient.type,
              transientClosurePri: transient.resolvedPriority,
              queueLen: queueRef.current.length,
              queue: queueRef.current.map((q) => ({ id: q.id.slice(0,8), type: q.type, pri: q.resolvedPriority })),
            },
            dropped: { id: transient.id, type: transient.type, priority: transient.resolvedPriority },
            next: { id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority },
          },
        );
        drainDismiss(transient.id);
        transientIdRef.current = resolved.id;
        setTransient((prev) => {
          recordAnnouncementDebugEvent(
            'lifecycle',
            `preempt-apply prev=${prev?.type ?? 'null'}(${prev?.id.slice(0,8) ?? '-'}) → ${resolved.type}(${resolved.id.slice(0,8)})`,
            {
              stage: 'preempt-apply',
              prevAtUpdate: prev ? { id: prev.id, type: prev.type, priority: prev.resolvedPriority } : null,
              next: { id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority },
              transientIdRefAfter: transientIdRef.current,
            },
          );
          return resolved;
        });
        armTtl(resolved);
        return;
      }

      // No active transient → become active.
      if (!transient) {
        recordAnnouncementDebugEvent(
          'lifecycle',
          `promote-immediate ${resolved.type} id=${resolved.id.slice(0, 8)}`,
          { stage: 'promote-immediate', id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority, transientIdRefBefore: transientIdRef.current },
        );
        transientIdRef.current = resolved.id;
        setTransient((prev) => {
          if (prev) {
            recordAnnouncementDebugEvent(
              'lifecycle',
              `promote-immediate-stale-closure prev=${prev.type}(${prev.id.slice(0,8)}) — closure said null`,
              { stage: 'promote-immediate-stale-closure', prev: { id: prev.id, type: prev.type } },
            );
          }
          return resolved;
        });
        armTtl(resolved);
        return;
      }

      // Otherwise enqueue priority-desc, FIFO within tie.
      const q = queueRef.current;
      const lenBefore = q.length;
      let insertAt = q.length;
      for (let i = 0; i < q.length; i++) {
        if (resolved.resolvedPriority > q[i].resolvedPriority) {
          insertAt = i;
          break;
        }
      }
      q.splice(insertAt, 0, resolved);
      const blockedBy = {
        id: transient.id, type: transient.type, priority: transient.resolvedPriority,
        priorityCompare: resolved.resolvedPriority > transient.resolvedPriority
          ? 'gt' : resolved.resolvedPriority === transient.resolvedPriority ? 'eq' : 'lt',
      };
      recordAnnouncementDebugEvent(
        'lifecycle',
        `enqueue ${resolved.type} id=${resolved.id.slice(0, 8)} at=${insertAt} qlen=${lenBefore}→${q.length} blockedBy=${transient.type}`,
        {
          stage: 'enqueue', id: resolved.id, type: resolved.type,
          priority: resolved.resolvedPriority, insertAt,
          queueLenBefore: lenBefore, queueLenAfter: q.length,
          blockedBy,
          queueAfter: q.map((it) => ({ id: it.id.slice(0, 8), type: it.type, priority: it.resolvedPriority })),
        },
      );
    },
    [currentScope, transient, ambient, clearTtl, armTtl, scopeKey, drainDismiss],
  );

  const dismiss = useCallback(
    (id: string) => {
      recordAnnouncementDebugEvent(
        'dismiss',
        `id=${id.slice(0, 8)} transientRef=${transientIdRef.current?.slice(0,8) ?? 'null'} qlen=${queueRef.current.length}`,
        {
          id,
          transientIdRefAtCall: transientIdRef.current,
          queueLenAtCall: queueRef.current.length,
          matchesTransientRef: transientIdRef.current === id,
        },
      );
      setTransient((cur) => {
        const matches = !!(cur && cur.id === id);
        recordAnnouncementDebugEvent(
          'lifecycle',
          `dismiss-setTransient cur=${cur?.type ?? 'null'}(${cur?.id.slice(0,8) ?? '-'}) target=${id.slice(0,8)} match=${matches}`,
          {
            stage: 'dismiss-setTransient',
            curAtUpdate: cur ? { id: cur.id, type: cur.type } : null,
            targetId: id,
            matched: matches,
            wouldClobberMatchWin: !!(cur && cur.type === 'match_win' && cur.id === id),
            staleDismissAfterPreempt: !!(cur && cur.id !== id),
          },
        );
        if (matches) {
          transientIdRef.current = null;
          drainDismiss(id);
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
      setAmbient((cur) => (cur && cur.id === id ? null : cur));
      const filtered: ResolvedAnnouncement[] = [];
      for (const q of queueRef.current) {
        if (q.id === id) drainDismiss(q.id);
        else filtered.push(q);
      }
      queueRef.current = filtered;
    },
    [promoteNextTransient, drainDismiss],
  );


  const clearAmbient = useCallback((type?: AnnouncementType) => {
    recordAnnouncementDebugEvent('clearAmbient', type ?? '(any)', { type: type ?? null });
    setAmbient((cur) => {
      if (!cur) return null;
      if (type && cur.type !== type) return cur;
      return null;
    });
  }, []);

  const clearScope = useCallback(
    (scope: AnnouncementScope) => {
      recordAnnouncementDebugEvent(
        'clearScope',
        `dg=${scope.dealerGameId?.slice(0, 8) ?? 'null'} r=${scope.roundId?.slice(0, 8) ?? 'null'}`,
        { scope },
      );
      const kept: ResolvedAnnouncement[] = [];
      for (const q of queueRef.current) {
        if (scopeMatches(q.scope, scope)) drainDismiss(q.id);
        else kept.push(q);
      }
      queueRef.current = kept;
      seenRef.current.delete(scopeKey(scope));
      setTransient((cur) => {
        if (cur && scopeMatches(cur.scope, scope)) {
          transientIdRef.current = null;
          drainDismiss(cur.id);
          queueMicrotask(promoteNextTransient);
          return null;
        }
        return cur;
      });
      setAmbient((cur) => (cur && scopeMatches(cur.scope, scope) ? null : cur));
    },
    [promoteNextTransient, scopeKey, drainDismiss],
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
    recordAnnouncementDebugEvent(
      'scope-change',
      `dg ${prev.dealerGameId?.slice(0,8) ?? 'null'} → ${currentScope.dealerGameId?.slice(0,8) ?? 'null'} / r ${prev.roundId?.slice(0,8) ?? 'null'} → ${currentScope.roundId?.slice(0,8) ?? 'null'}`,
      { prev, next: currentScope },
    );

    const keptQueue: ResolvedAnnouncement[] = [];
    let droppedQueueCount = 0;
    for (const q of queueRef.current) {
      if (scopeMatches(q.scope, currentScope)) keptQueue.push(q);
      else { drainDismiss(q.id); droppedQueueCount++; }
    }
    queueRef.current = keptQueue;
    setTransient((cur) => {
      if (cur && !scopeMatches(cur.scope, currentScope)) {
        recordAnnouncementDebugEvent('scope-teardown', `transient ${cur.type} id=${cur.id.slice(0,8)}`, { id: cur.id, type: cur.type });
        clearTtl();
        transientIdRef.current = null;
        drainDismiss(cur.id);
        queueMicrotask(promoteNextTransient);
        return null;
      }
      return cur;
    });
    setAmbient((cur) => {
      if (cur && !scopeMatches(cur.scope, currentScope)) {
        recordAnnouncementDebugEvent('scope-teardown', `ambient ${cur.type} id=${cur.id.slice(0,8)}`, { id: cur.id, type: cur.type });
        return null;
      }
      return cur;
    });
    if (droppedQueueCount > 0) {
      recordAnnouncementDebugEvent('scope-teardown', `queue dropped ${droppedQueueCount}`, { count: droppedQueueCount });
    }

    const keepKey = scopeKey(currentScope);
    for (const k of Array.from(seenRef.current.keys())) {
      if (k !== keepKey) seenRef.current.delete(k);
    }

    prevScopeRef.current = currentScope;
  }, [currentScope, clearTtl, promoteNextTransient, scopeKey, drainDismiss]);

  useEffect(() => () => clearTtl(), [clearTtl]);

  const waitForDismiss = useCallback((id: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      // Synchronously inspect: if not active and not queued, the event
      // either already drained or was never accepted — resolve now to
      // avoid a hang. This makes the helper safe to call after emit()
      // even for events that were preempted/deduped before render.
      const isActive = transientIdRef.current === id;
      const isQueued = queueRef.current.some((q) => q.id === id);
      traceAnnouncementRuntime('waitForDismiss:registered', { id, isActive, isQueued });
      if (!isActive && !isQueued) {
        traceAnnouncementRuntime('waitForDismiss:resolved-immediate', { id });
        resolve();
        return;
      }
      const list = pendingDismissRef.current.get(id) ?? [];
      list.push(resolve);
      pendingDismissRef.current.set(id, list);
    });
  }, []);

  // Active = transient if present, else ambient.
  const active = transient ?? ambient;

  const prevActiveRef = useRef<{ id: string | null; type: string | null }>({ id: null, type: null });
  const prevAmbientRef = useRef<{ id: string | null; type: string | null }>({ id: null, type: null });
  const prevTransientRef = useRef<{ id: string | null; type: string | null }>({ id: null, type: null });
  useEffect(() => {
    traceAnnouncementRuntime('active-slot:changed', {
      activeId: active?.id ?? null,
      activeType: active?.type ?? null,
      transientId: transient?.id ?? null,
      transientType: transient?.type ?? null,
      ambientId: ambient?.id ?? null,
      ambientType: ambient?.type ?? null,
    });
    const a = { id: active?.id ?? null, type: active?.type ?? null };
    if (a.id !== prevActiveRef.current.id || a.type !== prevActiveRef.current.type) {
      recordAnnouncementDebugEvent('active-change', `${prevActiveRef.current.type ?? 'null'} → ${a.type ?? 'null'}`, { from: prevActiveRef.current, to: a });
      prevActiveRef.current = a;
    }
    const am = { id: ambient?.id ?? null, type: ambient?.type ?? null };
    if (am.id !== prevAmbientRef.current.id || am.type !== prevAmbientRef.current.type) {
      recordAnnouncementDebugEvent('ambient-change', `${prevAmbientRef.current.type ?? 'null'} → ${am.type ?? 'null'}`, { from: prevAmbientRef.current, to: am });
      prevAmbientRef.current = am;
    }
    const tr = { id: transient?.id ?? null, type: transient?.type ?? null };
    if (tr.id !== prevTransientRef.current.id || tr.type !== prevTransientRef.current.type) {
      recordAnnouncementDebugEvent('transient-change', `${prevTransientRef.current.type ?? 'null'} → ${tr.type ?? 'null'}`, { from: prevTransientRef.current, to: tr });
      prevTransientRef.current = tr;
    }
  }, [active?.id, active?.type, transient?.id, transient?.type, ambient?.id, ambient?.type]);

  const value = useMemo<AnnouncementContextValue>(
    () => ({
      active,
      ambient,
      transient,
      viewerUserId,
      emit,
      dismiss,
      clearScope,
      clearAmbient,
      waitForDismiss,
    }),
    [
      active,
      ambient,
      transient,
      viewerUserId,
      emit,
      dismiss,
      clearScope,
      clearAmbient,
      waitForDismiss,
    ],
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
      waitForDismiss: () => Promise.resolve(),
    };
  }
  return {
    emit: ctx.emit,
    dismiss: ctx.dismiss,
    clearScope: ctx.clearScope,
    clearAmbient: ctx.clearAmbient,
    waitForDismiss: ctx.waitForDismiss,
  };
}


export type { AnnouncementType };
