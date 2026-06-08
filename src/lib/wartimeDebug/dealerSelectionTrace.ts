/**
 * dealerSelectionTrace — canonical wartime events for the
 * dealer-selection init / draw lifecycle. Instrumentation only.
 *
 * Emits via the unified Wartime ring buffer so events surface in the
 * Wartime Debug Panel/export alongside the GST and announcement bridges.
 */

import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

export type DealerSelectionEvent =
  | 'DEALER_SELECTION_INIT_BEGIN'
  | 'DEALER_SELECTION_INIT_DECISION'
  | 'DEALER_SELECTION_PARTICIPANTS'
  | 'DEALER_SELECTION_WAIT_CONDITION'
  | 'DEALER_SELECTION_DRAW_BEGIN'
  | 'DEALER_SELECTION_DRAW_COMPLETE';

const _sigs = new Map<string, string>();

export function recordDealerSelectionTrace(
  event: DealerSelectionEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = { timestamp: new Date().toISOString(), ...payload };
  // eslint-disable-next-line no-console
  console.debug(`[DST] ${event}`, enriched);
  recordWartime('GAMEPLAY', `dealerSelection.${event}`, enriched);
  persistFreezeEvent(`dst.${event}`, 'dealerSelectionTrace', enriched);
}

/** De-dupe noisy effect-driven events when nothing meaningful changed. */
export function recordDealerSelectionTraceIfChanged(
  key: string,
  event: DealerSelectionEvent,
  payload: Record<string, unknown> = {},
): void {
  let sig: string;
  try {
    sig = JSON.stringify(payload);
  } catch {
    sig = String(Math.random());
  }
  if (_sigs.get(key) === sig) return;
  _sigs.set(key, sig);
  recordDealerSelectionTrace(event, payload);
}
