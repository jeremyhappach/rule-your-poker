/**
 * usePlayGeometry — Wave 1 of the Responsive Geometry Contract.
 *
 * Read-only shell-owned geometry primitive describing the canonical
 * playable region (Frame A: visible felt surface) available to gameplay
 * artifacts. Derives from the canonical CSS variables defined in
 * index.css (`--shell-felt-w`, `--shell-felt-h`, `--shell-play-h`) —
 * the SAME tokens that size the visible felt ellipse. By measuring the
 * shell's own surface node (`[data-canonical-felt-surface]`) when
 * mounted, Frame A and Frame B (artifact coordinate space) stay
 * identical by construction.
 *
 * Scope (Wave 1):
 *   - Expose intent: width / height / center / safe bounds.
 *   - Zero game-specific assumptions (no card pixels, no dice pixels).
 *   - Zero device-specific branching here — device-class scaling lives
 *     in `ResponsiveGeometryProvider` and is consumed downstream by
 *     future primitives (`useCardRowLayout`, etc.).
 *   - No production consumer migrates in this wave.
 *
 * Ownership:
 *   width / height        → shell CSS tokens (`--shell-felt-w/h`) +
 *                           DOM measurement of the canonical surface.
 *   center / safe bounds  → derived purely from width / height; no
 *                           per-game inset assumptions are introduced.
 *
 * Example future consumer (NOT enabled in Wave 1):
 *   const { width, height, safeBounds } = usePlayGeometry();
 *   // useCardRowLayout({ available: safeBounds, count, aspect })
 */
import { useEffect, useMemo, useState } from 'react';
import { useShellFeltFrameElement } from './useShellFeltFrameElement';

export interface PlayGeometry {
  /** Width of the canonical play region in CSS pixels. */
  width: number;
  /** Height of the canonical play region in CSS pixels. */
  height: number;
  /** Center X within the play region (px, region-local). */
  centerX: number;
  /** Center Y within the play region (px, region-local). */
  centerY: number;
  /** Safe-inset edges (region-local). Wave 1 = 0 on all sides. */
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
  /** Resolved safe-area rectangle (region-local). */
  safeBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** True once the shell felt surface has been measured at least once. */
  measured: boolean;
}

const ZERO: PlayGeometry = {
  width: 0,
  height: 0,
  centerX: 0,
  centerY: 0,
  safeTop: 0,
  safeRight: 0,
  safeBottom: 0,
  safeLeft: 0,
  safeBounds: { x: 0, y: 0, width: 0, height: 0 },
  measured: false,
};

export function usePlayGeometry(): PlayGeometry {
  const el = useShellFeltFrameElement(true);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize(prev =>
        prev && prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [el]);

  return useMemo<PlayGeometry>(() => {
    if (!size) return ZERO;
    const { w, h } = size;
    return {
      width: w,
      height: h,
      centerX: w / 2,
      centerY: h / 2,
      safeTop: 0,
      safeRight: 0,
      safeBottom: 0,
      safeLeft: 0,
      safeBounds: { x: 0, y: 0, width: w, height: h },
      measured: true,
    };
  }, [size]);
}
