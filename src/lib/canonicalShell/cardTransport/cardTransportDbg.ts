/**
 * cardTransportDbg — per-intent lifecycle record exposed on window.
 *
 *   window.__cardTransportDbg   →  Record<intentId, CardTransportDbgEntry>
 *   window.__dealDbg            →  Record<handContextId, DealDbgEntry>
 */

import type { CardEndpoint, CardFace, DealPhase } from './types';

export interface CardTransportDbgEntry {
  intentId: string;
  cardId?: string;
  face?: CardFace;
  from?: CardEndpoint;
  to?: CardEndpoint;
  fromEndpointFound?: boolean;
  toEndpointFound?: boolean;
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
