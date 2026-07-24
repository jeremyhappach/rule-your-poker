/**
 * 3-5-7 Wartime — Phase 2 production wiring.
 *
 * Provides React hooks used by the concrete 3-5-7 owners. Each hook
 * emits the events required by its coverage manifest slot AND calls
 * markRequirementInstalled from its own module. The requirement is
 * only considered installed once every expected source site has been
 * registered (see coverage.ts).
 */

import { useEffect, useRef } from 'react';
import { emitWartime, type WartimeIdentity, type WartimeOwner } from './emit';

let componentSeq = 0;
function makeInstanceId(componentType: string): string {
  componentSeq += 1;
  return `${componentType}#${componentSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Assigns a stable componentInstanceId, emits mount/unmount, and
 * emits render_branch every time the identity or branch inputs change.
 */
export function useWartimeComponentInstance(opts: {
  componentType: string;
  sourceSiteId: string;
  identity: WartimeIdentity;
  branch?: Record<string, unknown>;
}): WartimeOwner {
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = makeInstanceId(opts.componentType);
  const renderEpochRef = useRef(0);
  renderEpochRef.current += 1;

  const owner: WartimeOwner = {
    componentType: opts.componentType,
    componentInstanceId: idRef.current,
    renderEpoch: renderEpochRef.current,
  };

  // Mount / unmount
  useEffect(() => {
    emitWartime({
      eventName: 'component_mount',
      sourceSiteId: opts.sourceSiteId,
      identity: opts.identity,
      owner,
      payload: { branch: opts.branch ?? null },
    });
    return () => {
      emitWartime({
        eventName: 'component_unmount',
        sourceSiteId: opts.sourceSiteId,
        identity: opts.identity,
        owner,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render branch — emit only when branch signature changes
  const branchSigRef = useRef<string>('');
  const nextSig = JSON.stringify(opts.branch ?? null);
  useEffect(() => {
    if (branchSigRef.current === nextSig) return;
    branchSigRef.current = nextSig;
    emitWartime({
      eventName: 'render_branch_changed',
      sourceSiteId: opts.sourceSiteId,
      identity: opts.identity,
      owner,
      payload: { branch: opts.branch ?? null },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSig]);

  return owner;
}

/**
 * Emits a `state_write` event every time value changes (identity-tagged).
 * Use for React setState-backed values.
 */
export function useWartimeStateWrite<T>(opts: {
  fieldName: string;
  sourceSiteId: string;
  value: T;
  owner?: WartimeOwner;
  identity?: WartimeIdentity;
}): void {
  const prevRef = useRef<T | typeof SENTINEL>(SENTINEL as never);
  useEffect(() => {
    const prev = prevRef.current;
    if (prev === opts.value) return;
    emitWartime({
      eventName: 'state_write',
      sourceSiteId: opts.sourceSiteId,
      identity: opts.identity,
      owner: opts.owner,
      payload: {
        fieldName: opts.fieldName,
        previous: prev === SENTINEL ? '__init__' : (prev as unknown),
        next: opts.value as unknown,
      },
    });
    prevRef.current = opts.value;
  }, [opts.fieldName, opts.sourceSiteId, opts.value, opts.owner, opts.identity]);
}

const SENTINEL = Symbol('__wartime_state_init__');

/**
 * Explicit ref-write helper. Callers invoke immediately BEFORE
 * assigning the ref. Emits a `ref_write` event.
 */
export function emitRefWrite(opts: {
  fieldName: string;
  sourceSiteId: string;
  previous: unknown;
  next: unknown;
  owner?: WartimeOwner;
  identity?: WartimeIdentity;
  reason?: string;
}): void {
  emitWartime({
    eventName: 'ref_write',
    sourceSiteId: opts.sourceSiteId,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      fieldName: opts.fieldName,
      previous: opts.previous,
      next: opts.next,
      reason: opts.reason ?? null,
    },
  });
}

/**
 * Emit an authoritative snapshot at a checkpoint. Caller passes the
 * canonical fields; the wartime envelope carries identity separately.
 */
export function emitAuthoritativeSnapshot(opts: {
  checkpoint: string;
  sourceSiteId: string;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  snapshot: Record<string, unknown>;
}): void {
  emitWartime({
    eventName: 'authoritative_snapshot',
    sourceSiteId: opts.sourceSiteId,
    identity: opts.identity,
    owner: opts.owner,
    payload: { checkpoint: opts.checkpoint, snapshot: opts.snapshot },
  });
}

// ── Deal channels ─────────────────────────────────────────────
export function emitSelfFaceUpChannel(opts: {
  event: 'first_card_visible' | 'full_hand_visible' | 'wave_begin' | 'wave_complete' | 'channel_settled';
  sourceSiteId: string;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  payload?: Record<string, unknown>;
}): void {
  emitWartime({
    eventName: `deal.self_face_up.${opts.event}`,
    sourceSiteId: opts.sourceSiteId,
    identity: opts.identity,
    owner: opts.owner,
    payload: { channel: 'self_face_up', ...(opts.payload ?? {}) },
  });
}

export function emitOpponentCardBackChannel(opts: {
  event: 'wave_dispatch_begin' | 'wave_dispatch_complete' | 'card_settled' | 'channel_settled';
  sourceSiteId: string;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  payload?: Record<string, unknown>;
}): void {
  emitWartime({
    eventName: `deal.opponent_card_back.${opts.event}`,
    sourceSiteId: opts.sourceSiteId,
    identity: opts.identity,
    owner: opts.owner,
    payload: { channel: 'opponent_card_back', ...(opts.payload ?? {}) },
  });
}

/**
 * Track the identity a deal wave was dispatched under; on a subsequent
 * dispatch attempt, compare and emit a redispatch_attempt if the prior
 * identity was already settled or terminal.
 */
export function useDealRedispatchDetector(opts: {
  sourceSiteId: string;
  currentIdentity: WartimeIdentity;
  currentIdentityKey: string | null;
  isTerminalOrStale: boolean;
}): void {
  const lastDispatchedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!opts.currentIdentityKey) return;
    if (lastDispatchedKeyRef.current === opts.currentIdentityKey && opts.isTerminalOrStale) {
      emitWartime({
        eventName: 'deal.redispatch_attempt',
        sourceSiteId: opts.sourceSiteId,
        identity: opts.currentIdentity,
        payload: {
          identityKey: opts.currentIdentityKey,
          lastDispatchedKey: lastDispatchedKeyRef.current,
          isTerminalOrStale: opts.isTerminalOrStale,
        },
        captureStack: true,
      });
    }
    lastDispatchedKeyRef.current = opts.currentIdentityKey;
  }, [opts.currentIdentityKey, opts.isTerminalOrStale, opts.sourceSiteId, opts.currentIdentity]);
}

// ── Requirement installation ──────────────────────────────────
// Phase 2 requirement/site installation moved to readiness.ts
// (see installPhase2Site). This module owns hook primitives only;
// the truthful production owner + actual-emitter-invocation
// registration lives in the readiness bootstrap, so a single path
// asserts that every mandatory Phase 2 site is wired.
