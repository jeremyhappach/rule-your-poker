/**
 * cardEndpoints — pure endpoint resolver for canonical card transport.
 *
 * Every owner publishes `[data-card-anchor="<key>"]` on its visible
 * geometry root. The resolver returns container-relative center coords.
 *
 * Wave 1 fallbacks (so games can wire incrementally):
 *   - seat-${pos}        → also matches `[data-chip-center="${pos}"]`.
 *   - dealer-${playerId} → also matches `[data-card-anchor="hand-${playerId}"]`.
 *
 * The resolved key (anchor that actually matched) is returned so the
 * runtime can record it on the dbg entry.
 */

import type { CardEndpoint } from './types';
import { describeCardEndpoint } from './types';

export interface ResolvedCardEndpoint {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The DOM attribute string that matched. e.g. "hand-abc" or "chip-center:0". */
  resolvedAnchor: string;
}

interface AnchorCandidate { selector: string; label: string; }

function anchorCandidates(ep: CardEndpoint): AnchorCandidate[] {
  switch (ep.kind) {
    case 'dealer':  return [
      { selector: `[data-card-anchor="dealer-${ep.playerId}"]`, label: `dealer-${ep.playerId}` },
      { selector: `[data-card-anchor="hand-${ep.playerId}"]`,   label: `hand-${ep.playerId}` },
    ];
    case 'seat':    return [
      { selector: `[data-card-anchor="seat-${ep.position}"]`, label: `seat-${ep.position}` },
      { selector: `[data-chip-center="${ep.position}"]`,      label: `chip-center:${ep.position}` },
    ];
    case 'hand':    return [
      { selector: `[data-card-anchor="hand-${ep.playerId}"]`, label: `hand-${ep.playerId}` },
    ];
    case 'stock':   return [
      { selector: `[data-card-anchor="stock"]`, label: 'stock' },
    ];
    case 'discard': return [
      { selector: `[data-card-anchor="discard"]`, label: 'discard' },
    ];
  }
}

export function cardAnchorSelector(ep: CardEndpoint): string {
  return anchorCandidates(ep).map(c => c.selector).join(',');
}

export function resolveCardEndpoint(
  ep: CardEndpoint,
  container: HTMLElement,
): ResolvedCardEndpoint | null {
  const cRect = container.getBoundingClientRect();
  if (cRect.width <= 0 || cRect.height <= 0) return null;
  for (const c of anchorCandidates(ep)) {
    const el = container.querySelector(c.selector) as HTMLElement | null;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    return {
      x: r.left - cRect.left + r.width / 2,
      y: r.top - cRect.top + r.height / 2,
      w: r.width,
      h: r.height,
      resolvedAnchor: c.label,
    };
  }
  return null;
}

export { describeCardEndpoint };
