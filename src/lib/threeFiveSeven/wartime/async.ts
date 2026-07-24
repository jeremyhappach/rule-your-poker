/**
 * 3-5-7 Wartime — Async ownership registry.
 *
 * Every wrapped timer/rAF/promise emits owner_registered/settled events
 * so the reconstructor can attribute a callback to the code path that
 * scheduled it. Callers pass an ownerLabel + identity; a stable
 * asyncOwnerId is allocated and reported.
 */

import { emitWartime, type WartimeIdentity } from './emit';
import { markRequirementInstalled } from './coverage';
import { SRC } from './sourceSites';

let asyncOwnerSeq = 0;
function makeAsyncOwnerId(label: string): string {
  asyncOwnerSeq += 1;
  return `${label}-${asyncOwnerSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

interface WartimeAsyncCtx {
  ownerLabel: string;
  sourceSiteId: string;
  identity?: WartimeIdentity;
  payload?: Record<string, unknown>;
}

export function setWartimeTimeout(fn: () => void, ms: number, ctx: WartimeAsyncCtx): number {
  const asyncOwnerId = makeAsyncOwnerId(`t.${ctx.ownerLabel}`);
  emitWartime({
    eventName: 'async_owner_registered',
    sourceSiteId: ctx.sourceSiteId,
    identity: ctx.identity,
    payload: { asyncOwnerId, kind: 'setTimeout', ms, ...(ctx.payload ?? {}) },
  });
  return window.setTimeout(() => {
    const startedAt = performance.now();
    try {
      fn();
      emitWartime({
        eventName: 'async_owner_settled',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: {
          asyncOwnerId,
          kind: 'setTimeout',
          outcome: 'ok',
          runMs: performance.now() - startedAt,
        },
      });
    } catch (err) {
      emitWartime({
        eventName: 'async_owner_settled',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: {
          asyncOwnerId,
          kind: 'setTimeout',
          outcome: 'threw',
          message: err instanceof Error ? err.message : String(err),
        },
        captureStack: true,
      });
      throw err;
    }
  }, ms);
}

export function requestWartimeAnimationFrame(fn: (t: number) => void, ctx: WartimeAsyncCtx): number {
  const asyncOwnerId = makeAsyncOwnerId(`raf.${ctx.ownerLabel}`);
  emitWartime({
    eventName: 'async_owner_registered',
    sourceSiteId: ctx.sourceSiteId,
    identity: ctx.identity,
    payload: { asyncOwnerId, kind: 'rAF', ...(ctx.payload ?? {}) },
  });
  return window.requestAnimationFrame((t) => {
    try {
      fn(t);
      emitWartime({
        eventName: 'async_owner_settled',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: { asyncOwnerId, kind: 'rAF', outcome: 'ok' },
      });
    } catch (err) {
      emitWartime({
        eventName: 'async_owner_settled',
        sourceSiteId: ctx.sourceSiteId,
        identity: ctx.identity,
        payload: {
          asyncOwnerId,
          kind: 'rAF',
          outcome: 'threw',
          message: err instanceof Error ? err.message : String(err),
        },
        captureStack: true,
      });
      throw err;
    }
  });
}

export async function trackWartimePromise<T>(
  p: Promise<T>,
  ctx: WartimeAsyncCtx,
): Promise<T> {
  const asyncOwnerId = makeAsyncOwnerId(`p.${ctx.ownerLabel}`);
  emitWartime({
    eventName: 'async_owner_registered',
    sourceSiteId: ctx.sourceSiteId,
    identity: ctx.identity,
    payload: { asyncOwnerId, kind: 'promise', ...(ctx.payload ?? {}) },
  });
  try {
    const v = await p;
    emitWartime({
      eventName: 'async_owner_settled',
      sourceSiteId: ctx.sourceSiteId,
      identity: ctx.identity,
      payload: { asyncOwnerId, kind: 'promise', outcome: 'resolved' },
    });
    return v;
  } catch (err) {
    emitWartime({
      eventName: 'async_owner_settled',
      sourceSiteId: ctx.sourceSiteId,
      identity: ctx.identity,
      payload: {
        asyncOwnerId,
        kind: 'promise',
        outcome: 'rejected',
        message: err instanceof Error ? err.message : String(err),
      },
      captureStack: true,
    });
    throw err;
  }
}

// Module-load registration: the primitives above are the required
// production hook for async ownership. Any caller who imports one of
// these has the registry available.
markRequirementInstalled('async.owner_registry', SRC.ASYNC_REGISTRY.id);
