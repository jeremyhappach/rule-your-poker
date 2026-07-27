/**
 * Persistent sync debug event writer.
 *
 * Writes structured events to `debug_sync_events` table.
 * - Invariant violations ALWAYS persist (no flag needed).
 * - All other events gated by localStorage: ptp_debug_sync_events = "1"
 *
 * All writes are fire-and-forget — never blocks UI.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Toggle ────────────────────────────────────────────────────
//
// Production default: OFF. Enable per-session via URL ?debug_sync_events=1
// or localStorage ptp_debug_sync_events = "1"

const GLOBAL_DEBUG_DEFAULT = false;

let _enabled: boolean | null = null;

import { isDebugChannel } from './debugChannels';

function checkEnabled(): boolean {
  // Master channel switch (?ptp_debug=sync or ptp_debug=sync,...)
  try {
    if (isDebugChannel('sync')) return true;
  } catch { /* */ }
  // Legacy per-flag (kept for backwards compat)
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug_sync_events');
    if (v === '0' || v?.toLowerCase() === 'false') return false;
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    const stored = window.localStorage.getItem('ptp_debug_sync_events');
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch { /* */ }
  return GLOBAL_DEBUG_DEFAULT;
}

export function isSyncDebugEnabled(): boolean {
  if (_enabled === null) _enabled = checkEnabled();
  return _enabled;
}

export function refreshSyncDebugFlag(): void {
  _enabled = checkEnabled();
}

// ── Dedup ─────────────────────────────────────────────────────

const recentKeys = new Set<string>();
const DEDUP_MS = 1000;

function isDuplicate(key: string): boolean {
  if (recentKeys.has(key)) return true;
  recentKeys.add(key);
  setTimeout(() => recentKeys.delete(key), DEDUP_MS);
  return false;
}

// ── Types ─────────────────────────────────────────────────────

export interface SyncDebugEvent {
  gameId: string;
  gameType: string;
  handNumber: number;
  roundId?: string | null;
  eventType: 'invariant' | 'sync-gate' | 'transition' | 'correction';
  severity: 'info' | 'warn' | 'error';
  eventName: string;
  payload?: Record<string, unknown>;
  dedupKey?: string;
}

// ── Writer ────────────────────────────────────────────────────

/**
 * Persist a sync debug event. Fire-and-forget.
 *
 * - eventType 'invariant' always persists regardless of debug flag.
 * - All others only persist when debug flag is on.
 */
export function persistSyncDebugEvent(event: SyncDebugEvent): void {
  const isInvariant = event.eventType === 'invariant';

  // Gate: invariants always persist; others only when enabled
  if (!isInvariant && !isSyncDebugEnabled()) return;

  // Lightweight dedup
  const dedupKey = event.dedupKey ?? `${event.gameId}:${event.eventType}:${event.eventName}:${event.handNumber}`;
  if (isDuplicate(dedupKey)) return;

  supabase
    .from('debug_sync_events' as any)
    .insert({
      game_id: event.gameId,
      game_type: event.gameType,
      hand_number: event.handNumber,
      round_id: event.roundId ?? null,
      event_type: event.eventType,
      severity: event.severity,
      event_name: event.eventName,
      payload: event.payload ?? {},
    } as any)
    .then(({ error }) => {
      if (error) console.warn('[sync-debug] write failed:', error.message);
    });
}

// ── Convenience helpers ───────────────────────────────────────

/** Persist an invariant violation (always, no flag needed) */
export function persistInvariantViolation(
  gameId: string,
  gameType: string,
  handNumber: number,
  invariantName: string,
  context: Record<string, unknown>,
  roundId?: string | null,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    roundId,
    eventType: 'invariant',
    severity: 'error',
    eventName: invariantName,
    payload: context,
  });
}

/** Persist a sync-gate decision (debug-gated) */
export function persistSyncGate(
  gameId: string,
  gameType: string,
  handNumber: number,
  accepted: boolean,
  reason: string,
  vectors: { current: unknown; incoming: unknown },
  phase?: string,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    eventType: 'sync-gate',
    severity: accepted ? 'info' : 'warn',
    eventName: accepted ? 'accepted' : 'rejected',
    payload: {
      accepted,
      reason,
      phase: phase ?? null,
      currentVector: vectors.current,
      incomingVector: vectors.incoming,
    },
  });
}

/** Persist a key transition boundary (debug-gated) */
export function persistTransition(
  gameId: string,
  gameType: string,
  handNumber: number,
  transitionName: string,
  payload: Record<string, unknown>,
  roundId?: string | null,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    roundId,
    eventType: 'transition',
    severity: 'info',
    eventName: transitionName,
    payload,
  });
}

/** Persist a correction event (debug-gated) */
export function persistCorrection(
  gameId: string,
  gameType: string,
  handNumber: number,
  field: string,
  incorrectValue: unknown,
  correctedValue: unknown,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    eventType: 'correction',
    severity: 'warn',
    eventName: `correction:${field}`,
    payload: { field, incorrectValue, correctedValue },
  });
}

// ── Animation/dice envelope helper ────────────────────────────

import { buildAnimationEnvelope } from './clientContext';

/**
 * Persist an animation/dice/reveal event. The envelope
 * (clientId, clientTimestamp, shortGameId, animationPath) is added
 * automatically. `animationPath` is REQUIRED.
 *
 * Use this for any yahtzee-dice-*, animation, reveal, or win-related
 * log so reports can be correlated across clients.
 */
export function persistAnimationEvent(args: {
  gameId: string;
  gameType: string;
  handNumber: number;
  roundId?: string | null;
  /** REQUIRED short label e.g. 'yahtzee-dice-roll', 'cribbage-cut-card'. */
  animationPath: string;
  eventName: string;
  severity?: 'info' | 'warn' | 'error';
  /** Treat as invariant violation (always persists). */
  invariant?: boolean;
  payload?: Record<string, unknown>;
}): void {
  if (!args.animationPath) {
    console.warn('[anim-event] missing animationPath for', args.eventName);
    return;
  }
  const envelope = buildAnimationEnvelope(args.gameId, args.animationPath);
  persistSyncDebugEvent({
    gameId: args.gameId,
    gameType: args.gameType,
    handNumber: args.handNumber,
    roundId: args.roundId ?? null,
    eventType: args.invariant ? 'invariant' : 'transition',
    severity: args.severity ?? 'info',
    eventName: args.eventName,
    payload: { ...envelope, ...(args.payload ?? {}) },
  });
}
