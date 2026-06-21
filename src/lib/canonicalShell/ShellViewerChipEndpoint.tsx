/**
 * ShellViewerChipEndpoint — shell-owned chip endpoint for the local
 * viewer's seat, portaled onto the canonical felt at the HOME slot.
 *
 * Why this exists
 * ---------------
 * Canonical seat clusters (`CanonicalSeatCluster`) deliberately suppress
 * rendering when `position === viewerPosition` (`allowSelfRender=false`)
 * because the viewer's hand / chip stack lives in the HUD, not the
 * felt rail. That invariant breaks two canonical preconditions:
 *
 *   1. All transfer endpoints must exist before economy dispatch.
 *      Without this marker, `resolveChipEndpoint` returns null and a
 *      local-winner transport silently drops with `missing-endpoint`.
 *
 *   2. The destination reaction (e.g. `cribbageBounce` arrival) needs
 *      a VISIBLE reaction target — `[data-chip-reaction-target=N]` on a
 *      chip-shaped DOM node with non-zero rect. The previous 0×0
 *      geometry-only marker satisfied (1) but not (2): the runtime
 *      either dropped the reaction (`no-visible-reaction-target`) or
 *      was redirected to a hand-rolled HUD `<span>` that bounced text
 *      instead of the chip body.
 *
 * Fix: render a real `CanonicalChipDisc` (amount=null, transparent) at
 * the HOME slot. The disc body publishes BOTH `data-chip-center`
 * (geometry) and `data-chip-reaction-target` (visible bounce target)
 * for the viewer's position, matching the contract every opponent seat
 * already satisfies via `CanonicalSeatCluster`.
 *
 * Tiebreaker note: if a game also mounts its own `CanonicalSeatCluster`
 * for the viewer (e.g. Holm showdown with `allowSelfRender=true`), the
 * cluster's anchors appear earlier in DOM order and win
 * `container.querySelector`. The shell endpoint is the fallback, not
 * the override.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShellFeltFrameElement } from './useShellFeltFrameElement';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { getCanonicalSlotPlacement } from './canonicalSlotPlacement';
import { SLOT } from './seatAnchors';
import { CanonicalChipDisc } from '@/components/canonicalShell/CanonicalChipDisc';

export function ShellViewerChipEndpoint(): JSX.Element | null {
  const anchors = useSeatAnchorsOptional();
  const viewerPosition = anchors?.viewerPosition ?? null;
  const felt = useShellFeltFrameElement(viewerPosition != null);
  const [, force] = useState(0);

  // Re-render once the felt surface attaches so the portal target binds.
  useEffect(() => {
    if (felt) force(n => n + 1);
  }, [felt]);

  if (viewerPosition == null || !felt) return null;

  // HOME slot placement on the felt rail (bottom-center). Reuses the
  // same Tailwind classes as opponent seats so the endpoint sits at the
  // canonical viewer-seat location, not at HUD coordinates.
  const placement = getCanonicalSlotPlacement(SLOT.HOME);

  return createPortal(
    <div
      data-canonical-shell-viewer-chip-endpoint=""
      aria-hidden="true"
      className={`absolute ${placement.className} pointer-events-none`}
    >
      {/* Transparent, value-less chip body. The disc publishes
          `data-chip-center` and `data-chip-reaction-target` for the
          viewer's seat — the visible canonical endpoint required for
          chip transport AND destination-reaction targeting. The HUD
          owns numeric chip display; this disc owns geometry + bounce. */}
      <CanonicalChipDisc
        amount={null}
        bgClass="bg-transparent border-transparent"
        positionAnchor={viewerPosition}
        size="gameplay"
      />
    </div>,
    felt,
  );
}
