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
  | 'GAME_SELECTION_READY'
  | 'SELECT_DEALER_QUERY_BEGIN'
  | 'SELECT_DEALER_QUERY_RESULT'
  | 'SELECT_DEALER_QUERY_HUNG';

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

/**
 * Wrap a Supabase / async DB call with BEGIN / RESULT / HUNG markers.
 * Emits SELECT_DEALER_QUERY_HUNG after 5s if still pending; never aborts —
 * we want to observe whether the call ever returns.
 */
export async function tracedSelectDealerQuery<T>(
  queryName: string,
  context: Record<string, unknown>,
  exec: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  recordSelectDealerTrace('SELECT_DEALER_QUERY_BEGIN', { queryName, ...context });
  let hung = false;
  const hungTimer = setTimeout(() => {
    hung = true;
    recordSelectDealerTrace('SELECT_DEALER_QUERY_HUNG', {
      queryName,
      elapsedMs: Date.now() - start,
      ...context,
      outstandingQuery: queryName,
    });
  }, 5000);
  try {
    const result = await exec();
    clearTimeout(hungTimer);
    const anyRes = result as any;
    const error =
      anyRes && typeof anyRes === 'object' && 'error' in anyRes ? anyRes.error : null;
    const data =
      anyRes && typeof anyRes === 'object' && 'data' in anyRes ? anyRes.data : undefined;
    const firstRow = Array.isArray(data) ? data[0] : data;
    recordSelectDealerTrace('SELECT_DEALER_QUERY_RESULT', {
      queryName,
      elapsedMs: Date.now() - start,
      success: !error,
      error: error ? String((error as any).message ?? error) : null,
      hungBeforeReturn: hung,
      returnedStatus: firstRow && (firstRow as any).status ? (firstRow as any).status : null,
      returnedGameType: firstRow && (firstRow as any).game_type ? (firstRow as any).game_type : null,
      returnedCurrentGameUuid:
        firstRow && (firstRow as any).current_game_uuid
          ? (firstRow as any).current_game_uuid
          : null,
      affectedRows: Array.isArray(data) ? data.length : data ? 1 : null,
      ...context,
    });
    return result;
  } catch (e: any) {
    clearTimeout(hungTimer);
    recordSelectDealerTrace('SELECT_DEALER_QUERY_RESULT', {
      queryName,
      elapsedMs: Date.now() - start,
      success: false,
      error: String(e?.message ?? e),
      hungBeforeReturn: hung,
      ...context,
    });
    throw e;
  }
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
