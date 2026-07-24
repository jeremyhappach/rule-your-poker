/**
 * 3-5-7 Wartime — DB mutation causality.
 *
 * Wraps a supabase mutation promise with begin/complete/error emits
 * and a requestId that correlates a mutation to its authoritative
 * realtime receipt on the caller side.
 */

import { emitWartime, type WartimeIdentity } from './emit';
import { markRequirementInstalled } from './coverage';
import { SRC } from './sourceSites';

let dbSeq = 0;
function makeRequestId(label: string): string {
  dbSeq += 1;
  return `db.${label}.${dbSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

interface DbCtx {
  label: string;
  sourceSiteId: string;
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert' | 'select';
  identity?: WartimeIdentity;
  payload?: Record<string, unknown>;
}

export async function withWartimeMutation<T extends { error: unknown }>(
  ctx: DbCtx,
  runner: (requestId: string) => Promise<T>,
): Promise<T> {
  const requestId = makeRequestId(ctx.label);
  emitWartime({
    eventName: 'db_mutation_begin',
    sourceSiteId: ctx.sourceSiteId,
    identity: ctx.identity,
    payload: { requestId, table: ctx.table, op: ctx.op, ...(ctx.payload ?? {}) },
  });
  const started = performance.now();
  try {
    const res = await runner(requestId);
    if ((res as { error?: { message?: string } | null }).error) {
      const errObj = (res as { error?: { message?: string } | null }).error;
      emitWartime({
        eventName: 'db_mutation_error',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: {
          requestId,
          table: ctx.table,
          op: ctx.op,
          message: errObj?.message ?? null,
          latencyMs: performance.now() - started,
        },
      });
    } else {
      emitWartime({
        eventName: 'db_mutation_complete',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: {
          requestId,
          table: ctx.table,
          op: ctx.op,
          latencyMs: performance.now() - started,
        },
      });
    }
    return res;
  } catch (err) {
    emitWartime({
      eventName: 'db_mutation_error',
      sourceSiteId: ctx.sourceSiteId,
      identity: ctx.identity,
      payload: {
        requestId,
        table: ctx.table,
        op: ctx.op,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: performance.now() - started,
      },
      captureStack: true,
    });
    throw err;
  }
}

markRequirementInstalled('db.mutation_causality', SRC.DB_MUTATION.id);
