/**
 * postCommitStallTrace — narrow probes for the window between a successful
 * `selectDealer` status commit and the (never-arriving) first render of
 * `DealerGameSetupInner`.
 *
 * Prior probe sets (`gameSelectionTrace` render/mount/effect probes on
 * `DealerGameSetupInner`) confirmed: zero `gst.*` events fire after commit.
 * The stall is therefore UPSTREAM of DealerGameSetupInner. This module
 * adds probes only at the parent/phase-resolution boundary:
 *
 *   1. selectDealer post-commit ticks
 *        SELECT_DEALER_POST_COMMIT_MICROTASK
 *        SELECT_DEALER_POST_COMMIT_TIMEOUT_0
 *        SELECT_DEALER_POST_COMMIT_RAF
 *   2. Game.tsx route render boundary
 *        GAME_ROUTE_RENDER_BEGIN / GAME_ROUTE_RENDER_END
 *   3. PlayfieldSlotController resolution boundary
 *        PSC_RESOLUTION_BEGIN / PSC_RESOLUTION_END
 *   4. Parent-of-DealerGameSetup branch resolution (Game.tsx JSX gates)
 *        DEALER_SETUP_PARENT_RENDER_BEGIN
 *        DEALER_SETUP_PARENT_RENDER_END
 *        DEALER_SETUP_PARENT_BRANCH_SELECTED
 *   5. Render-loop guard at each of the above surfaces
 *        POST_COMMIT_RENDER_LOOP_GUARD
 *
 * All events flow through both the Wartime ring buffer and the freeze
 * recorder so they survive a frozen UI. Render-time emit is signature
 * de-duplicated to prevent the instrumentation itself from looping.
 */

import { useEffect, useRef } from 'react';
import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

export type PostCommitEvent =
  | 'SELECT_DEALER_POST_COMMIT_MICROTASK'
  | 'SELECT_DEALER_POST_COMMIT_TIMEOUT_0'
  | 'SELECT_DEALER_POST_COMMIT_RAF'
  | 'GAME_ROUTE_RENDER_BEGIN'
  | 'GAME_ROUTE_RENDER_END'
  | 'PSC_RESOLUTION_BEGIN'
  | 'PSC_RESOLUTION_END'
  | 'DEALER_SETUP_PARENT_RENDER_BEGIN'
  | 'DEALER_SETUP_PARENT_RENDER_END'
  | 'DEALER_SETUP_PARENT_BRANCH_SELECTED'
  | 'DEALER_SETUP_INNER_RENDER_BEGIN'
  | 'DEALER_SETUP_INNER_RENDER_END'
  | 'DEALER_SETUP_EFFECT_ENTER'
  | 'DEALER_SETUP_EFFECT_EXIT'
  | 'SHELL_SLOT_RENDER_BEGIN'
  | 'SHELL_SLOT_RENDER_END'
  | 'NEUTRAL_INTERSTITIAL_RENDER_BEGIN'
  | 'NEUTRAL_INTERSTITIAL_RENDER_END'
  | 'GAME_SELECTION_SURFACE_RENDER_BEGIN'
  | 'GAME_SELECTION_SURFACE_RENDER_END'
  | 'GAME_SELECTION_EFFECT_ENTER'
  | 'GAME_SELECTION_EFFECT_EXIT'
  | 'POST_COMMIT_RENDER_LOOP_GUARD';

function _now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function recordPostCommitEvent(
  event: PostCommitEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = { timestamp: new Date().toISOString(), ...payload };
  // eslint-disable-next-line no-console
  console.debug(`[PCS] ${event}`, enriched);
  recordWartime('GAMEPLAY', `postCommit.${event}`, enriched);
  persistFreezeEvent(`pcs.${event}`, 'postCommitStallTrace', enriched);
}

// ── 1. selectDealer post-commit ticks ─────────────────────────────────
//
// Called from selectDealer immediately after STATUS_TRANSITION_COMMIT +
// SELECT_DEALER_EXIT(success=true). Schedules three async markers to
// determine whether the main thread locks immediately after exit
// (microtask never fires), during the next task (timeout=0 never
// fires), or during the next frame (rAF never fires).
export function schedulePostCommitTicks(payload: Record<string, unknown>): void {
  const scheduledAt = _now();
  const base = { ...payload, scheduledAt: Math.round(scheduledAt) };

  // Microtask
  Promise.resolve().then(() => {
    recordPostCommitEvent('SELECT_DEALER_POST_COMMIT_MICROTASK', {
      ...base,
      elapsedMs: Math.round(_now() - scheduledAt),
    });
  });

  // Macrotask (setTimeout 0)
  setTimeout(() => {
    recordPostCommitEvent('SELECT_DEALER_POST_COMMIT_TIMEOUT_0', {
      ...base,
      elapsedMs: Math.round(_now() - scheduledAt),
    });
  }, 0);

  // Animation frame
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      recordPostCommitEvent('SELECT_DEALER_POST_COMMIT_RAF', {
        ...base,
        elapsedMs: Math.round(_now() - scheduledAt),
      });
    });
  }
}

// ── 2. Render-loop guard ──────────────────────────────────────────────
//
// Pure function (no hooks) — safe to call at the very top of a render
// body BEFORE any conditional returns. Counts renders per component and
// emits POST_COMMIT_RENDER_LOOP_GUARD once when the rate exceeds the
// threshold or cumulative cap. Returns whether the guard has tripped so
// callers MAY bail (`return null`) to preserve observability.

const LOOP_WINDOW_MS = 1000;
const LOOP_THRESHOLD = 50;     // renders within window
const LOOP_HARD_CAP = 200;     // cumulative renders

interface LoopState {
  total: number;
  windowStart: number;
  windowCount: number;
  trippedAt: number | null;
}

const _loopState = new Map<string, LoopState>();

export interface LoopGuardResult {
  renderCount: number;
  windowCount: number;
  tripped: boolean;
}

export function tickRenderLoopGuard(
  component: string,
  extraPayload: () => Record<string, unknown>,
): LoopGuardResult {
  const now = _now();
  let state = _loopState.get(component);
  if (!state) {
    state = { total: 0, windowStart: now, windowCount: 0, trippedAt: null };
    _loopState.set(component, state);
  }
  state.total += 1;
  if (now - state.windowStart > LOOP_WINDOW_MS) {
    state.windowStart = now;
    state.windowCount = 0;
  }
  state.windowCount += 1;

  const tripped =
    state.windowCount >= LOOP_THRESHOLD || state.total >= LOOP_HARD_CAP;
  if (tripped && state.trippedAt == null) {
    state.trippedAt = now;
    recordPostCommitEvent('POST_COMMIT_RENDER_LOOP_GUARD', {
      component,
      renderCount: state.total,
      windowCount: state.windowCount,
      elapsedMs: Math.round(now - state.windowStart),
      reason:
        state.windowCount >= LOOP_THRESHOLD
          ? `>${LOOP_THRESHOLD} renders within ${LOOP_WINDOW_MS}ms`
          : `>${LOOP_HARD_CAP} cumulative renders`,
      ...extraPayload(),
    });
  }
  return {
    renderCount: state.total,
    windowCount: state.windowCount,
    tripped: state.trippedAt != null,
  };
}

// ── 3. Signature-deduped render-boundary emitter ──────────────────────
//
// Render bodies run many times per frame. Emit BEGIN/END only when the
// snapshot payload signature actually changes, so we get one event per
// distinct render *intent* without flooding the recorder.
//
// The END event is scheduled via microtask so it lands AFTER the React
// render body returns; if the main thread locks during commit, the END
// event will be missing — which is itself diagnostic.

const _sigCache = new Map<string, string>();

function _sigKey(component: string, kind: 'begin' | 'end'): string {
  return `${component}:${kind}`;
}

function _signature(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(Math.random());
  }
}

export function recordRenderBoundaryIfChanged(
  event: PostCommitEvent,
  component: string,
  payload: Record<string, unknown>,
): boolean {
  const key = _sigKey(component, event.endsWith('_END') ? 'end' : 'begin');
  const sig = _signature({ event, ...payload });
  if (_sigCache.get(key) === sig) return false;
  _sigCache.set(key, sig);
  recordPostCommitEvent(event, { component, ...payload });
  return true;
}

/**
 * Mark a render boundary. Emits BEGIN immediately (signature-deduped)
 * and schedules a matching END via microtask so the absence of END is
 * diagnostic of a main-thread lock during render commit.
 */
export function markRenderBoundary(
  component: string,
  payloadFn: () => Record<string, unknown>,
  beginEvent: PostCommitEvent,
  endEvent: PostCommitEvent,
): void {
  const startedAt = _now();
  const payload = payloadFn();
  const emitted = recordRenderBoundaryIfChanged(beginEvent, component, {
    ...payload,
    startedAt: Math.round(startedAt),
  });
  if (!emitted) return;
  Promise.resolve().then(() => {
    recordPostCommitEvent(endEvent, {
      component,
      elapsedMs: Math.round(_now() - startedAt),
      ...payload,
    });
  });
}

/** Test/dev utility — clear counters between repros. */
export function _resetPostCommitStallCounters(): void {
  _loopState.clear();
  _sigCache.clear();
}
