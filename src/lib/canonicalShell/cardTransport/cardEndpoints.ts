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
  owner: string | null;
  parent: string | null;
  viewportRect: { x: number; y: number; w: number; h: number };
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
    case 'chucky': return [
      { selector: `[data-card-anchor="chucky-${ep.index}"]`, label: `chucky-${ep.index}` },
    ];
    case 'stock':   return [
      { selector: `[data-card-anchor="stock"]`, label: 'stock' },
    ];
    case 'discard': return [
      { selector: `[data-card-anchor="discard"]`, label: 'discard' },
    ];
    case 'feltDealOrigin': return [
      { selector: `[data-card-anchor="felt-deal-origin"]`, label: 'felt-deal-origin' },
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
    const matches = Array.from(container.querySelectorAll(c.selector)) as HTMLElement[];
    const el = matches.find((m) => m.hasAttribute('data-canonical-shell-viewer-card-endpoint')) ?? matches[0] ?? null;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const parent = el.parentElement;
    return {
      x: r.left - cRect.left + r.width / 2,
      y: r.top - cRect.top + r.height / 2,
      w: r.width,
      h: r.height,
      resolvedAnchor: c.label,
      owner:
        el.getAttribute('data-anchor-owner') ??
        el.getAttribute('data-owner-label') ??
        (el.hasAttribute('data-canonical-shell-viewer-card-endpoint') ? 'ShellViewerCardEndpoint' : null),
      parent: parent
        ? parent.getAttribute('data-canonical-felt-surface') != null
          ? 'data-canonical-felt-surface'
          : parent.getAttribute('data-canonical-shell-slot-content') != null
            ? 'data-canonical-shell-slot-content'
            : parent.getAttribute('data-canonical-table-container') != null
              ? 'data-canonical-table-container'
              : parent.getAttribute('data-owner-label') ?? parent.tagName.toLowerCase()
        : null,
      viewportRect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  }
  return null;
}

export { describeCardEndpoint };
