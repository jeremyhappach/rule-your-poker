/**
 * gameStartTransition — focused instrumentation for the
 *   waiting → dealer_selection → game_selection → configuring
 * transition path. Emits canonical wartime events used to attribute
 * exactly where Start Game progression stops.
 *
 * Instrumentation only. No behavior changes.
 *
 * All events route through `recordWartime('GAMEPLAY', ...)` so they
 * surface in the existing Wartime Debug Panel/export, and also log to
 * `console.debug` for live observation.
 */

import { recordWartime } from './core';

export type GameStartEvent =
  | 'GAME_START_REQUESTED'
  | 'GAME_START_HANDLER_ENTER'
  | 'GAME_START_HANDLER_EXIT'
  | 'DEALER_SELECTION_CREATE_BEGIN'
  | 'DEALER_SELECTION_CREATE_SUCCESS'
  | 'DEALER_SELECTION_CREATE_FAILURE'
  | 'STATUS_TRANSITION_ATTEMPT'
  | 'STATUS_TRANSITION_COMMIT'
  | 'STATUS_TRANSITION_REJECT'
  | 'PLAYFIELD_SLOT_RESOLUTION';

export function recordGameStartTransition(
  event: GameStartEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = {
    timestamp: new Date().toISOString(),
    ...payload,
  };
  // eslint-disable-next-line no-console
  console.debug(`[GST] ${event}`, enriched);
  recordWartime('GAMEPLAY', `gameStart.${event}`, enriched);
}

// ── PlayfieldSlotController de-duper ────────────────────────────────
// PSC slot.state effect fires every render of its dependency snapshot;
// cache the last signature so PLAYFIELD_SLOT_RESOLUTION only emits when
// a meaningful field actually changes.
let _lastSlotSig: string | null = null;

export function recordSlotResolutionIfChanged(
  payload: Record<string, unknown>,
): void {
  let sig: string;
  try {
    sig = JSON.stringify(payload);
  } catch {
    sig = String(Math.random());
  }
  if (sig === _lastSlotSig) return;
  _lastSlotSig = sig;
  recordGameStartTransition('PLAYFIELD_SLOT_RESOLUTION', payload);
}
