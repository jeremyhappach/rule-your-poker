/**
 * chipEndpoints — P8.1 pure endpoint resolver for canonical chip transport.
 *
 * Resolves a `ChipEndpointRef` ({ kind: 'seat', position } | { kind: 'pot' })
 * into pixel coordinates relative to a given container rect.
 *
 * Coordinate sourcing strategy (mirrors the proven pattern in
 * ChipTransferAnimation: DOM-first with cached percentage fallback):
 *   1. Query the container for `[data-chip-center="<position>"]` or
 *      `[data-canonical-shell-pot-anchor]` and use its measured center.
 *   2. Fall back to a per-position percent cache when the element is
 *      temporarily absent (e.g. showdown reflow).
 *
 * Projection invariant: this module does NOT compute projection. It
 * trusts whatever the live DOM exposes. Anchor placement (active=relative,
 * observer=absolute) is owned upstream by `SeatAnchorLayer` and the seat
 * components that render the `data-chip-center` markers. The resolver
 * therefore preserves the invariant by construction.
 *
 * Pure / no React. The cache is a caller-owned record so callers control
 * cache lifetime.
 */

import type { ChipEndpointRef } from './GameplaySlotContract';

export interface ResolvedEndpoint {
  x: number;
  y: number;
}

export type EndpointCache = Record<string, { xPct: number; yPct: number }>;

export interface ResolveEndpointArgs {
  ref: ChipEndpointRef;
  container: HTMLElement;
  cache?: EndpointCache;
}

function cacheKeyFor(ref: ChipEndpointRef): string {
  return ref.kind === 'pot' ? 'pot' : `seat:${ref.position}`;
}

function selectorFor(ref: ChipEndpointRef): string {
  if (ref.kind === 'pot') return '[data-canonical-shell-pot-anchor]';
  // Match the existing seat-chip marker contract used by
  // ChipTransferAnimation (`data-chip-center`) so the new runtime
  // targets the same DOM nodes without any seat-component changes.
  return `[data-chip-center="${ref.position}"]`;
}

/**
 * Resolve an endpoint reference to coordinates within the given container.
 * Returns null when neither the live DOM nor the cache can place the
 * endpoint — callers MUST treat null as a diagnostic-worthy event.
 */
export function resolveChipEndpoint(
  args: ResolveEndpointArgs,
): ResolvedEndpoint | null {
  const { ref, container, cache } = args;
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width <= 0 || containerRect.height <= 0) return null;

  const el = container.querySelector(selectorFor(ref)) as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    const x = r.left - containerRect.left + r.width / 2;
    const y = r.top - containerRect.top + r.height / 2;
    if (cache) {
      cache[cacheKeyFor(ref)] = {
        xPct: x / containerRect.width,
        yPct: y / containerRect.height,
      };
    }
    return { x, y };
  }

  if (cache) {
    const hit = cache[cacheKeyFor(ref)];
    if (hit) {
      return {
        x: hit.xPct * containerRect.width,
        y: hit.yPct * containerRect.height,
      };
    }
  }

  return null;
}

export function describeEndpoint(ref: ChipEndpointRef): string {
  return ref.kind === 'pot' ? 'pot' : `seat:${ref.position}`;
}
