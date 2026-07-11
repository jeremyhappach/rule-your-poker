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
  /**
   * Retire every live and queued TRANSIENT whose `transientScope`
   * matches. Generic, producer-owned retirement group boundary — used
   * to synchronously drop a previous ownership group's rail events
   * before the next group emits (e.g. Cribbage counting target
   * advance). Leaves ambient state and unrelated transients alone.
   */
  retireTransientScope: (scope: string) => void;
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
  // Synchronous mirror of the FULL current transient. Branch decisions in
  // emit() MUST read this rather than the closured `transient` useState
  // value: multiple emits fired in the same React batch all close over
  // the same pre-batch `transient`, so without a ref a same-tick second
  // emit will take `promote-immediate` and clobber a higher-priority
  // event that was just promoted earlier in the batch. This was the
  // root cause of the Cribbage match_win → peg_notice clobber.
  const transientRef = useRef<ResolvedAnnouncement | null>(null);

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
          transientRef.current = null;
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

    // Ownership guard: a promotion task is "owned" by the slot state
    // it was scheduled to follow up on. If the slot has since been
    // taken by a newer transient (e.g. a preempt that ran between
    // the scheduling of this microtask and its execution), we must
    // not touch the slot or the TTL timer — both belong to the new
    // owner.
    if (transientIdRef.current != null && queue.length === 0) {
      return;
    }

    clearTtl();
    while (queue.length > 0 && !scopeMatches(queue[0].scope, currentScope)) {
      const dropped = queue.shift()!;
      drainDismiss(dropped.id);
    }
    const next = queue.shift() ?? null;
    transientIdRef.current = next?.id ?? null;
    transientRef.current = next;
    setTransient(() => next);
    if (next) armTtl(next);
  }, [clearTtl, currentScope, armTtl, drainDismiss]);


  const emit = useCallback(
    (event: AnnouncementEvent) => {
      recordAnnouncementDebugEvent(
        'lifecycle',
        `emit-requested ${event.type} id=${event.id.slice(0, 8)}`,
        {
          stage: 'emit-requested', type: event.type, id: event.id,
          scope: event.scope, currentScope,
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
        if (event.type === 'match_win' && event.id.includes('yahtzee-match:')) {
          recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE provider REJECTED', {
            providerDealerGameId: currentScope.dealerGameId ?? null,
            providerRoundId: currentScope.roundId ?? null,
            eventScopeDealerGameId: event.scope.dealerGameId ?? null,
            eventScopeRoundId: event.scope.roundId ?? null,
            accepted: false,
            rejectionReason: 'scope-mismatch',
            id: event.id,
          });
        }
        return;
      }
      const resolved = resolve(event);
      const isYahtzeeMatchWin = event.type === 'match_win' && event.id.includes('yahtzee-match:');
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

      // [CRIBBAGE-DOUBLE-SKUNK-TRACE] match_win acceptance (post-scope-match)
      if (event.type === 'match_win') {
        recordAnnouncementDebugEvent('lifecycle', 'CRIBBAGE-DOUBLE-SKUNK-TRACE match_win accepted', {
          eventId: event.id,
          acceptedAt: Date.now(),
          scope: event.scope,
          source: (event.payload as { source?: unknown } | undefined)?.source ?? null,
          skunk: (event.payload as { skunk?: unknown } | undefined)?.skunk ?? null,
        });
      }
      // [CRIBBAGE-DOUBLE-SKUNK-TRACE] dealer_configuring interaction (emit-accepted point)
      if (event.type === 'dealer_configuring') {
        recordAnnouncementDebugEvent('lifecycle', 'CRIBBAGE-DOUBLE-SKUNK-TRACE dealer_configuring interaction', {
          stage: 'emit-accepted',
          eventId: event.id,
          activeId: transient?.id ?? ambient?.id ?? null,
          activeType: transient?.type ?? ambient?.type ?? null,
          terminalEventId: (transient && transient.type === 'match_win') ? transient.id : null,
          celebrationVisible: !!(transient && transient.type === 'match_win'),
        });
      }


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
        if (isYahtzeeMatchWin) {
          recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE provider REJECTED', {
            providerDealerGameId: currentScope.dealerGameId ?? null,
            providerRoundId: currentScope.roundId ?? null,
            eventScopeDealerGameId: event.scope.dealerGameId ?? null,
            eventScopeRoundId: event.scope.roundId ?? null,
            accepted: false,
            rejectionReason: 'dedupe',
            id: event.id,
          });
        }
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

      // Branch decisions MUST read from transientRef (synchronous) — NOT
      // the closured `transient` useState, which is stale within a React
      // batch when multiple emits fire in the same tick. Stale closure
      // = silent clobber of higher-priority events. (See ref declaration.)
      const liveTransient = transientRef.current;
      const closureTransient = transient
        ? { id: transient.id, type: transient.type, priority: transient.resolvedPriority }
        : null;
      const refTransientId = transientIdRef.current;
      const closureRefMismatch = (closureTransient?.id ?? null) !== refTransientId;
      const branch = liveTransient && resolved.resolvedPriority > liveTransient.resolvedPriority
        ? 'preempt'
        : !liveTransient
          ? 'promote-immediate'
          : 'enqueue';
      recordAnnouncementDebugEvent(
        'lifecycle',
        `DOUBLE-SKUNK-TRACE terminal-eval ${resolved.type}(${resolved.id.slice(0,8)}) pri=${resolved.resolvedPriority} branch=${branch} ref=${liveTransient?.type ?? 'null'}(${refTransientId?.slice(0,8) ?? 'null'}) closure=${closureTransient?.type ?? 'null'} mismatch=${closureRefMismatch}`,
        {
          stage: 'terminal-eval',
          candidate: { id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority },
          liveTransient: liveTransient
            ? { id: liveTransient.id, type: liveTransient.type, priority: liveTransient.resolvedPriority }
            : null,
          closureTransient,
          refTransientId,
          closureRefMismatch,
          branch,
          providerScope: currentScope,
          eventScope: event.scope,
          queueLen: queueRef.current.length,
        },
      );

      // Preempt current transient if strictly higher priority.
      if (liveTransient && resolved.resolvedPriority > liveTransient.resolvedPriority) {
        if (isYahtzeeMatchWin) {
          recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE provider ACCEPTED', {
            providerDealerGameId: currentScope.dealerGameId ?? null,
            providerRoundId: currentScope.roundId ?? null,
            eventScopeDealerGameId: event.scope.dealerGameId ?? null,
            eventScopeRoundId: event.scope.roundId ?? null,
            accepted: true, rejectionReason: null, id: event.id,
            behavior: resolved.resolvedBehavior, outcome: 'preempt',
          });
        }
        clearTtl();
        recordAnnouncementDebugEvent(
          'lifecycle',
          `preempt ${liveTransient.type}→${resolved.type} id=${resolved.id.slice(0, 8)}`,
          {
            stage: 'preempt',
            dropped: { id: liveTransient.id, type: liveTransient.type, priority: liveTransient.resolvedPriority },
            next: { id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority },
          },
        );
        drainDismiss(liveTransient.id);
        transientIdRef.current = resolved.id;
        transientRef.current = resolved;
        setTransient(() => resolved);
        armTtl(resolved);
        return;
      }

      // No active transient → become active.
      if (!liveTransient) {
        if (isYahtzeeMatchWin) {
          recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE provider ACCEPTED', {
            providerDealerGameId: currentScope.dealerGameId ?? null,
            providerRoundId: currentScope.roundId ?? null,
            eventScopeDealerGameId: event.scope.dealerGameId ?? null,
            eventScopeRoundId: event.scope.roundId ?? null,
            accepted: true, rejectionReason: null, id: event.id,
            behavior: resolved.resolvedBehavior, outcome: 'promote-immediate',
          });
        }
        recordAnnouncementDebugEvent(
          'lifecycle',
          `promote-immediate ${resolved.type} id=${resolved.id.slice(0, 8)}`,
          { stage: 'promote-immediate', id: resolved.id, type: resolved.type, priority: resolved.resolvedPriority },
        );
        transientIdRef.current = resolved.id;
        transientRef.current = resolved;
        setTransient(() => resolved);
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
      if (isYahtzeeMatchWin) {
        recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE provider ACCEPTED', {
          providerDealerGameId: currentScope.dealerGameId ?? null,
          providerRoundId: currentScope.roundId ?? null,
          eventScopeDealerGameId: event.scope.dealerGameId ?? null,
          eventScopeRoundId: event.scope.roundId ?? null,
          accepted: true, rejectionReason: null, id: event.id,
          behavior: resolved.resolvedBehavior, outcome: 'enqueue',
          blockedByType: liveTransient.type,
        });
      }
      recordAnnouncementDebugEvent(
        'lifecycle',
        `enqueue ${resolved.type} id=${resolved.id.slice(0, 8)} at=${insertAt} qlen=${lenBefore}→${q.length} blockedBy=${liveTransient.type}`,
        {
          stage: 'enqueue', id: resolved.id, type: resolved.type,
          priority: resolved.resolvedPriority, insertAt,
          queueLenBefore: lenBefore, queueLenAfter: q.length,
          blockedBy: {
            id: liveTransient.id, type: liveTransient.type, priority: liveTransient.resolvedPriority,
          },
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
          },
        );
        if (matches) {
          transientIdRef.current = null;
          transientRef.current = null;
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
          transientRef.current = null;
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
        transientRef.current = null;
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

      // [CRIBBAGE-DOUBLE-SKUNK-TRACE] terminalEventId changes — track when celebration-tier (match_win) active id flips
      const prevTerminalId = prevActiveRef.current.type === 'match_win' ? prevActiveRef.current.id : null;
      const nextTerminalId = a.type === 'match_win' ? a.id : null;
      if (prevTerminalId !== nextTerminalId) {
        const reason =
          prevTerminalId && !nextTerminalId ? 'cleared' :
          !prevTerminalId && nextTerminalId ? 'set' :
          prevTerminalId === nextTerminalId ? 'noop' :
          'replaced';
        recordAnnouncementDebugEvent('lifecycle', 'CRIBBAGE-DOUBLE-SKUNK-TRACE terminalEventId changed', {
          previousId: prevTerminalId,
          nextId: nextTerminalId,
          reason,
          fromType: prevActiveRef.current.type,
          toType: a.type,
        });
      }
      // [CRIBBAGE-DOUBLE-SKUNK-TRACE] dealer_configuring became active
      if (a.type === 'dealer_configuring') {
        recordAnnouncementDebugEvent('lifecycle', 'CRIBBAGE-DOUBLE-SKUNK-TRACE dealer_configuring interaction', {
          stage: 'active',
          activeId: a.id,
          terminalEventId: nextTerminalId,
          celebrationVisible: false,
        });
      }
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
