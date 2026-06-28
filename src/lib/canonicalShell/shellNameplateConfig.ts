/**
 * Shell Nameplate Config — global, shell-owned geometry for the
 * canonical opponent-seat nameplate (CanonicalSeatCluster identity
 * pill).
 *
 * Stored in `public.system_settings` under key `shell_nameplate` as
 * JSON:
 *
 *   {
 *     xOffsetDia: number,   // ratio of chip-circle DIAMETER
 *     yOffsetDia: number,   // ratio of chip-circle DIAMETER
 *     maxWidthDia: number,  // ratio of chip-circle DIAMETER
 *   }
 *
 * Coordinate contract (per spec):
 *   - Offsets are measured from the CENTER of the chip circle.
 *   - X: negative = OUTWARD (away from table center)
 *        positive = INWARD  (toward table center)
 *        Mirroring is resolved by CanonicalSeatCluster from the
 *        canonical slot's visual side (left vs right).
 *   - Y: negative = upward, positive = downward.
 *   - Units are normalized to the rendered chip-disc DIAMETER so the
 *     same value reads the same regardless of viewport size.
 *
 * Baseline (defaults below) reproduces the current rendered placement:
 *   - x = 0  (nameplate centered above chip)
 *   - y = 0  (nameplate already sits flush above chip via the cluster
 *            wrapper; further translateY adds to that natural offset)
 *   - maxWidth = 2.2 dia  (= 88px at the default 40px chip cell,
 *            matching the legacy `max-w-[88px]` tailwind class).
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 * Live draft preview is driven by the Geometry Lab modal writing CSS
 * vars on `<html>`; CanonicalSeatCluster reads those CSS vars so
 * mid-edit values flow through without re-rendering.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface ShellNameplateConfig {
  xOffsetDia: number;
  yOffsetDia: number;
  maxWidthDia: number;
}

export const SHELL_NAMEPLATE_KEY = 'shell_nameplate';

// Baseline contract (corrected):
//   Offsets are measured from chip-circle CENTER → nameplate visual CENTER.
//   X=0/Y=0 ⇒ nameplate center coincides with chip center.
//   To reproduce today's "above-chip" rendered placement at first
//   paint, seed Y to the measured chip-center → nameplate-center
//   distance derived from the existing CSS cascade:
//     chip half (20px) + gap (mb-[2px]) + half pill (~7.25px) ≈ 29.25px
//     yOffsetDia = -29.25 / 40 ≈ -0.73
export const DEFAULT_SHELL_NAMEPLATE: ShellNameplateConfig = {
  xOffsetDia: 0,
  yOffsetDia: -0.73,
  maxWidthDia: 2.2, // 88px @ 40px chip cell — legacy max-w-[88px]
};

export const SHELL_NAMEPLATE_BOUNDS = {
  offset: { min: -3, max: 3, step: 0.05 },
  maxWidth: { min: 0.5, max: 6, step: 0.05 },
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitize(value: unknown): ShellNameplateConfig {
  const v = (value ?? {}) as Partial<Record<string, unknown>>;
  const x = Number((v as Record<string, unknown>).xOffsetDia);
  const y = Number((v as Record<string, unknown>).yOffsetDia);
  const w = Number((v as Record<string, unknown>).maxWidthDia);
  return {
    xOffsetDia: Number.isFinite(x)
      ? clamp(x, SHELL_NAMEPLATE_BOUNDS.offset.min, SHELL_NAMEPLATE_BOUNDS.offset.max)
      : DEFAULT_SHELL_NAMEPLATE.xOffsetDia,
    yOffsetDia: Number.isFinite(y)
      ? clamp(y, SHELL_NAMEPLATE_BOUNDS.offset.min, SHELL_NAMEPLATE_BOUNDS.offset.max)
      : DEFAULT_SHELL_NAMEPLATE.yOffsetDia,
    maxWidthDia: Number.isFinite(w)
      ? clamp(w, SHELL_NAMEPLATE_BOUNDS.maxWidth.min, SHELL_NAMEPLATE_BOUNDS.maxWidth.max)
      : DEFAULT_SHELL_NAMEPLATE.maxWidthDia,
  };
}

// ── In-memory store + CSS-var application ──────────────────────────

let current: ShellNameplateConfig = { ...DEFAULT_SHELL_NAMEPLATE };
const listeners = new Set<(c: ShellNameplateConfig) => void>();

export function applyShellNameplateCssVars(c: ShellNameplateConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--shell-nameplate-x-dia', String(c.xOffsetDia));
  root.style.setProperty('--shell-nameplate-y-dia', String(c.yOffsetDia));
  root.style.setProperty('--shell-nameplate-maxw-dia', String(c.maxWidthDia));
}

export function getShellNameplateConfig(): ShellNameplateConfig {
  return current;
}

export function subscribeShellNameplate(
  listener: (c: ShellNameplateConfig) => void,
): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setCurrent(next: ShellNameplateConfig) {
  current = next;
  applyShellNameplateCssVars(next);
  listeners.forEach((l) => { try { l(next); } catch { /* noop */ } });
}

// Apply baked defaults synchronously at module import so first paint
// has the CSS vars present.
applyShellNameplateCssVars(current);

// ── Geometry Lab draft + realtime registration ────────────────────
// Initial fetch + realtime broadcast are owned by the single
// <GeometryLabDefaultsLoader />. Apply Changes in the modal footer
// bundles this domain into the shared system_settings upsert.
registerDomain<ShellNameplateConfig>({
  key: SHELL_NAMEPLATE_KEY,
  defaults: DEFAULT_SHELL_NAMEPLATE,
  sanitize,
  onApply: (next) => {
    setCurrent(next);
  },
});
