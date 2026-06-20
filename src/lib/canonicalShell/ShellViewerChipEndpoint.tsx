/**
 * ShellViewerChipEndpoint — shell-owned `[data-chip-center]` anchor for
 * the local viewer's seat.
 *
 * Why this exists
 * ---------------
 * Canonical seat clusters (`CanonicalSeatCluster`) deliberately suppress
 * rendering when `position === viewerPosition` (`allowSelfRender=false`)
 * because the viewer's hand / chip stack lives in the HUD, not the
 * felt rail. That invariant works for steady-state gameplay, but it
 * breaks the canonical Economy precondition:
 *
 *     All transfer endpoints must exist before economy dispatch.
 *
 * When the local viewer is the WINNER of a chip transfer, the
 * `ChipTransportRuntime` has no `[data-chip-center="<viewerPosition>"]`
 * to resolve as the destination. `resolveChipEndpoint` returns null and
 * the transport silently drops with `reason=missing-endpoint`.
 *
 * Fix: the shell — which owns seat anchors and viewer identity — mounts
 * a zero-size, pointer-events-disabled marker portaled into the canonical
 * felt surface at the HOME slot. This guarantees the viewer's chip
 * endpoint is present for the ENTIRE settlement window, regardless of
 * which game is on the felt and regardless of `allowSelfRender`.
 *
 * Tiebreaker note: if a game also mounts its own `CanonicalSeatCluster`
 * for the viewer (e.g. Holm showdown with `allowSelfRender=true`), the
 * cluster's `[data-chip-center]` appears earlier in DOM order and wins
 * `container.querySelector`. The shell endpoint is the fallback, not
 * the override.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShellFeltFrameElement } from './useShellFeltFrameElement';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { getCanonicalSlotPlacement } from './canonicalSlotPlacement';
import { SLOT } from './seatAnchors';

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
      data-chip-center={viewerPosition}
      aria-hidden="true"
      className={`absolute ${placement.className} pointer-events-none`}
      style={{ width: 0, height: 0 }}
    />,
    felt,
  );
}
