/**
 * cardEndpoints — pure endpoint resolver for canonical card transport.
 *
 * Every owner publishes `[data-card-anchor="<key>"]` on its visible
 * geometry root. The resolver returns container-relative center coords.
 */

import type { CardEndpoint } from './types';
import { describeCardEndpoint } from './types';

export interface ResolvedCardEndpoint {
  x: number;
  y: number;
  w: number;
  h: number;
}

function anchorKeys(ep: CardEndpoint): string[] {
  switch (ep.kind) {
    // Dealer origin resolves to the dealer's published anchor first,
    // then falls back to the dealer's hand or seat anchor so games can
    // wire incrementally without a dedicated dealer-button anchor.
    case 'dealer':  return [`dealer-${ep.playerId}`, `hand-${ep.playerId}`];
    case 'seat':    return [`seat-${ep.position}`];
    case 'hand':    return [`hand-${ep.playerId}`];
    case 'stock':   return ['stock'];
    case 'discard': return ['discard'];
  }
}

export function cardAnchorSelector(ep: CardEndpoint): string {
  return anchorKeys(ep).map(k => `[data-card-anchor="${k}"]`).join(',');
}

export function resolveCardEndpoint(
  ep: CardEndpoint,
  container: HTMLElement,
): ResolvedCardEndpoint | null {
  const cRect = container.getBoundingClientRect();
  if (cRect.width <= 0 || cRect.height <= 0) return null;
  let el: HTMLElement | null = null;
  for (const key of anchorKeys(ep)) {
    el = container.querySelector(`[data-card-anchor="${key}"]`) as HTMLElement | null;
    if (el) break;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.left - cRect.left + r.width / 2,
    y: r.top - cRect.top + r.height / 2,
    w: r.width,
    h: r.height,
  };
}

export { describeCardEndpoint };
