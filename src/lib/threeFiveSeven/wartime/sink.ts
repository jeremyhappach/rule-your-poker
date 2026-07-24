/**
 * 3-5-7 Wartime — Persistent Sink.
 *
 * Buffered, asynchronous, non-perturbing. Emits into `debug_events`
 * with event_type prefix `357.wartime.*`. Gameplay MUST NEVER await
 * anything in this file.
 *
 * Integrity contract:
 *   - eventSequence is allocated by the caller (session.allocSequence)
 *     synchronously before enqueue. This module never reorders.
 *   - flushes are bounded batches, scheduled via setTimeout.
 *   - failed flushes retry once; further failures increment counters.
 *   - session_integrity events report gap/duplicate/drop stats.
 */

import { supabase } from '@/integrations/supabase/client';
import { SRC } from './sourceSites';

interface BufferedEvent {
  event_type: string;
  payload: Record<string, unknown>;
  sequence: number;
  game_id?: string | null;
  round_id?: string | null;
}

const BATCH_MAX = 40;
const FLUSH_INTERVAL_MS = 400;
const MAX_QUEUE = 2000;

let buffer: BufferedEvent[] = [];
let flushScheduled = false;
let flushInFlight = false;

let persistedThroughSequence = 0;
let droppedEventCount = 0;
let sinkFailureCount = 0;
let serializationFailureCount = 0;
let flushBatchCounter = 0;
let lastFlushLatencyMs = 0;

let sinkRoundTripPassed: boolean | null = null;
let sinkRoundTripInFlight = false;

export interface SinkCounters {
  queueDepth: number;
  persistedThroughSequence: number;
  droppedEventCount: number;
  sinkFailureCount: number;
  serializationFailureCount: number;
  lastFlushBatchId: number;
  lastFlushLatencyMs: number;
  sinkRoundTripPassed: boolean | null;
}

export function getSinkCounters(): SinkCounters {
  return {
    queueDepth: buffer.length,
    persistedThroughSequence,
    droppedEventCount,
    sinkFailureCount,
    serializationFailureCount,
    lastFlushBatchId: flushBatchCounter,
    lastFlushLatencyMs,
    sinkRoundTripPassed,
  };
}

function serializePayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    serializationFailureCount += 1;
    return null;
  }
}

export function enqueue(event: BufferedEvent): void {
  if (buffer.length >= MAX_QUEUE) {
    droppedEventCount += 1;
    return;
  }
  const safePayload = serializePayload(event.payload);
  if (!safePayload) {
    droppedEventCount += 1;
    return;
  }
  buffer.push({ ...event, payload: safePayload });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flushBatch();
  }, FLUSH_INTERVAL_MS);
}

async function flushBatch(): Promise<void> {
  if (flushInFlight) {
    scheduleFlush();
    return;
  }
  if (buffer.length === 0) return;
  flushInFlight = true;
  flushBatchCounter += 1;
  const batchId = flushBatchCounter;
  const queueDepthBefore = buffer.length;
  const batch = buffer.splice(0, BATCH_MAX);
  const started = Date.now();

  const rows = batch.map((e) => ({
    event_type: e.event_type,
    game_id: e.game_id ?? null,
    round_id: e.round_id ?? null,
    payload: { ...e.payload, flushBatchId: batchId },
  }));

  let error: { message?: string } | null = null;
  try {
    const res = await supabase.from('debug_events').insert(rows as never);
    error = (res as { error?: { message?: string } | null }).error ?? null;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  lastFlushLatencyMs = Date.now() - started;
  flushInFlight = false;

  if (error) {
    sinkFailureCount += 1;
    // Retry once at the head — preserves order for this batch.
    buffer = [...batch, ...buffer];
    scheduleFlush();
    emitSinkFlush({
      batchId,
      batch,
      queueDepthBefore,
      success: false,
      errorMessage: error.message ?? 'unknown',
    });
    return;
  }
  const maxSeq = batch.reduce((m, e) => (e.sequence > m ? e.sequence : m), persistedThroughSequence);
  persistedThroughSequence = maxSeq;
  emitSinkFlush({
    batchId,
    batch,
    queueDepthBefore,
    success: true,
    errorMessage: null,
  });
  if (buffer.length > 0) scheduleFlush();
}

/**
 * Persistent-sink flush-completion instrumentation. Emits ONE
 * `sink_flush` event per non-self batch so the queue converges to
 * zero when gameplay stops emitting. Batches that contained only
 * prior `sink_flush` events are not re-announced — otherwise the
 * queue would tail forever.
 */
function emitSinkFlush(args: {
  batchId: number;
  batch: BufferedEvent[];
  queueDepthBefore: number;
  success: boolean;
  errorMessage: string | null;
}): void {
  const nonSelfCount = args.batch.reduce(
    (n, e) => (e.event_type === '357.wartime.sink_flush' ? n : n + 1),
    0,
  );
  if (nonSelfCount === 0) return;
  const first = args.batch[0];
  const last = args.batch[args.batch.length - 1];
  // Lazy import avoids a circular dep at module init (emit → session → sink).
  void import('./emit').then(({ emitWartime }) => {
    emitWartime({
      eventName: 'sink_flush',
      sourceSiteId: 'sink.flush',
      payload: {
        flushBatchId: args.batchId,
        firstSequenceInBatch: first?.sequence ?? null,
        lastSequenceInBatch: last?.sequence ?? null,
        eventCount: args.batch.length,
        nonSelfEventCount: nonSelfCount,
        queueDepthBefore: args.queueDepthBefore,
        queueDepthAfter: buffer.length,
        persistedThroughSequence,
        latencyMs: lastFlushLatencyMs,
        droppedEventCount,
        sinkFailureCount,
        serializationFailureCount,
        success: args.success,
        errorMessage: args.errorMessage,
      },
    });
  });
}

export function flushNow(): void {
  void flushBatch();
}

// pagehide / teardown flush — non-blocking.
if (typeof window !== 'undefined') {
  const handler = () => flushNow();
  window.addEventListener('pagehide', handler);
  window.addEventListener('beforeunload', handler);
}

/**
 * Insert one probe row and read it back. Non-fatal: on failure we
 * record the result — the readiness gate then keeps the harness closed.
 */
export async function runSinkRoundTripProbe(sessionId: string, buildSha: string): Promise<boolean> {
  if (sinkRoundTripPassed === true) return true;
  if (sinkRoundTripInFlight) return false;
  sinkRoundTripInFlight = true;
  try {
    const probeId = `probe-${sessionId}-${Date.now().toString(36)}`;
    const { error: insErr } = await supabase.from('debug_events').insert({
      event_type: '357.wartime.sink_probe',
      payload: {
        probeId,
        sessionId,
        buildSha,
        sourceSiteId: SRC.SINK_PROBE.id,
        timestampEpochMs: Date.now(),
      },
    } as never);
    if (insErr) {
      sinkRoundTripPassed = false;
      return false;
    }
    const { data, error: selErr } = await supabase
      .from('debug_events')
      .select('id')
      .eq('event_type', '357.wartime.sink_probe')
      .order('created_at', { ascending: false })
      .limit(5);
    if (selErr) {
      sinkRoundTripPassed = false;
      return false;
    }
    sinkRoundTripPassed = Array.isArray(data) && data.length > 0;
    return sinkRoundTripPassed;
  } catch {
    sinkRoundTripPassed = false;
    return false;
  } finally {
    sinkRoundTripInFlight = false;
  }
}

export function isSinkRoundTripPassed(): boolean {
  return sinkRoundTripPassed === true;
}
