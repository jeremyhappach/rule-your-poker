/**
 * Cribbage dealer-draw trace.
 *
 * Per-active-game ring buffer (≥200 events) that captures every
 * controller surface lifecycle, gating-input snapshot, completion
 * event, setShowHighCardSelection transition, and
 * loadOrInitializeState branch — with stable per-mount
 * controllerInstanceId AND identifies the actual calling surface at
 * the component boundary:
 *
 *   - 'Game.HighCardDealerSelection'
 *   - 'CribbageMobileGameTable.CribbageDealerSelectionController.sessionPhase'
 *   - 'CribbageMobileGameTable.CribbageDealerSelectionController.roundPhase'
 *
 * Local on-screen buffer is authoritative for export. Forwards each
 * event to `persistSyncDebugEvent` as a secondary cross-reference;
 * persistence failures never affect capture or gameplay.
 *
 * Gated by:
 *   - URL  ?crib_dealer_draw_trace=1   (or 0 to force off)
 *   - localStorage  ptp_crib_dealer_draw_trace = '1' | '0'
 *   - default: ON (active bug hunt)
 *
 * NO timers, guards, refs, ownership cleanup, lifecycle changes, or
 * attempted fix. Observation only.
 */

import { useEffect, useRef } from 'react';
import { persistSyncDebugEvent } from './persistSyncDebugEvent';

export type CribDealerDrawSurface =
  | 'Game.HighCardDealerSelection'
  | 'CribbageMobileGameTable.CribbageDealerSelectionController.sessionPhase'
  | 'CribbageMobileGameTable.CribbageDealerSelectionController.roundPhase'
  | 'CribbageMobileGameTable.loadOrInitializeState'
  | 'CribbageMobileGameTable.handleHighCardComplete'
  | 'CribbageMobileGameTable.setShowHighCardSelection';

export interface CribDealerDrawEvent {
  seq: number;
  ts: number;
  tsIso: string;
  gameId: string;
  surface: CribDealerDrawSurface;
  controllerInstanceId?: string | null;
  event: string;
  payload: Record<string, unknown>;
}

const RING_CAPACITY = 400; // ≥ 200 per requirement; headroom for repros

const ENABLED_DEFAULT = true;

let _enabledCache: boolean | null = null;
export function isCribDealerDrawTraceEnabled(): boolean {
  if (_enabledCache !== null) return _enabledCache;
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('crib_dealer_draw_trace');
    if (v === '0' || v?.toLowerCase() === 'false') return (_enabledCache = false);
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return (_enabledCache = true);
  } catch { /* */ }
  try {
    const v = window.localStorage.getItem('ptp_crib_dealer_draw_trace');
    if (v === '0') return (_enabledCache = false);
    if (v === '1') return (_enabledCache = true);
  } catch { /* */ }
  return (_enabledCache = ENABLED_DEFAULT);
}

// Per-game ring buffers
const buffers: Map<string, CribDealerDrawEvent[]> = new Map();
const listeners: Map<string, Set<() => void>> = new Map();
let seq = 0;

function ringPush(gameId: string, evt: CribDealerDrawEvent) {
  let buf = buffers.get(gameId);
  if (!buf) {
    buf = [];
    buffers.set(gameId, buf);
  }
  buf.push(evt);
  if (buf.length > RING_CAPACITY) buf.splice(0, buf.length - RING_CAPACITY);
  const ls = listeners.get(gameId);
  if (ls) for (const fn of ls) { try { fn(); } catch { /* */ } }
}

export function getCribDealerDrawBuffer(gameId: string): CribDealerDrawEvent[] {
  return [...(buffers.get(gameId) ?? [])];
}

export function clearCribDealerDrawBuffer(gameId: string) {
  buffers.set(gameId, []);
  const ls = listeners.get(gameId);
  if (ls) for (const fn of ls) { try { fn(); } catch { /* */ } }
}

export function subscribeCribDealerDraw(gameId: string, fn: () => void): () => void {
  let ls = listeners.get(gameId);
  if (!ls) { ls = new Set(); listeners.set(gameId, ls); }
  ls.add(fn);
  return () => { ls?.delete(fn); };
}

/**
 * Record a trace event. Local buffer is authoritative; persistence
 * is best-effort and never throws.
 */
export function recordCribDealerDraw(args: {
  gameId: string;
  surface: CribDealerDrawSurface;
  controllerInstanceId?: string | null;
  event: string;
  payload?: Record<string, unknown>;
}): void {
  if (!isCribDealerDrawTraceEnabled()) return;
  if (!args.gameId) return;
  const ts = Date.now();
  const s = ++seq;
  const evt: CribDealerDrawEvent = {
    seq: s,
    ts,
    tsIso: new Date(ts).toISOString(),
    gameId: args.gameId,
    surface: args.surface,
    controllerInstanceId: args.controllerInstanceId ?? null,
    event: args.event,
    payload: args.payload ?? {},
  };
  try { ringPush(args.gameId, evt); } catch { /* never throw */ }
  // Secondary cross-reference — failure does not affect capture.
  try {
    persistSyncDebugEvent({
      gameId: args.gameId,
      gameType: 'cribbage',
      handNumber: (args.payload?.handNumber as number | undefined) ?? 0,
      eventType: 'transition',
      severity: 'info',
      eventName: `cribDealerDraw:${args.surface}:${args.event}:${s}`,
      payload: {
        seq: s,
        ts,
        surface: args.surface,
        controllerInstanceId: args.controllerInstanceId ?? null,
        event: args.event,
        ...(args.payload ?? {}),
      },
    });
  } catch { /* never throw */ }
}

/**
 * React hook: wires mount/update/unmount + per-render gating-input
 * snapshot + initializer-attempt count for one surface boundary.
 * Returns a stable controllerInstanceId for callers that emit
 * additional events (e.g. completion).
 */
export function useCribDealerDrawSurfaceTrace(args: {
  gameId: string;
  surface: CribDealerDrawSurface;
  gating: Record<string, unknown>;
}): string {
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = `${args.surface}#${
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10)
    }`;
  }
  const controllerInstanceId = idRef.current;
  const updateCountRef = useRef(0);
  const initAttemptRef = useRef(0);
  const lastGatingKeyRef = useRef<string | null>(null);

  // Mount / unmount (once)
  useEffect(() => {
    initAttemptRef.current += 1;
    recordCribDealerDraw({
      gameId: args.gameId,
      surface: args.surface,
      controllerInstanceId,
      event: 'mount',
      payload: { initializerAttempt: initAttemptRef.current, gating: args.gating },
    });
    return () => {
      recordCribDealerDraw({
        gameId: args.gameId,
        surface: args.surface,
        controllerInstanceId,
        event: 'unmount',
        payload: { totalUpdates: updateCountRef.current, lastGating: args.gating },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-render gating-input snapshot (emits only when snapshot changes)
  const gatingKey = JSON.stringify(args.gating);
  if (lastGatingKeyRef.current !== gatingKey) {
    const isFirst = lastGatingKeyRef.current === null;
    lastGatingKeyRef.current = gatingKey;
    if (!isFirst) {
      updateCountRef.current += 1;
      recordCribDealerDraw({
        gameId: args.gameId,
        surface: args.surface,
        controllerInstanceId,
        event: 'gating-change',
        payload: { updateIndex: updateCountRef.current, gating: args.gating },
      });
    }
  }

  return controllerInstanceId;
}
