/**
 * gameSelectionTrace — downstream probes for the post-selectDealer pipeline.
 *
 * Selected as Bucket D: status commits to `game_selection`, but the next
 * heartbeat never fires and no further surface resolution happens. This
 * module attributes the stall to a specific component / effect by emitting
 * render/mount/effect timing events plus a render-loop guard.
 *
 * All events flow through both the Wartime ring buffer and the freeze
 * recorder so they survive a non-interactive UI.
 *
 * Instrumentation only — except for the loop guard, which short-circuits a
 * runaway render path to preserve observability and prevent a hard browser
 * lock.
 */

import { useEffect, useRef } from 'react';
import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

export type GameSelectionEvent =
  | 'GAME_SELECTION_RENDER_BEGIN'
  | 'GAME_SELECTION_RENDER_END'
  | 'GAME_SELECTION_MOUNT_BEGIN'
  | 'GAME_SELECTION_MOUNT_END'
  | 'GAME_SELECTION_EFFECT_ENTER'
  | 'GAME_SELECTION_EFFECT_EXIT'
  | 'GAME_SELECTION_LOOP_GUARD';

export function recordGameSelectionTrace(
  event: GameSelectionEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = { timestamp: new Date().toISOString(), ...payload };
  // eslint-disable-next-line no-console
  console.debug(`[GST] ${event}`, enriched);
  recordWartime('GAMEPLAY', `gameSelection.${event}`, enriched);
  persistFreezeEvent(`gst.${event}`, 'gameSelectionTrace', enriched);
}

// ── Render counter + loop guard ─────────────────────────────────────
const LOOP_WINDOW_MS = 1000;
const LOOP_THRESHOLD = 50;
const LOOP_HARD_CAP = 200; // unconditional kill switch

interface RenderCounterState {
  total: number;
  windowStart: number;
  windowCount: number;
  trippedAt: number | null;
  lastEmitAt: number;
}

const _counters = new Map<string, RenderCounterState>();

export interface RenderProbeSnapshot {
  renderCount: number;
  loopTripped: boolean;
  shouldBail: boolean;
}

/**
 * useGameSelectionRenderProbe — call at the top of a suspected surface
 * component. Emits RENDER_BEGIN/END, tracks renders/sec, and emits a
 * LOOP_GUARD event + signals the caller to bail out when a runaway is
 * detected. Returns { shouldBail: true } once the guard trips so the
 * caller can short-circuit (`return null`) and preserve observability.
 */
export function useGameSelectionRenderProbe(
  component: string,
  payload: () => Record<string, unknown>,
): RenderProbeSnapshot {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let state = _counters.get(component);
  if (!state) {
    state = { total: 0, windowStart: startedAt, windowCount: 0, trippedAt: null, lastEmitAt: 0 };
    _counters.set(component, state);
  }
  state.total += 1;
  if (startedAt - state.windowStart > LOOP_WINDOW_MS) {
    state.windowStart = startedAt;
    state.windowCount = 0;
  }
  state.windowCount += 1;

  const tripped = state.windowCount >= LOOP_THRESHOLD || state.total >= LOOP_HARD_CAP;
  if (tripped && state.trippedAt == null) {
    state.trippedAt = startedAt;
    recordGameSelectionTrace('GAME_SELECTION_LOOP_GUARD', {
      component,
      renderCount: state.total,
      windowCount: state.windowCount,
      windowMs: LOOP_WINDOW_MS,
      threshold: LOOP_THRESHOLD,
      hardCap: LOOP_HARD_CAP,
      reason: state.windowCount >= LOOP_THRESHOLD
        ? `>${LOOP_THRESHOLD} renders within ${LOOP_WINDOW_MS}ms`
        : `>${LOOP_HARD_CAP} cumulative renders`,
      ...payload(),
    });
  }

  // Throttle RENDER_BEGIN/END emit volume to 1 every 20ms past first 10
  // renders, but always emit the first few so we capture the mount path.
  const shouldEmit = state.total <= 10 || startedAt - state.lastEmitAt >= 20;
  if (shouldEmit && !tripped) {
    state.lastEmitAt = startedAt;
    recordGameSelectionTrace('GAME_SELECTION_RENDER_BEGIN', {
      component,
      renderCount: state.total,
      ...payload(),
    });
  }

  // Defer RENDER_END to the next microtask so it lands after the render body.
  if (shouldEmit && !tripped) {
    Promise.resolve().then(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      recordGameSelectionTrace('GAME_SELECTION_RENDER_END', {
        component,
        renderCount: state!.total,
        elapsedMs: Math.round(now - startedAt),
      });
    });
  }

  return {
    renderCount: state.total,
    loopTripped: state.trippedAt != null,
    // Bail once tripped to preserve observability and main thread.
    shouldBail: state.trippedAt != null,
  };
}

/**
 * useGameSelectionMountProbe — emits MOUNT_BEGIN / MOUNT_END exactly once
 * per mount, with elapsed wall time between them.
 */
export function useGameSelectionMountProbe(
  component: string,
  payload: () => Record<string, unknown>,
): void {
  const startedAtRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now(),
  );
  const beganRef = useRef(false);
  if (!beganRef.current) {
    beganRef.current = true;
    recordGameSelectionTrace('GAME_SELECTION_MOUNT_BEGIN', {
      component,
      ...payload(),
    });
  }
  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordGameSelectionTrace('GAME_SELECTION_MOUNT_END', {
      component,
      elapsedMs: Math.round(now - startedAtRef.current),
    });
    // intentionally bare — mount lifecycle only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * traceGameSelectionEffect — wrap an effect body to emit ENTER/EXIT events
 * with the effect's elapsed sync-body time. Async work continues after EXIT;
 * use a follow-up event for that if needed.
 *
 * Usage:
 *   useEffect(() => traceGameSelectionEffect('MyComp', 'fetchDefaults',
 *     () => deps, () => { ... return cleanup; }), [a, b]);
 */
export function traceGameSelectionEffect(
  component: string,
  effectName: string,
  depsSummary: () => Record<string, unknown>,
  body: () => void | (() => void),
): void | (() => void) {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  recordGameSelectionTrace('GAME_SELECTION_EFFECT_ENTER', {
    component,
    effectName,
    depsSummary: depsSummary(),
  });
  let cleanup: void | (() => void);
  try {
    cleanup = body();
  } finally {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordGameSelectionTrace('GAME_SELECTION_EFFECT_EXIT', {
      component,
      effectName,
      elapsedMs: Math.round(now - start),
    });
  }
  return cleanup;
}

/** Test/dev utility — clear counters between repros. */
export function _resetGameSelectionRenderCounters(): void {
  _counters.clear();
}
