/**
 * Holm Buck Indicator — chip-ring artifact placement (first of its
 * kind under the Geometry Lab → per-game → Chip Ring Artifacts
 * section).
 *
 * Stored in `public.system_settings` under key `holm_buck` as JSON:
 *
 *   {
 *     xOffsetDia: number,   // chip-DIAMETER ratio (signed)
 *     yOffsetDia: number,   // chip-DIAMETER ratio (signed)
 *   }
 *
 * COORDINATE CONTRACT
 *   Origin = center of the seat's canonical chip circle
 *     (the `[data-chip-center="${position}"]` element).
 *   X: positive = INWARD  (toward table center, mirrored per seat side)
 *      negative = OUTWARD (away from table center, mirrored per seat side)
 *   Y: positive = DOWNWARD
 *      negative = UPWARD
 *   Units = chip-circle DIAMETERS (viewport-stable).
 *
 * BASELINE (matches current visual placement of the buck cluster):
 *   X = 0, Y = 0.
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 * Live draft preview: the admin panel calls previewHolmBuck(...)
 * which updates the in-memory store + notifies subscribers WITHOUT
 * persisting; on close the preview is cleared and the committed
 * snapshot snaps back.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface HolmBuckIndicatorConfig {
  xOffsetDia: number;
  yOffsetDia: number;
}

export const HOLM_BUCK_KEY = 'holm_buck';

export const DEFAULT_HOLM_BUCK: HolmBuckIndicatorConfig = {
  xOffsetDia: 0,
  yOffsetDia: 0,
};

export const HOLM_BUCK_BOUNDS = {
  offset: { min: -3, max: 3, step: 0.05 },
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitize(value: unknown): HolmBuckIndicatorConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const x = Number(v.xOffsetDia);
  const y = Number(v.yOffsetDia);
  return {
    xOffsetDia: Number.isFinite(x)
      ? clamp(x, HOLM_BUCK_BOUNDS.offset.min, HOLM_BUCK_BOUNDS.offset.max)
      : DEFAULT_HOLM_BUCK.xOffsetDia,
    yOffsetDia: Number.isFinite(y)
      ? clamp(y, HOLM_BUCK_BOUNDS.offset.min, HOLM_BUCK_BOUNDS.offset.max)
      : DEFAULT_HOLM_BUCK.yOffsetDia,
  };
}

// ── In-memory store with committed value + ephemeral preview ───────

let committed: HolmBuckIndicatorConfig = { ...DEFAULT_HOLM_BUCK };
let preview: HolmBuckIndicatorConfig | null = null;
const listeners = new Set<() => void>();

function effective(): HolmBuckIndicatorConfig {
  return preview ?? committed;
}

export function getHolmBuckConfig(): HolmBuckIndicatorConfig {
  return effective();
}

export function subscribeHolmBuck(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

/** Admin draft preview: ephemeral, not persisted. */
export function previewHolmBuck(next: HolmBuckIndicatorConfig | null): void {
  preview = next ? sanitize(next) : null;
  notify();
}

// ── Geometry Lab draft + realtime registration ────────────────────
registerDomain<HolmBuckIndicatorConfig>({
  key: HOLM_BUCK_KEY,
  defaults: DEFAULT_HOLM_BUCK,
  sanitize,
  onApply: (next) => {
    committed = sanitize(next);
    preview = null;
    notify();
  },
});
