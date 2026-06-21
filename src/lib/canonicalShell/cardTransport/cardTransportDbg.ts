/**
 * cardTransportDbg — per-intent lifecycle record exposed on window.
 *
 *   window.__cardTransportDbg   →  Record<intentId, CardTransportDbgEntry>
 *   window.__dealDbg            →  Record<handContextId, DealDbgEntry>
 *
 * Wave 1 additions (Cribbage smoke):
 *   - resolvedFromAnchor / resolvedToAnchor: the actual DOM anchor key
 *     the resolver matched (e.g. "hand-abc123" or "chip-center:0").
 *   - anchorRect: container-relative {x,y,w,h} for both endpoints so
 *     wrong-origin bugs are visible without DevTools.
 *   - handContextId: stamped from the dispatching intent so each flight
 *     is traceable to its hand without joining tables in the console.
 */

import type { CardEndpoint, CardFace, DealPhase } from './types';

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  const prev = bag[intentId] ?? { intentId, updatedAt: 0 };
  bag[intentId] = { ...prev, ...patch, intentId, updatedAt: Date.now() };
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
