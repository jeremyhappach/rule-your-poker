/**
 * cardTransportDbg — per-intent lifecycle record exposed on window and
 * as a subscribable store for the CARD TRANSPORT DBG pill.
 *
 *   window.__cardTransportDbg   →  Record<intentId, CardTransportDbgEntry>
 *   window.__dealDbg            →  Record<handContextId, DealDbgEntry>
 *
 * Tracks the FULL flight lifecycle so motion choppiness can be
 * attributed to a specific cause (animation vs ownership transfer vs
 * remount vs anchor movement vs sequential transforms).
 *
 * Lifecycle samples (launch / midflight / arrival / destroy) capture
 * computed animation + transition CSS so we can prove the flight is a
 * single continuous animation rather than multiple sequential phases.
 */

import type { CardEndpoint, CardFace, DealPhase } from './types';

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardTransportDbgSample {
  /** 'launch' | 'midflight' | 'arrival' | 'destroy' */
  phase: 'launch' | 'midflight' | 'arrival' | 'destroy';
  t: number;
  animationName?: string;
  animationIterationCount?: string;
  animationPlayState?: string;
  animationTimingFunction?: string;
  animationDuration?: string;
  animationDelay?: string;
  transitionProperty?: string;
  transitionDuration?: string;
  transform?: string;
  /** Bounding rect (container-relative) at the moment of the sample. */
  rect?: AnchorRect | null;
}

export interface CardTransportDbgEntry {
  intentId: string;
  cardId?: string;
  face?: CardFace;
  from?: CardEndpoint;
  to?: CardEndpoint;
  fromEndpointFound?: boolean;
  toEndpointFound?: boolean;
  resolvedFromAnchor?: string | null;
  resolvedToAnchor?: string | null;
  fromAnchorRect?: AnchorRect | null;
  toAnchorRect?: AnchorRect | null;
  handContextId?: string | null;
  transportMounted?: boolean;
  transportVisible?: boolean;
  settled?: boolean;
  droppedReason?: string | null;
  durationMs?: number;
  launchDelayMs?: number;
  ownershipClaimDelayMs?: number;
  timingSource?: string;
  dealTimingSettings?: {
    launchSpacingMs: number;
    durationMs: number;
    ownershipClaimDelayMs: number;
    effectiveLaunchSpacingMs: number;
    effectiveDurationMs: number;
  };
  expectedStartTime?: number;
  expectedArrivalTime?: number;
  actualStartDeltaFromPreviousMs?: number | null;
  expectedStartDeltaFromPreviousMs?: number | null;
  startDeltaErrorMs?: number | null;
  startSkewMs?: number | null;
  actualFlightDurationMs?: number | null;
  arrivalSkewMs?: number | null;
  launchProofSource?: string;
  arrivalProofSource?: string;
  dx?: number;
  dy?: number;
  actualStartTime?: number;
  actualArrivalTime?: number;
  ownershipClaimTime?: number;
  transportDestroyedTime?: number;
  portalLayer?: string;
  samples?: CardTransportDbgSample[];
  updatedAt: number;
}

export interface DealDbgEntry {
  handContextId: string;
  phase: DealPhase;
  expectedCount: number;
  cardsDispatched: number;
  cardsSettled: number;
  readyReleased: boolean;
  updatedAt: number;
}

type W = typeof window & {
  __cardTransportDbg?: Record<string, CardTransportDbgEntry>;
  __dealDbg?: Record<string, DealDbgEntry>;
};

const MAX_INTENTS = 60;
const MAX_SAMPLES_PER_INTENT = 8;

// Insertion-ordered list of intentIds for bounded retention.
const order: string[] = [];
const listeners = new Set<() => void>();
let cachedSnapshot: CardTransportDbgEntry[] = [];
let snapshotDirty = true;
let emitScheduled = false;
function emit() {
  snapshotDirty = true;
  if (emitScheduled) return;
  emitScheduled = true;
  const flush = () => {
    emitScheduled = false;
    listeners.forEach((l) => { try { l(); } catch { /* */ } });
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(flush);
  else Promise.resolve().then(flush);
}

function bagCT(): Record<string, CardTransportDbgEntry> {
  if (typeof window === 'undefined') return {};
  const w = window as W;
  if (!w.__cardTransportDbg) w.__cardTransportDbg = {};
  return w.__cardTransportDbg;
}

function bagDeal(): Record<string, DealDbgEntry> {
  if (typeof window === 'undefined') return {};
  const w = window as W;
  if (!w.__dealDbg) w.__dealDbg = {};
  return w.__dealDbg;
}

export function cardTransportDbgUpsert(
  intentId: string,
  patch: Partial<CardTransportDbgEntry>,
): void {
  const bag = bagCT();
  const isNew = !bag[intentId];
  const prev = bag[intentId] ?? { intentId, updatedAt: 0, samples: [] };
  bag[intentId] = {
    ...prev,
    ...patch,
    intentId,
    samples: prev.samples ?? [],
    updatedAt: Date.now(),
  };
  if (isNew) {
    order.push(intentId);
    while (order.length > MAX_INTENTS) {
      const oldest = order.shift();
      if (oldest) delete bag[oldest];
    }
  }
  emit();
}

export function cardTransportDbgSample(
  intentId: string,
  sample: CardTransportDbgSample,
): void {
  const bag = bagCT();
  const entry = bag[intentId];
  if (!entry) return;
  const samples = (entry.samples ?? []).concat(sample);
  entry.samples = samples.slice(-MAX_SAMPLES_PER_INTENT);
  entry.updatedAt = Date.now();
  emit();
}

export function getCardTransportDbg(): CardTransportDbgEntry[] {
  if (snapshotDirty) {
    const bag = bagCT();
    cachedSnapshot = order.map((id) => bag[id]).filter(Boolean);
    snapshotDirty = false;
  }
  return cachedSnapshot;
}

export function subscribeCardTransportDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function clearCardTransportDbg(): void {
  const bag = bagCT();
  for (const id of order) delete bag[id];
  order.length = 0;
  emit();
}

export function formatCardTransportDbgAsText(): string {
  const entries = getCardTransportDbg();
  if (!entries.length) return 'CARD TRANSPORT DBG (empty)\n';
  const lines: string[] = ['CARD TRANSPORT DBG'];
  for (const r of entries) {
    lines.push(
      `${new Date(r.updatedAt).toISOString()} ${r.intentId}`,
      `  cardId=${r.cardId} face=${r.face} handCtx=${r.handContextId ?? '∅'}`,
      `  from=${JSON.stringify(r.from)} → to=${JSON.stringify(r.to)}`,
      `  resolvedFrom=${r.resolvedFromAnchor ?? '?'} resolvedTo=${r.resolvedToAnchor ?? '?'}`,
      `  fromRect=${JSON.stringify(r.fromAnchorRect)} toRect=${JSON.stringify(r.toAnchorRect)}`,
      `  GEOM DEAL SETTINGS source=${r.timingSource ?? '?'} launchSpacing=${r.dealTimingSettings?.launchSpacingMs} duration=${r.dealTimingSettings?.durationMs} ownershipDelay=${r.dealTimingSettings?.ownershipClaimDelayMs}`,
      `  INTENT effectiveSpacing=${r.dealTimingSettings?.effectiveLaunchSpacingMs} effectiveDuration=${r.dealTimingSettings?.effectiveDurationMs} expectedStart=${r.expectedStartTime} expectedArrival=${r.expectedArrivalTime}`,
      `  dx=${r.dx} dy=${r.dy} dur=${r.durationMs} delay=${r.launchDelayMs} ownershipDelay=${r.ownershipClaimDelayMs}`,
      `  actualStart=${r.actualStartTime} actualArrival=${r.actualArrivalTime}`,
      `  LAUNCH PROOF actualΔ=${r.actualStartDeltaFromPreviousMs} expectedΔ=${r.expectedStartDeltaFromPreviousMs} error=${r.startDeltaErrorMs} startSkew=${r.startSkewMs} source=${r.launchProofSource ?? '?'}`,
      `  ARRIVAL PROOF actualFlight=${r.actualFlightDurationMs} arrivalSkew=${r.arrivalSkewMs} source=${r.arrivalProofSource ?? '?'}`,
      `  ownershipClaim=${r.ownershipClaimTime} destroyed=${r.transportDestroyedTime}`,
      `  portal=${r.portalLayer} mounted=${r.transportMounted} visible=${r.transportVisible}`,
      `  settled=${r.settled} dropped=${r.droppedReason ?? '∅'}`,
    );
    for (const s of r.samples ?? []) {
      lines.push(
        `  · ${s.phase}@${s.t.toFixed?.(1) ?? s.t} ` +
          `anim=${s.animationName}/${s.animationPlayState}/${s.animationIterationCount} ` +
          `dur=${s.animationDuration} delay=${s.animationDelay} ease=${s.animationTimingFunction} ` +
          `trans=${s.transitionProperty}/${s.transitionDuration} ` +
          `xform=${s.transform} rect=${JSON.stringify(s.rect)}`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

export function dealDbgUpsert(
  handContextId: string,
  patch: Partial<DealDbgEntry>,
): void {
  const bag = bagDeal();
  const prev =
    bag[handContextId] ?? {
      handContextId,
      phase: 'PRE_DEAL' as DealPhase,
      expectedCount: 0,
      cardsDispatched: 0,
      cardsSettled: 0,
      readyReleased: false,
      updatedAt: 0,
    };
  bag[handContextId] = {
    ...prev,
    ...patch,
    handContextId,
    updatedAt: Date.now(),
  };
}
