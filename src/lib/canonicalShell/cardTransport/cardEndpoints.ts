/**
 * cardEndpoints — pure endpoint resolver for canonical card transport.
 *
 * Invariant: cards terminate where cards are owned.
 *   - [data-card-anchor="opp-stack-${position}"]  — opponent card stack
 *   - [data-card-anchor="hand-${playerId}"]       — local active hand
 *   - [data-card-anchor="community-${idx}"]       — shared community slot
 *   - [data-card-anchor="stock-..."] / "stock"    — draw pile
 *   - [data-card-anchor="discard"]                — discard pile
 *   - [data-card-anchor="seat-${pos}"]            — generic seat origin
 *   - [data-card-anchor="dealer-${playerId}"]     — current dealer origin
 *
 * [data-chip-center] / [data-pot-anchor] are reserved for ECONOMY
 * (chip transport) only. This resolver MUST NOT fall back to them —
 * cards flying to chip geometry then "teleporting" into a stack is
 * exactly the artifact this contract eliminates.
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
  /** The DOM attribute string that matched. e.g. "hand-abc" or "opp-stack-2". */
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
      { selector: `[data-card-anchor="seat-${ep.position}"]`,      label: `seat-${ep.position}` },
      { selector: `[data-card-anchor="opp-stack-${ep.position}"]`, label: `opp-stack-${ep.position}` },
    ];
    case 'oppStack': return [
      { selector: `[data-card-anchor="opp-stack-${ep.position}"]`, label: `opp-stack-${ep.position}` },
      { selector: `[data-card-anchor="seat-${ep.position}"]`,      label: `seat-${ep.position}` },
    ];
    case 'hand':    return [
      { selector: `[data-card-anchor="hand-${ep.playerId}"]`, label: `hand-${ep.playerId}` },
    ];
    case 'community': return [
      { selector: `[data-card-anchor="community-${ep.index}"]`, label: `community-${ep.index}` },
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
