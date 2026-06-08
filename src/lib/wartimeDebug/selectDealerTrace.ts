/**
 * selectDealerTrace — downstream wartime instrumentation focused on the
 * `selectDealer → game_selection → game-setup` pipeline.
 *
 * Replaces the prior `gameStartTransition` + `dealerSelectionTrace` probe set
 * whose questions (duplicate-click, duplicate Start Game invocation, competing
 * skip/create paths, eligibility attribution) have all been answered.
 *
 * Open question this package targets:
 *   "Where does progression stop AFTER dealer selection resolves?"
 *
 * One repro must place the defect in exactly one bucket:
 *   A) selectDealer failed
 *   B) status transition failed
 *   C) shell resolved the wrong surface
 *   D) game-selection/setup flow failed after transition
 *
 * Instrumentation only — no behavior changes. Events are persisted via the
 * freeze recorder so they survive a frozen UI, and mirrored into the Wartime
 * ring buffer for in-app inspection.
 */

import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

export type SelectDealerEvent =
  | 'SELECT_DEALER_ENTER'
  | 'SELECT_DEALER_EXIT'
  | 'STATUS_TRANSITION_ATTEMPT'
  | 'STATUS_TRANSITION_COMMIT'
  | 'STATUS_TRANSITION_REJECT'
  | 'GAME_SELECTION_SURFACE_RESOLUTION'
  | 'GAME_SELECTION_READY';

export function recordSelectDealerTrace(
  event: SelectDealerEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = { timestamp: new Date().toISOString(), ...payload };
  // eslint-disable-next-line no-console
  console.debug(`[SDT] ${event}`, enriched);
  recordWartime('GAMEPLAY', `selectDealer.${event}`, enriched);
  persistFreezeEvent(`sdt.${event}`, 'selectDealerTrace', enriched);
}

// ── PlayfieldSlotController de-duper ───────────────────────────────
// PSC slot.state effect fires on every render of its dependency snapshot;
// cache the signature so GAME_SELECTION_SURFACE_RESOLUTION only emits when
// a meaningful field actually changes.
let _lastSurfaceSig: string | null = null;

export function recordSurfaceResolutionIfChanged(
  payload: Record<string, unknown>,
): void {
  let sig: string;
  try {
    sig = JSON.stringify(payload);
  } catch {
    sig = String(Math.random());
  }
  if (sig === _lastSurfaceSig) return;
  _lastSurfaceSig = sig;
  recordSelectDealerTrace('GAME_SELECTION_SURFACE_RESOLUTION', payload);
}
