/**
 * Wave 4 — Phase 5A / Wave 4.5
 * useLiveGeometryConstraints — produce a `GeometryConstraints` object in
 * vmin units, reading authoritative values from the canonical shell DOM
 * and the SeatAnchorLayer context whenever they are mounted.
 *
 * Source-of-truth precedence (Wave 4.5):
 *   1. Canonical shell DOM landmarks  (CanonicalConstraintReader)
 *   2. SeatAnchorLayer React context  (viewer seat + seat ring)
 *   3. Heuristic fallbacks from felt ratios  (ONLY used on first paint,
 *      before the shell DOM is mounted — they exist to keep the resolver
 *      producing a layout instead of crashing during bootstrap)
 *
 * Discipline:
 *   - Read-only. NEVER mutates the shell.
 *   - Only fires on resize / orientation / ResizeObserver (no per-frame
 *     measurement).
 *   - The resolver remains pure: it never touches the DOM itself.
 */

import { useEffect, useState } from "react";
import type { GeometryConstraints, SeatRingGeometry } from "./types";
import { rectVmin, vmin } from "./units";
import { readCanonicalConstraints } from "./CanonicalConstraintReader";
import { useSeatAnchorsOptional } from "@/lib/canonicalShell/SeatAnchorLayer";

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
  return {
    feltW: vw / vminInPx,
    feltH: vh / vminInPx,
    vminInPx,
  };
}

// ---------------------------------------------------------------------------
// Heuristic fallbacks — ONLY used when the canonical shell DOM is not yet
// mounted. They preserve first-paint behavior so the resolver always has a
// layout to produce. Once the shell mounts, every value below is overridden
// by `readCanonicalConstraints`.
// ---------------------------------------------------------------------------

function fallbackSeatRing(feltW: number, feltH: number): SeatRingGeometry {
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

function buildGeometry(
  m: MeasuredFelt,
  viewerSeatPosition: number | null,
): GeometryConstraints {
  const { feltW, feltH, vminInPx } = m;

  // Heuristic fallback bands — superseded by canonical reads below.
  const rail = Math.max(2, Math.min(3, feltH * 0.02));
  const fbTopHud = Math.max(5, Math.min(8, feltH * 0.05));
  const fbAnnounce = Math.max(6, Math.min(9, feltH * 0.05));
  const fbBottomHud = Math.max(12, Math.min(24, feltH * 0.15));
  const fbTopHudY = rail;
  const fbAnnounceY = fbTopHudY + fbTopHud;
  const fbBottomHudY = feltH - fbBottomHud;

  let topHudReserve = rectVmin(0, fbTopHudY, feltW, fbTopHud);
  let announcementBand = rectVmin(0, fbAnnounceY, feltW, fbAnnounce);
  let bottomHudReserve = rectVmin(0, fbBottomHudY, feltW, fbBottomHud);
  let seatRing = fallbackSeatRing(feltW, feltH);
  let viewer = viewerSeatPosition;

  // Canonical reads — every successful read replaces the heuristic.
  const canonical = readCanonicalConstraints({
    feltW,
    feltH,
    vminInPx,
    viewerSeatPosition,
  });
  if (canonical.topHudReserve) topHudReserve = canonical.topHudReserve;
  if (canonical.announcementBand)
    announcementBand = canonical.announcementBand;
  if (canonical.bottomHudReserve)
    bottomHudReserve = canonical.bottomHudReserve;
  if (canonical.seatRing) seatRing = canonical.seatRing;
  if (canonical.viewerSeatPosition !== undefined)
    viewer = canonical.viewerSeatPosition;

  // playBand = leftover vertical extent inside the felt, between the
  // bottom of (topHud + announcement) and the top of the bottom HUD,
  // with the same 2 vmin x-inset the heuristic used. Derived from the
  // (possibly canonical) bands above so canonical reads cascade.
  const playTop =
    announcementBand.y.value + announcementBand.height.value;
  const playBottom = bottomHudReserve.y.value;
  const playH = Math.max(0, playBottom - playTop);
  const playBand = rectVmin(2, playTop, Math.max(1, feltW - 4), playH);

  return {
    feltBounds: rectVmin(0, 0, feltW, feltH),
    outerRailReserve: rectVmin(0, 0, feltW, rail),
    seatRing,
    topHudReserve,
    announcementBand,
    playBand,
    bottomHudReserve,
    viewerSeatPosition: viewer,
  };
}

export interface LiveGeometryState {
  geometry: GeometryConstraints | null;
  vminInPx: number;
}

export function useLiveGeometryConstraints(): LiveGeometryState {
  // SeatAnchorLayer is optional here — wave4 host may be mounted outside
  // a SeatAnchorLayer during bootstrap. When present, its viewerPosition
  // is the authoritative source; otherwise we fall through to the
  // hardcoded null (replaced later by the canonical reader if a viewer
  // chip is published in the DOM).
  const seatCtx = useSeatAnchorsOptional();
  const viewerSeatPosition = seatCtx?.viewerPosition ?? null;

  const [state, setState] = useState<LiveGeometryState>(() => {
    const m = measure();
    return {
      geometry: m ? buildGeometry(m, viewerSeatPosition) : null,
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
        setState({
          geometry: buildGeometry(m, viewerSeatPosition),
          vminInPx: m.vminInPx,
        });
      });
    };
    remeasure();
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(remeasure);
      const surface = document.querySelector("[data-canonical-felt-surface]");
      if (surface) ro.observe(surface);
      // Also observe the HUD grid so band changes (announcement open/close,
      // tab bar height shifts) re-publish constraints immediately.
      const hud = document.querySelector("[data-canonical-shell-hud-grid]");
      if (hud) ro.observe(hud);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      ro?.disconnect();
    };
  }, [viewerSeatPosition]);

  return state;
}
