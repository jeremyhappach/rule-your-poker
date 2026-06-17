/**
 * holmLifecycleTrace — Holm-scoped lifecycle instrumentation.
 *
 * Investigation-only. Emits structured events via the canonical shell
 * lifecycle logger so transitions can be reconstructed from
 * `debug_events` (event_type LIKE 'lifecycle.holm.%') and from the
 * on-screen shell lifecycle panel.
 *
 * Goal: prove who owns the Holm WIN_SEQUENCE → blank-table → replay
 * lifecycle by capturing every transition in the relevant state
 * fields and every mount/unmount of the surfaces involved.
 *
 * No behavior. No fixes. Pure observability.
 */

import { useEffect, useRef } from 'react';
import {
  recordLifecycleEvent,
  getLifecycleContext,
} from '@/lib/canonicalShell/lifecycleDebug';
import { recordShellLifecycleEvent } from '@/lib/canonicalShell/shellLifecycleLog';

type Primitive = string | number | boolean | null | undefined;
export type HolmTraceFields = Record<string, Primitive>;

function shallowDiff(
  prev: HolmTraceFields | null,
  next: HolmTraceFields,
): Record<string, { from: Primitive; to: Primitive }> | null {
  if (!prev) {
    const initial: Record<string, { from: Primitive; to: Primitive }> = {};
    for (const k of Object.keys(next)) initial[k] = { from: null, to: next[k] };
    return initial;
  }
  const diff: Record<string, { from: Primitive; to: Primitive }> = {};
  let changed = false;
  for (const k of Object.keys(next)) {
    if (prev[k] !== next[k]) {
      diff[k] = { from: prev[k] ?? null, to: next[k] };
      changed = true;
    }
  }
  return changed ? diff : null;
}

/**
 * Diff-emits a holm.lifecycle event whenever any tracked field
 * changes. Safe to call every render; emit is gated by shallow diff.
 *
 * Suggested fields (caller supplies whatever is in scope):
 *   phase, previousPhase, roundId, handNumber, viewerSeat, isObserver,
 *   showHud, showSeats, showFelt, showTable, showWinSequence,
 *   showCommunityCards, showLonePlayerTabledCards, showChucky,
 *   showAnnouncements, tableMounted, holmWinPotTriggerId, gameStatus,
 *   gameType, currentGameUuid.
 */
export function useHolmLifecycleTrace(
  fields: HolmTraceFields,
  opts?: { scope?: string; enabled?: boolean },
): void {
  const prevRef = useRef<HolmTraceFields | null>(null);
  const scope = opts?.scope ?? 'mobile-table';
  const enabled = opts?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    const diff = shallowDiff(prevRef.current, fields);
    if (!diff) return;
    const ctx = getLifecycleContext();
    const payload = {
      scope,
      diff,
      snapshot: fields,
      dealerGameId: ctx.dealerGameId,
      roundId: ctx.roundId,
      currentGameUuid: ctx.currentGameUuid,
      gameStatus: ctx.gameStatus,
    };
    recordLifecycleEvent('holm.lifecycle', payload);
    // Also surface to the on-screen shell lifecycle panel.
    const summary = Object.entries(diff)
      .map(([k, v]) => `${k}: ${String(v.from)}→${String(v.to)}`)
      .join(' | ');
    recordShellLifecycleEvent('fact', `holm.lifecycle[${scope}] ${summary}`, payload);
    prevRef.current = { ...fields };
  });
}

/**
 * Imperative emit for discrete Holm lifecycle events
 * (e.g. winpot.trigger, winpot.complete, winpot.clear).
 */
export function recordHolmLifecycle(
  name: string,
  payload: Record<string, unknown> = {},
): void {
  const ctx = getLifecycleContext();
  const enriched = {
    ...payload,
    dealerGameId: ctx.dealerGameId,
    roundId: ctx.roundId,
    currentGameUuid: ctx.currentGameUuid,
    gameStatus: ctx.gameStatus,
  };
  recordLifecycleEvent(`holm.${name}`, enriched);
  recordShellLifecycleEvent('fact', `holm.${name}`, enriched);
}
