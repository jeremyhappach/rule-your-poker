import { logDebugEvent } from './debugEventLogger';
import { buildMetaPayload } from './buildMeta';

type TraceState = {
  traceId: string;
  seq: number;
  startedAtMs: number;
};

const traceByGameId = new Map<string, TraceState>();

function makeTraceId(): string {
  return `handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function hasCribbageHandoffTrace(gameId: string): boolean {
  return traceByGameId.has(gameId);
}

export function beginCribbageHandoffTrace(gameId: string, reason: string): string {
  const next: TraceState = {
    traceId: makeTraceId(),
    seq: 0,
    startedAtMs: Date.now(),
  };
  traceByGameId.set(gameId, next);

  emitCribbageHandoffTrace({
    gameId,
    eventType: 'trace_begin',
    context: { reason },
  });

  return next.traceId;
}

function ensureTrace(gameId: string): TraceState {
  const existing = traceByGameId.get(gameId);
  if (existing) return existing;
  const next: TraceState = {
    traceId: makeTraceId(),
    seq: 0,
    startedAtMs: Date.now(),
  };
  traceByGameId.set(gameId, next);
  return next;
}

export function emitCribbageHandoffTrace(params: {
  gameId: string;
  eventType: string;
  clientRole?: string;
  roundId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
}): { traceId: string; seq: number } {
  const trace = ensureTrace(params.gameId);
  trace.seq += 1;

  const tsMs = Date.now();
  const tsIso = new Date(tsMs).toISOString();

  logDebugEvent({
    gameId: params.gameId,
    roundId: params.roundId ?? null,
    userId: params.userId ?? null,
    clientRole: params.clientRole,
    eventType: `crib:handoff:${params.eventType}`,
    traceId: trace.traceId,
    payload: {
      actionCount: trace.seq,
      timelineSeq: trace.seq,
      timestampMs: tsMs,
      timestampIso: tsIso,
      traceStartedAtMs: trace.startedAtMs,
      ...buildMetaPayload(),
      ...(params.context ?? {}),
    },
  });

  return { traceId: trace.traceId, seq: trace.seq };
}
