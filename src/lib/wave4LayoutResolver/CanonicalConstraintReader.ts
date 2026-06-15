/**
 * Wave 4.5 — CanonicalConstraintReader
 *
 * Read GeometryConstraints values from the canonical shell DOM and the
 * SeatAnchorLayer context instead of synthesizing them from felt ratios.
 *
 * Replaces (in `useLiveGeometryConstraints`):
 *   - seatRing             (heuristic ellipse  → real [data-chip-center] rects)
 *   - announcementBand     (clamp on feltH     → [data-hud-row="announcement"])
 *   - topHud               (clamp on feltH     → [data-canonical-shell-header])
 *   - bottomHud            (clamp on feltH     → [data-canonical-shell-hud-grid])
 *   - viewerSeatPosition   (hardcoded 0        → SeatAnchorLayer context)
 *
 * Discipline:
 *   - Pure reader. Never mutates the shell.
 *   - DOM access is one-shot per measure call; no per-frame loops.
 *   - When a shell node is not yet mounted, returns `null` for that
 *     constraint so the caller can decide its own fallback (we keep the
 *     existing heuristic as the fallback, so first paint never regresses).
 *   - The resolver itself remains pure: it never reads any DOM.
 */

import type {
  GeometryConstraints,
  SeatAnchor,
  SeatRingGeometry,
} from "./types";
import { rectVmin, vmin } from "./units";

const SEL_FELT = "[data-canonical-felt-surface]";
const SEL_ANNOUNCEMENT_ROW = '[data-hud-row="announcement"]';
const SEL_HUD_GRID = "[data-canonical-shell-hud-grid]";
const SEL_SHELL_HEADER = "[data-canonical-shell-header]";
const SEL_CHIP_CENTER = "[data-chip-center]";

export interface CanonicalReaderInput {
  /** Viewer seat from SeatAnchorLayer context, when available. */
  viewerSeatPosition: number | null;
  /** Felt size in vmin (already measured by the live geometry hook). */
  feltW: number;
  feltH: number;
  vminInPx: number;
}

/** Optional partial constraints — undefined fields mean "shell not ready". */
export interface CanonicalReaderOutput {
  topHudReserve?: GeometryConstraints["topHudReserve"];
  announcementBand?: GeometryConstraints["announcementBand"];
  bottomHudReserve?: GeometryConstraints["bottomHudReserve"];
  seatRing?: SeatRingGeometry;
  viewerSeatPosition: number | null;
}

function feltOriginPx(): { x: number; y: number; w: number; h: number } | null {
  if (typeof document === "undefined") return null;
  const felt = document.querySelector<HTMLElement>(SEL_FELT);
  if (!felt) return null;
  const r = felt.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function rectToFeltVmin(
  el: HTMLElement,
  felt: { x: number; y: number },
  vminInPx: number,
) {
  const r = el.getBoundingClientRect();
  return {
    x: (r.left - felt.x) / vminInPx,
    y: (r.top - felt.y) / vminInPx,
    w: r.width / vminInPx,
    h: r.height / vminInPx,
  };
}

function readBand(
  selector: string,
  felt: { x: number; y: number },
  vminInPx: number,
) {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = rectToFeltVmin(el, felt, vminInPx);
  if (!(r.w > 0) || !(r.h > 0)) return null;
  return rectVmin(r.x, r.y, r.w, r.h);
}

function readSeatRing(
  felt: { x: number; y: number; w: number; h: number },
  vminInPx: number,
  feltW: number,
  feltH: number,
): SeatRingGeometry | null {
  if (typeof document === "undefined") return null;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(SEL_CHIP_CENTER),
  );
  if (nodes.length === 0) return null;

  const anchors: SeatAnchor[] = [];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const node of nodes) {
    const posAttr = node.getAttribute("data-chip-center");
    if (!posAttr) continue;
    const position = Number(posAttr);
    if (!Number.isFinite(position)) continue;
    const r = node.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    const cxPx = r.left + r.width / 2 - felt.x;
    const cyPx = r.top + r.height / 2 - felt.y;
    const cx = cxPx / vminInPx;
    const cy = cyPx / vminInPx;
    const w = r.width / vminInPx;
    const h = r.height / vminInPx;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    // Facing inferred from chip position relative to felt center: which
    // half it sits in. Good enough for the resolver — gameplay
    // components keep using their own anchor-aware projection.
    const halfX = feltW / 2;
    const halfY = feltH / 2;
    const dx = cx - halfX;
    const dy = cy - halfY;
    const facing: SeatAnchor["facing"] =
      Math.abs(dy) >= Math.abs(dx)
        ? dy >= 0
          ? "bottom"
          : "top"
        : dx >= 0
          ? "right"
          : "left";

    anchors.push({
      position,
      anchor: { x: vmin(cx), y: vmin(cy) },
      chipCenter: { x: vmin(cx), y: vmin(cy) },
      namePlate: rectVmin(cx - w / 2, cy - h / 2, w, h),
      facing,
    });
  }

  if (anchors.length === 0) return null;

  const cx = anchors.length > 1 ? (minX + maxX) / 2 : feltW / 2;
  const cy = anchors.length > 1 ? (minY + maxY) / 2 : feltH / 2;
  const rx = anchors.length > 1 ? Math.max(0.5, (maxX - minX) / 2) : feltW / 4;
  const ry = anchors.length > 1 ? Math.max(0.5, (maxY - minY) / 2) : feltH / 4;

  // Stable ordering by canonical position so seat lookups are deterministic.
  anchors.sort((a, b) => a.position - b.position);

  return {
    center: { x: vmin(cx), y: vmin(cy) },
    radiusX: vmin(rx),
    radiusY: vmin(ry),
    seatCount: anchors.length,
    seatAnchors: anchors,
  };
}

/**
 * Read every shell-published constraint that today is approximated.
 * Returns partial output — caller composes with its own fallbacks.
 */
export function readCanonicalConstraints(
  input: CanonicalReaderInput,
): CanonicalReaderOutput {
  const out: CanonicalReaderOutput = {
    viewerSeatPosition: input.viewerSeatPosition,
  };
  const felt = feltOriginPx();
  if (!felt || input.vminInPx <= 0) return out;

  const announcement = readBand(SEL_ANNOUNCEMENT_ROW, felt, input.vminInPx);
  if (announcement) out.announcementBand = announcement;

  const header = readBand(SEL_SHELL_HEADER, felt, input.vminInPx);
  if (header) out.topHudReserve = header;

  const hud = readBand(SEL_HUD_GRID, felt, input.vminInPx);
  if (hud) out.bottomHudReserve = hud;

  const ring = readSeatRing(felt, input.vminInPx, input.feltW, input.feltH);
  if (ring) out.seatRing = ring;

  return out;
}
