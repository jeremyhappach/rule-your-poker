/**
 * Wave 4 — Phase 3
 * Unit normalization helpers. Internally the resolver works in vmin.
 * `px` inputs are converted using the felt bounds at the boundary.
 *
 * Pure functions, no DOM access.
 */

import type { Length, Rect } from "./types";

export const EPSILON_VMIN = 1e-4;

/**
 * Convert any Length to vmin. For `px`, divide by feltVminInPx — the size of
 * 1 vmin in pixels for the current felt. This must be supplied; the resolver
 * never reads the viewport itself.
 */
export function toVmin(length: Length, feltVminInPx: number): number {
  if (length.unit === "vmin") return length.value;
  if (feltVminInPx <= 0) return length.value; // defensive: don't divide by zero
  return length.value / feltVminInPx;
}

export function vmin(value: number): Length {
  return { value, unit: "vmin" };
}

export function rectVmin(
  x: number,
  y: number,
  width: number,
  height: number,
): Rect {
  return { x: vmin(x), y: vmin(y), width: vmin(width), height: vmin(height) };
}

export function rectToVmin(rect: Rect, feltVminInPx: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: toVmin(rect.x, feltVminInPx),
    y: toVmin(rect.y, feltVminInPx),
    width: toVmin(rect.width, feltVminInPx),
    height: toVmin(rect.height, feltVminInPx),
  };
}

export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x + EPSILON_VMIN ||
    b.x + b.width <= a.x + EPSILON_VMIN ||
    a.y + a.height <= b.y + EPSILON_VMIN ||
    b.y + b.height <= a.y + EPSILON_VMIN
  );
}

export function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x + EPSILON_VMIN >= outer.x &&
    inner.y + EPSILON_VMIN >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON_VMIN &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON_VMIN
  );
}
