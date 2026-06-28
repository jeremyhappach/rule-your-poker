/**
 * Shell Nameplate Config — global, shell-owned geometry for the
 * canonical opponent-seat nameplate (CanonicalSeatCluster identity
 * pill).
 *
 * Stored in `public.system_settings` under key `shell_nameplate` as
 * JSON:
 *
 *   {
 *     xOffsetDia:  number,   // chip-DIAMETER ratio
 *     yOffsetDia:  number,   // chip-DIAMETER ratio
 *     maxWidthDia: number,   // chip-DIAMETER ratio
 *   }
 *
 * COORDINATE CONTRACT (truthful):
 *   Origin     = chip-circle CENTER
 *   Vector to  = nameplate VISUAL CENTER
 *   Units      = chip-circle DIAMETER (viewport-stable)
 *
 *   X = 0,  Y = 0  ⇒ nameplate center sits directly over chip center.
 *   Y < 0          ⇒ nameplate moves UPWARD.
 *   Y > 0          ⇒ nameplate moves DOWNWARD.
 *   X < 0          ⇒ nameplate moves OUTWARD (mirrored both seat sides).
 *   X > 0          ⇒ nameplate moves INWARD  (mirrored both seat sides).
 *   Center-anchored slots (HOME=-1, BOTTOM_RAIL=-3) collapse the
 *   horizontal axis to 0 because "inner / outer" have no meaning.
 *
 * Baseline preservation (measured from today's rendered geometry, NOT
 * a hidden legacy CSS offset):
 *   Chip diameter: 40px (20px radius)
 *   Pill height:  ≈ 14.5px (text-[10px] line-height 1.05 = 10.5px
 *                 + py-[1px] = 2px + border 1px×2 = 2px)
 *   Legacy gap between pill bottom edge and chip top edge: 2px
 *   ⇒ nameplate center distance above chip center:
 *       chipRadius (20) + gap (2) + pillHalfHeight (7.25) = 29.25px
 *   ⇒ yOffsetDia = -29.25 / 40 ≈ -0.73
 *   Horizontal: pill is currently chip-centered ⇒ xOffsetDia = 0
 *   Max width: legacy max-w-[88px] = 88/40 = 2.2 dia
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 * Live draft preview: the admin panel calls previewShellNameplate(...)
 * which updates the in-memory store + notifies subscribers WITHOUT
 * persisting; on close the preview is cleared and the committed
 * snapshot snaps back.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface ShellNameplateConfig {
  xOffsetDia: number;
  yOffsetDia: number;
  maxWidthDia: number;
}

export const SHELL_NAMEPLATE_KEY = 'shell_nameplate';

// Seeded baseline truthfully describes today's rendered placement
// relative to chip-circle center (see header for derivation).
export const DEFAULT_SHELL_NAMEPLATE: ShellNameplateConfig = {
  xOffsetDia: 0,
  yOffsetDia: -0.73,
  maxWidthDia: 2.2,
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
  const v = (value ?? {}) as Record<string, unknown>;
  const x = Number(v.xOffsetDia);
  const y = Number(v.yOffsetDia);
  const w = Number(v.maxWidthDia);
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

// ── In-memory store with committed value + ephemeral preview ───────

let committed: ShellNameplateConfig = { ...DEFAULT_SHELL_NAMEPLATE };
let preview: ShellNameplateConfig | null = null;
const listeners = new Set<() => void>();

function effective(): ShellNameplateConfig {
  return preview ?? committed;
}

export function getShellNameplateConfig(): ShellNameplateConfig {
  return effective();
}

export function subscribeShellNameplate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

/**
 * Apply current effective values as CSS vars on <html>. Retained so
 * any legacy consumer reading the vars stays in sync; primary consumer
 * subscribes to the store directly via useSyncExternalStore.
 */
export function applyShellNameplateCssVars(c: ShellNameplateConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--shell-nameplate-x-dia', String(c.xOffsetDia));
  root.style.setProperty('--shell-nameplate-y-dia', String(c.yOffsetDia));
  root.style.setProperty('--shell-nameplate-maxw-dia', String(c.maxWidthDia));
}

/** Admin draft preview: ephemeral, not persisted. */
export function previewShellNameplate(next: ShellNameplateConfig | null): void {
  preview = next ? sanitize(next) : null;
  applyShellNameplateCssVars(effective());
  notify();
}

applyShellNameplateCssVars(committed);

// ── Geometry Lab draft + realtime registration ────────────────────
registerDomain<ShellNameplateConfig>({
  key: SHELL_NAMEPLATE_KEY,
  defaults: DEFAULT_SHELL_NAMEPLATE,
  sanitize,
  onApply: (next) => {
    committed = sanitize(next);
    preview = null;
    applyShellNameplateCssVars(committed);
    notify();
  },
});
