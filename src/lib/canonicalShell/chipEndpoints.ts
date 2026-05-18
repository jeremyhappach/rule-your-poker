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
  /**
   * Caller context label used in diagnostics when fallback fires
   * (e.g. 'holm-win-pot', '357-ante'). Optional but recommended.
   */
  debugLabel?: string;
}

function cacheKeyFor(ref: ChipEndpointRef): string {
  return ref.kind === 'pot' ? 'pot' : `seat:${ref.position}`;
}

/**
 * Selector chain — first match wins. For the pot endpoint the canonical
 * truth is the gameplay-surface-owned `[data-pot-anchor]` element (the
 * actual visible pot zone). The shell-root marker
 * `[data-canonical-shell-pot-anchor]` is a SAFETY/DEBUG fallback only —
 * if it ever resolves we emit a loud warning because chip transport
 * silently targeting a generic shell-center is exactly the failure
 * mode P8.2a is meant to eliminate.
 */
function selectorsFor(ref: ChipEndpointRef): string[] {
  if (ref.kind === 'pot') {
    return ['[data-pot-anchor]', '[data-canonical-shell-pot-anchor]'];
  }
  // Match the existing seat-chip marker contract used by
  // ChipTransferAnimation (`data-chip-center`) so the new runtime
  // targets the same DOM nodes without any seat-component changes.
  return [`[data-chip-center="${ref.position}"]`];
}

/**
 * Resolve an endpoint reference to coordinates within the given container.
 * Returns null when neither the live DOM nor the cache can place the
 * endpoint — callers MUST treat null as a diagnostic-worthy event.
 */
export function resolveChipEndpoint(
  args: ResolveEndpointArgs,
): ResolvedEndpoint | null {
  const { ref, container, cache, debugLabel } = args;
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width <= 0 || containerRect.height <= 0) return null;

  const selectors = selectorsFor(ref);
  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i];
    const el = container.querySelector(sel) as HTMLElement | null;
    if (!el) continue;

    // Loudly flag when we had to use a non-primary selector. For the pot
    // endpoint this means the gameplay surface forgot to mark its visible
    // pot zone and we are about to chip-transport to shell-center.
    if (i > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[chipEndpoints] fallback selector "${sel}" used for ${describeEndpoint(ref)}` +
          (debugLabel ? ` (caller: ${debugLabel})` : '') +
          ' — gameplay surface should mark its visible pot zone with data-pot-anchor.',
      );
    }

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
