/**
 * Wave 4 — Phase 5A
 * useLiveGeometryConstraints — read the canonical shell DOM and the viewport
 * once per resize/orientation event, and produce a `GeometryConstraints`
 * object in vmin units.
 *
 * Discipline:
 *   - Read-only. NEVER mutates the shell.
 *   - Only fires on resize/orientation (no per-frame measurement).
 *   - Falls back to a sane synthetic geometry if the felt is not yet
 *     mounted, so the resolver can still produce a layout.
 *   - The resolver remains pure: it never touches the DOM itself.
 */

import { useEffect, useState } from "react";
import type { GeometryConstraints, SeatRingGeometry } from "./types";
import { rectVmin, vmin } from "./units";

interface MeasuredFelt {
  feltW: number; // vmin
  feltH: number; // vmin
  vminInPx: number;
}

function measure(): MeasuredFelt | null {
  if (typeof window === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vminInPx = Math.min(vw, vh) / 100;
  if (vminInPx <= 0) return null;

  const surface = document.querySelector<HTMLElement>(
    "[data-canonical-felt-surface]",
  );
  if (surface) {
    const rect = surface.getBoundingClientRect();
    return {
      feltW: rect.width / vminInPx,
      feltH: rect.height / vminInPx,
      vminInPx,
    };
  }
  // Fallback: use shell column tokens if felt not yet mounted.
  return {
    feltW: vw / vminInPx,
    feltH: vh / vminInPx,
    vminInPx,
  };
}

function buildSeatRing(feltW: number, feltH: number): SeatRingGeometry {
  // Synthetic 4-seat ring matching the Phase 4 fixture profile. Real seat
  // anchors are produced by the canonical SeatAnchorLayer — this synthetic
  // ring is here ONLY so the resolver can place chrome correctly; gameplay
  // artifacts (which we are NOT migrating in Phase 5A) continue to use the
  // real seat anchors via the existing shell projection.
  const cx = feltW / 2;
  const cy = feltH / 2;
  const rx = feltW * 0.42;
  const ry = feltH * 0.3;
  const seatAnchors = [0, 1, 2, 3].map((position) => {
    const angle =
      position === 0 ? 0.5 : position === 1 ? 0 : position === 2 ? 1.5 : 1;
    const theta = angle * Math.PI;
    const ax = cx + rx * Math.cos(theta);
    const ay = cy + ry * Math.sin(theta);
    return {
      position,
      anchor: { x: vmin(ax), y: vmin(ay) },
      chipCenter: { x: vmin(ax), y: vmin(ay) },
      namePlate: rectVmin(ax - 7, ay - 2, 14, 3),
      facing:
        position === 0
          ? ("bottom" as const)
          : position === 2
            ? ("top" as const)
            : position === 1
              ? ("right" as const)
              : ("left" as const),
    };
  });
  return {
    center: { x: vmin(cx), y: vmin(cy) },
    radiusX: vmin(rx),
    radiusY: vmin(ry),
    seatCount: 4,
    seatAnchors,
  };
}

function buildGeometry(m: MeasuredFelt): GeometryConstraints {
  const { feltW, feltH } = m;
  // Band heights mirror the shell CSS tokens. We approximate here; the
  // resolver only needs CONSISTENT band rects, not pixel-perfect ones, to
  // place chrome correctly. As long as resize triggers a re-measure, the
  // resolver output tracks the real layout.
  const rail = Math.max(2, Math.min(3, feltH * 0.02));
  const topHud = Math.max(5, Math.min(8, feltH * 0.05));
  const announce = Math.max(6, Math.min(9, feltH * 0.05));
  const bottomHud = Math.max(12, Math.min(24, feltH * 0.15));
  const topHudY = rail;
  const announceY = topHudY + topHud;
  const playY = announceY + announce;
  const bottomHudY = feltH - bottomHud;
  const playH = Math.max(0, bottomHudY - playY);

  return {
    feltBounds: rectVmin(0, 0, feltW, feltH),
    outerRailReserve: rectVmin(0, 0, feltW, rail),
    seatRing: buildSeatRing(feltW, feltH),
    topHudReserve: rectVmin(0, topHudY, feltW, topHud),
    announcementBand: rectVmin(0, announceY, feltW, announce),
    playBand: rectVmin(2, playY, Math.max(1, feltW - 4), playH),
    bottomHudReserve: rectVmin(0, bottomHudY, feltW, bottomHud),
    viewerSeatPosition: 0,
  };
}

export interface LiveGeometryState {
  geometry: GeometryConstraints | null;
  vminInPx: number;
}

export function useLiveGeometryConstraints(): LiveGeometryState {
  const [state, setState] = useState<LiveGeometryState>(() => {
    const m = measure();
    return {
      geometry: m ? buildGeometry(m) : null,
      vminInPx: m?.vminInPx ?? 0,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const remeasure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const m = measure();
        if (!m) return;
        setState({ geometry: buildGeometry(m), vminInPx: m.vminInPx });
      });
    };
    // Initial measurement after first paint (so felt exists in DOM).
    remeasure();
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    // Re-measure when the felt mounts or resizes.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(remeasure);
      const surface = document.querySelector("[data-canonical-felt-surface]");
      if (surface) ro.observe(surface);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      ro?.disconnect();
    };
  }, []);

  return state;
}
