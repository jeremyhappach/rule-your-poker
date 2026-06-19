/**
 * OverSeatBadgePortal — shell-owned over-seat badge presentation.
 *
 * Ownership migration helper for win-score badges and similar
 * over-seat artifacts that historically rendered INSIDE
 * CanonicalSeatCluster's chip-disc subtree (via `chipPresentation`)
 * and consequently lost z-wars to nameplate, dealer pip, status ring,
 * and other always-on stacking contexts inside the seat.
 *
 * Behavior:
 *   - Locates `[data-chip-center="${position}"]` in the DOM
 *     (the canonical chip anchor — invariant across the project).
 *   - Measures its centroid in viewport coordinates and projects it
 *     into the `transient` shell overlay layer's local coordinate
 *     space (z=85 — above CanonicalSeatCluster + ChipTransport, below
 *     Celebration).
 *   - Renders `children` centered on that centroid via
 *     `useShellOverlayPortal('transient')`.
 *   - Follows the anchor live with `ResizeObserver` + window resize
 *     + a low-rate rAF watcher (anchor moves are rare; this covers
 *     viewport resize, seat reorders, and font-load reflow without
 *     polling churn).
 *
 * Geometry contract: this is an OWNERSHIP migration, not a geometry
 * change. The portaled badge's centroid is EXACTLY the chip-center
 * coordinate the badge already occupied when it lived inside the
 * chip disc. Callers must not add their own offsets.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShellOverlayPortal, useShellOverlayTarget } from './ShellOverlayMounts';

export interface OverSeatBadgePortalProps {
  /** Seat position whose `data-chip-center` to anchor on. */
  position: number;
  /** Diagnostic owner label, e.g. "ShellOverlay:HorsesWinScoreBadge". */
  ownerLabel: string;
  /** The badge content. Rendered centered on the chip anchor. */
  children: ReactNode;
  /** Optional gating — when false, nothing is portaled. */
  active?: boolean;
}

export function OverSeatBadgePortal({
  position,
  ownerLabel,
  children,
  active = true,
}: OverSeatBadgePortalProps) {
  const portal = useShellOverlayPortal('transient');
  const layerEl = useShellOverlayTarget('transient');
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !layerEl) {
      setCoords(null);
      return;
    }

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const anchor = document.querySelector<HTMLElement>(
        `[data-chip-center="${position}"]`,
      );
      if (!anchor || !layerEl) {
        setCoords((prev) => (prev === null ? prev : null));
        return;
      }
      const a = anchor.getBoundingClientRect();
      const l = layerEl.getBoundingClientRect();
      const x = a.left + a.width / 2 - l.left;
      const y = a.top + a.height / 2 - l.top;
      setCoords((prev) =>
        prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5
          ? prev
          : { x, y },
      );
    };

    measure();

    // Anchor change: ResizeObserver on the layer (catches viewport
    // resize / felt reflow) + on the anchor itself (catches seat
    // reorder / chip-disc size swap on isTablet).
    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    ro.observe(layerEl);
    const anchorEl = document.querySelector<HTMLElement>(
      `[data-chip-center="${position}"]`,
    );
    if (anchorEl) ro.observe(anchorEl);

    // Anchor mount race: re-measure on the next 3 animation frames so
    // first-frame layout converges before paint.
    let frames = 3;
    const tick = () => {
      if (cancelled || frames <= 0) return;
      frames -= 1;
      measure();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, layerEl, position]);

  if (!active || !coords) return null;

  return portal(
    <div
      data-shell-overlay-owner={ownerLabel}
      data-shell-overlay-consumer={ownerLabel}
      data-over-seat-position={position}
      className="absolute pointer-events-none"
      style={{
        left: coords.x,
        top: coords.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {children}
    </div>,
  );
}
