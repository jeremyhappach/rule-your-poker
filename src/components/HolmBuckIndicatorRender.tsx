/**
 * HolmBuckIndicatorRender — sub-renderer for the felt Buck indicator.
 *
 * Owns:
 *   - the visual chrome (pulsing glow, bouncing white disc, Cubs logo)
 *   - the Geometry-Lab offset transform (X/Y in chip diameters,
 *     side-aware: +X = inward toward table center; mirrored per seat
 *     side. +Y = downward.)
 *
 * Chip-diameter unit:
 *   Measured live from the matching `[data-chip-center="${position}"]`
 *   element so the offset tracks the actual seat chip-circle, with a
 *   40px fallback before first measurement.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getHolmBuckConfig,
  subscribeHolmBuck,
} from '@/lib/canonicalShell/holmBuckIndicatorConfig';
import {
  isRightSideCanonicalSlot,
  type CanonicalSlotPlacement,
} from '@/lib/canonicalShell/canonicalSlotPlacement';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';

const FALLBACK_CHIP_DIAMETER_PX = 40;
const CENTER_SLOTS: ReadonlyArray<CanonicalSlot> = [-1, -3];

interface HolmBuckIndicatorRenderProps {
  buckPosition: number;
  buckSlot: CanonicalSlot;
}

export function HolmBuckIndicatorRender({
  buckPosition,
  buckSlot,
}: HolmBuckIndicatorRenderProps) {
  const cfg = useSyncExternalStore(
    subscribeHolmBuck,
    getHolmBuckConfig,
    getHolmBuckConfig,
  );

  // Live chip-diameter measurement so offsets track the actual seat
  // disc (sizes differ across cluster/gameplay/tablet variants).
  const [chipDia, setChipDia] = useState<number>(FALLBACK_CHIP_DIAMETER_PX);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-chip-center="${buckPosition}"]`,
      );
      if (el) {
        const rect = el.getBoundingClientRect();
        const d = Math.max(rect.width, rect.height);
        if (d > 0) setChipDia(d);
      }
    };
    measure();
    // Re-measure on the next frame too — the chip disc may not be
    // mounted on first paint of a buck transition.
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [buckPosition, buckSlot]);

  const isCenter = CENTER_SLOTS.includes(buckSlot);
  // +X means "inward toward table center". For right-side seats,
  // inward is leftward in CSS (negative). For left-side seats, inward
  // is rightward (positive). Center slots collapse the X axis.
  const inwardCssSign = isCenter ? 0 : isRightSideCanonicalSlot(buckSlot) ? -1 : 1;
  const dx = cfg.xOffsetDia * chipDia * inwardCssSign;
  const dy = cfg.yOffsetDia * chipDia;

  return (
    <div
      className="relative"
      style={{ transform: `translate(${dx}px, ${dy}px)` }}
    >
      <div className="absolute inset-0 bg-blue-600 rounded-full blur-sm animate-pulse opacity-75" />
      <div className="relative bg-white rounded-full p-0.5 shadow-lg border-2 border-blue-800 animate-bounce flex items-center justify-center w-7 h-7">
        <img
          alt="Buck"
          className="w-full h-full rounded-full object-cover"
          src="/lovable-uploads/7ca746e0-8bcb-4dcd-9d87-407f9457deb8.png"
        />
      </div>
    </div>
  );
}

// Type re-export pacifies unused-import lints on placement-class arg.
export type { CanonicalSlotPlacement };
