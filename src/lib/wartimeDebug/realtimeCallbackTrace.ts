/**
 * realtimeCallbackTrace — wraps a Supabase postgres_changes callback with
 * BEGIN/END markers (and an END-via-throw marker) so a frozen UI shows
 * exactly which subscriber entered and never returned.
 *
 * Markers are persisted via the freeze recorder + Wartime ring buffer so
 * they survive a main-thread halt.
 */

import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

let _seq = 0;

function record(event: string, payload: Record<string, unknown>) {
  const enriched = { ...payload, seq: ++_seq, t: new Date().toISOString() };
  // eslint-disable-next-line no-console
  console.debug(`[RCT] ${event}`, enriched);
  recordWartime('NETWORK', `realtime.${event}`, enriched);
  persistFreezeEvent(`rct.${event}`, 'realtimeCallbackTrace', enriched);
}

interface CallbackMeta {
  channel: string;
  table: string;
}

export function tracedRealtimeCallback<P = any>(
  meta: CallbackMeta,
  handler: (payload: P) => void | Promise<void>,
): (payload: P) => void {
  return (payload: P) => {
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const p: any = payload as any;
    const oldRow = p?.old ?? {};
    const newRow = p?.new ?? {};
    const beginPayload = {
      channel: meta.channel,
      table: meta.table,
      eventType: p?.eventType ?? null,
      rowId: newRow?.id ?? oldRow?.id ?? null,
      oldStatus: oldRow?.status ?? null,
      newStatus: newRow?.status ?? null,
      oldGameType: oldRow?.game_type ?? null,
      newGameType: newRow?.game_type ?? null,
      oldCurrentGameUuid: oldRow?.current_game_uuid ?? null,
      newCurrentGameUuid: newRow?.current_game_uuid ?? null,
    };
    record('REALTIME_CALLBACK_BEGIN', beginPayload);
    let threw = false;
    let err: unknown = null;
    try {
      const ret = handler(payload);
      // If it's a promise, attach an async END marker too.
      if (ret && typeof (ret as any).then === 'function') {
        (ret as Promise<void>).then(
          () =>
            record('REALTIME_CALLBACK_END_ASYNC', {
              channel: meta.channel,
              table: meta.table,
              elapsedMs: Math.round(
                (typeof performance !== 'undefined'
                  ? performance.now()
                  : Date.now()) - start,
              ),
            }),
          (e) =>
            record('REALTIME_CALLBACK_END_ASYNC_REJECT', {
              channel: meta.channel,
              table: meta.table,
              error: String((e as any)?.message ?? e),
              elapsedMs: Math.round(
                (typeof performance !== 'undefined'
                  ? performance.now()
                  : Date.now()) - start,
              ),
            }),
        );
      }
    } catch (e) {
      threw = true;
      err = e;
    }
    const end =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    record('REALTIME_CALLBACK_END', {
      channel: meta.channel,
      table: meta.table,
      elapsedMs: Math.round(end - start),
      threw,
      error: threw ? String((err as any)?.message ?? err) : null,
    });
    if (threw) throw err;
  };
}

export function recordFetchSpan(
  label: string,
  phase: 'BEGIN' | 'END',
  payload: Record<string, unknown> = {},
): void {
  record(`${label}_${phase}`, payload);
}
