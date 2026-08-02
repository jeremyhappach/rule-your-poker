/**
 * Lifecycle instrumentation with opt-in persistent logging.
 *
 * The in-memory lifecycle ledger is always available. Mount / unmount / fact
 * events are appended to `debug_events` only while the shared `events` debug
 * channel is enabled, preventing normal gameplay from filling the database.
 *
 * Schema mapping (debug_events):
 *   game_id      ← current lifecycle context game_id (fallback: NIL uuid)
 *   round_id     ← current lifecycle context round_id (optional)
 *   user_id      ← current auth user (set by context)
 *   event_type   ← 'lifecycle.mount' | 'lifecycle.unmount' | 'lifecycle.fact'
 *   client_role  ← 'player' | 'observer' | 'unknown'
 *   payload      ← full structured detail (see persistEvent below)
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDebugChannel } from '@/lib/debugChannels';
import { recordShellLifecycleEvent } from './shellLifecycleLog';

type Snapshot = Record<string, string | number | boolean | null | undefined>;

// ── In-memory snapshot (used by <LifecycleDebugBadge/>) ────────────
let snapshot: Snapshot = {};
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

// ── Persistent lifecycle context ────────────────────────────────────
// Callers (top-level Game.tsx, MobileGameTable, etc.) push the
// currently-known identifiers in here. Every persisted event auto-
// merges these so we never need to thread them through individual
// instrumentation call sites.

export interface LifecycleContext {
  clientSessionId: string;
  userId: string | null;
  gameId: string | null;
  roundId: string | null;
  dealerGameId: string | null;
  currentGameUuid: string | null;
  gameType: string | null;
  gameStatus: string | null;
  shellRoute: string | null;
  feltOwnership: string | null;
  clientRole: 'player' | 'observer' | 'unknown';
  turnOwnerPlayerId: string | null;
  decisionDeadline: string | null;
  timerSeedSource: string | null;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const ctx: LifecycleContext = {
  clientSessionId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  userId: null,
  gameId: null,
  roundId: null,
  dealerGameId: null,
  currentGameUuid: null,
  gameType: null,
  gameStatus: null,
  shellRoute: null,
  feltOwnership: null,
  clientRole: 'unknown',
  turnOwnerPlayerId: null,
  decisionDeadline: null,
  timerSeedSource: null,
};

export function setLifecycleContext(partial: Partial<LifecycleContext>) {
  let changed = false;
  for (const k of Object.keys(partial) as (keyof LifecycleContext)[]) {
    const v = partial[k];
    if (v === undefined) continue;
    if ((ctx as any)[k] !== v) {
      (ctx as any)[k] = v;
      changed = true;
    }
  }
  if (changed) {
    // Mirror key context bits into the in-memory snapshot for the
    // existing debug badge.
    snapshot = {
      ...snapshot,
      'ctx.gameId': ctx.gameId,
      'ctx.dealerGameId': ctx.dealerGameId,
      'ctx.gameType': ctx.gameType,
      'ctx.gameStatus': ctx.gameStatus,
      'ctx.shellRoute': ctx.shellRoute,
      'ctx.feltOwnership': ctx.feltOwnership,
      'ctx.clientRole': ctx.clientRole,
      'ctx.turnOwnerPlayerId': ctx.turnOwnerPlayerId,
      'ctx.decisionDeadline': ctx.decisionDeadline,
      'ctx.timerSeedSource': ctx.timerSeedSource,
    };
    emit();
  }
}

export function getLifecycleContext(): Readonly<LifecycleContext> {
  return ctx;
}

// ── Persistence queue ──────────────────────────────────────────────
// We batch inserts to keep request volume low. Up to 20 events or
// 500 ms — whichever comes first — flush enabled events to debug_events.

type QueuedEvent = {
  game_id: string;
  round_id: string | null;
  user_id: string | null;
  event_type: string;
  client_role: string;
  payload: Record<string, unknown>;
};

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let resolvedUserId: string | null = null;
let userIdResolved = false;

async function ensureUserId(): Promise<string | null> {
  if (userIdResolved) return resolvedUserId;
  try {
    const { data } = await supabase.auth.getUser();
    resolvedUserId = data.user?.id ?? null;
    userIdResolved = true;
    if (resolvedUserId && !ctx.userId) {
      setLifecycleContext({ userId: resolvedUserId });
    }
  } catch {
    userIdResolved = true;
  }
  return resolvedUserId;
}

async function flush() {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await supabase.from('debug_events').insert(batch as any);
  } catch (e) {
    // Swallow — instrumentation must never break gameplay.
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, 500);
  if (queue.length >= 20) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
  }
}

function persistEvent(eventType: string, payload: Record<string, unknown>) {
  // Keep the canonical in-memory lifecycle ledger available, but only persist
  // its high-volume rows when the existing debug-events channel is enabled.
  if (!isDebugChannel('events')) return;

  void ensureUserId();
  const enriched = {
    ts_client_iso: new Date().toISOString(),
    client_session_id: ctx.clientSessionId,
    user_id: ctx.userId ?? resolvedUserId ?? null,
    game_id: ctx.gameId,
    round_id: ctx.roundId,
    dealer_game_id: ctx.dealerGameId,
    current_game_uuid: ctx.currentGameUuid,
    game_type: ctx.gameType,
    game_status: ctx.gameStatus,
    shell_route: ctx.shellRoute,
    felt_ownership: ctx.feltOwnership,
    client_role: ctx.clientRole,
    turn_owner_player_id: ctx.turnOwnerPlayerId,
    decision_deadline: ctx.decisionDeadline,
    timer_seed_source: ctx.timerSeedSource,
    ...payload,
  };
  queue.push({
    game_id: ctx.gameId ?? NIL_UUID,
    round_id: ctx.roundId ?? null,
    user_id: ctx.userId ?? resolvedUserId ?? null,
    event_type: eventType,
    client_role: ctx.clientRole,
    payload: enriched,
  });
  scheduleFlush();
}

// Best-effort flush on unload.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flush();
  });
  window.addEventListener('beforeunload', () => {
    void flush();
  });
}

// ── Public API ─────────────────────────────────────────────────────

export function setLifecycleFact(key: string, value: Snapshot[string]) {
  if (snapshot[key] === value) return;
  snapshot[key] = value;
  emit();
  persistEvent('lifecycle.fact', { key, value });
  recordShellLifecycleEvent('fact', `${key}=${value}`, {
    dealerGameId: ctx.dealerGameId,
    roundId: ctx.roundId,
  });
}

export function clearLifecycleFact(key: string) {
  if (!(key in snapshot)) return;
  delete snapshot[key];
  emit();
  persistEvent('lifecycle.fact', { key, value: null, cleared: true });
}

export function recordLifecycleEvent(
  name: string,
  payload: Record<string, unknown> = {},
) {
  persistEvent(`lifecycle.${name}`, payload);
}

export function useLifecycleMount(name: string, extra?: Snapshot) {
  const mountInstanceRef = useRef<string>('');
  if (!mountInstanceRef.current) {
    mountInstanceRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  useEffect(() => {
    setLifecycleFact(`mounted:${name}`, true);
    persistEvent('lifecycle.mount', {
      component: name,
      mount_instance_id: mountInstanceRef.current,
      ...(extra ?? {}),
    });
    recordShellLifecycleEvent('mount', name, {
      instance: mountInstanceRef.current.slice(0, 8),
      dealerGameId: ctx.dealerGameId,
      roundId: ctx.roundId,
      currentGameUuid: ctx.currentGameUuid,
      gameStatus: ctx.gameStatus,
      gameType: ctx.gameType,
      ...(extra ?? {}),
    });
    return () => {
      setLifecycleFact(`mounted:${name}`, false);
      persistEvent('lifecycle.unmount', {
        component: name,
        mount_instance_id: mountInstanceRef.current,
      });
      recordShellLifecycleEvent('unmount', name, {
        instance: mountInstanceRef.current.slice(0, 8),
        dealerGameId: ctx.dealerGameId,
        roundId: ctx.roundId,
        currentGameUuid: ctx.currentGameUuid,
        gameStatus: ctx.gameStatus,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Snapshot subscription (existing badge) ─────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLifecycleSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
