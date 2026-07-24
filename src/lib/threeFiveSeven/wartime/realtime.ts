/**
 * 3-5-7 Wartime — Realtime callback ownership.
 *
 * Wraps a realtime handler with an owner ID and local receipt sequence
 * so authoritative pushes can be causally correlated to their local
 * effects.
 */

import { emitWartime, type WartimeIdentity } from './emit';
import { markRequirementInstalled } from './coverage';
import { SRC } from './sourceSites';

let receiptSeq = 0;
let ownerSeq = 0;

export function wrapWartimeRealtime<TPayload>(opts: {
  channelLabel: string;
  sourceSiteId: string;
  identity?: () => WartimeIdentity | undefined;
  handler: (payload: TPayload) => void | Promise<void>;
}): (payload: TPayload) => void {
  ownerSeq += 1;
  const ownerId = `rt.${opts.channelLabel}.${ownerSeq.toString(36)}`;
  return (payload: TPayload) => {
    receiptSeq += 1;
    const identity = opts.identity?.() ?? undefined;
    emitWartime({
      eventName: 'realtime_receipt',
      sourceSiteId: opts.sourceSiteId,
      identity,
      payload: {
        ownerId,
        channelLabel: opts.channelLabel,
        localReceiptSequence: receiptSeq,
        payloadKind: describePayload(payload),
      },
    });
    try {
      void opts.handler(payload);
    } catch (err) {
      emitWartime({
        eventName: 'realtime_handler_error',
        sourceSiteId: opts.sourceSiteId,
        identity,
        payload: {
          ownerId,
          message: err instanceof Error ? err.message : String(err),
        },
        captureStack: true,
      });
    }
  };
}

function describePayload(p: unknown): string {
  if (!p || typeof p !== 'object') return typeof p;
  const anyP = p as { eventType?: string; table?: string; schema?: string };
  return `${anyP.schema ?? '?'}.${anyP.table ?? '?'}:${anyP.eventType ?? '?'}`;
}

markRequirementInstalled('realtime.owner', SRC.REALTIME_OWNER.id);
