/**
 * Shell Nameplate Config — global, shell-owned geometry for the
 * canonical opponent-seat nameplate (CanonicalSeatCluster identity
 * pill).
 *
 * Stored in `public.system_settings` under key `shell_nameplate` as
 * JSON:
 *
 *   {
 *     vAnchor:      'upper' | 'lower',
 *     hAnchor:      'outer' | 'center' | 'inner',
 *     xOffsetDia:   number,   // ratio of chip-circle DIAMETER (post-attachment)
 *     yOffsetDia:   number,   // ratio of chip-circle DIAMETER (post-attachment)
 *     maxWidthDia:  number,   // ratio of chip-circle DIAMETER
 *   }
 *
 * Attachment contract:
 *   At zero offset, the nameplate's matching edge is TANGENT to the
 *   chip circle's selected edge.
 *
 *     Vertical Chip Anchor = Upper, Y=0
 *       → nameplate BOTTOM edge tangent to chip TOP edge
 *       → nameplate grows upward
 *     Vertical Chip Anchor = Lower, Y=0
 *       → nameplate TOP edge tangent to chip BOTTOM edge
 *       → nameplate grows downward
 *
 *     Horizontal Chip Anchor = Outer, X=0
 *       → nameplate INNER edge tangent to chip's OUTER (table-edge) rim
 *       → nameplate grows outward
 *     Horizontal Chip Anchor = Inner, X=0
 *       → nameplate OUTER edge tangent to chip's INNER (table-center) rim
 *       → nameplate grows inward
 *     Horizontal Chip Anchor = Center, X=0
 *       → nameplate CENTER aligns to chip-circle CENTER
 *
 *   "Inner" / "Outer" are MIRRORED automatically by seat side. The
 *   nameplate is never accidentally pinned by its left/start edge
 *   merely because it is rendered on one side of the table.
 *
 * Offset semantics (applied AFTER the selected edge/center attachment):
 *   X: negative = OUTWARD (away from table center)
 *      positive = INWARD  (toward table center)
 *      Mirrored automatically per seat side.
 *   Y: negative = UPWARD, positive = DOWNWARD.
 *   Units: normalized to the chip-circle DIAMETER (viewport-stable).
 *
 * Baseline preservation:
 *   Today's rendered placement is:
 *     - horizontally centered above the chip → hAnchor = 'center',
 *       xOffsetDia = 0
 *     - 2px gap between nameplate bottom edge and chip top edge (the
 *       legacy mb-[2px] cascade) → vAnchor = 'upper',
 *       yOffsetDia = -2/40 = -0.05
 *   The persisted defaults below fully describe that placement — no
 *   hidden legacy CSS placement is added on top.
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 * Live draft preview: the admin panel calls previewShellNameplate(...)
 * which updates the in-memory store + notifies subscribers WITHOUT
 * persisting; on close the preview is cleared and the committed
 * snapshot snaps back.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export type ShellNameplateVAnchor = 'upper' | 'lower';
export type ShellNameplateHAnchor = 'outer' | 'center' | 'inner';

export interface ShellNameplateConfig {
  vAnchor: ShellNameplateVAnchor;
  hAnchor: ShellNameplateHAnchor;
  xOffsetDia: number;
  yOffsetDia: number;
  maxWidthDia: number;
}

export const SHELL_NAMEPLATE_KEY = 'shell_nameplate';

// Seeded baseline reproduces today's "centered, 2px above chip" pill.
//   Vertical: 'upper' (Y=0 ⇒ tangent to chip top) + Y = -2/40 = -0.05
//   Horizontal: 'center' + X = 0
//   Max width: 2.2 dia (= 88px @ 40px chip cell, legacy max-w-[88px])
export const DEFAULT_SHELL_NAMEPLATE: ShellNameplateConfig = {
  vAnchor: 'upper',
  hAnchor: 'center',
  xOffsetDia: 0,
  yOffsetDia: -0.05,
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
  const vA = v.vAnchor === 'lower' ? 'lower' : 'upper';
  const hARaw = v.hAnchor;
  const hA: ShellNameplateHAnchor =
    hARaw === 'outer' || hARaw === 'inner' ? hARaw : 'center';
  const x = Number(v.xOffsetDia);
  const y = Number(v.yOffsetDia);
  const w = Number(v.maxWidthDia);
  return {
    vAnchor: vA,
    hAnchor: hA,
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
 * now subscribes to the store directly via useSyncExternalStore.
 */
export function applyShellNameplateCssVars(c: ShellNameplateConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--shell-nameplate-x-dia', String(c.xOffsetDia));
  root.style.setProperty('--shell-nameplate-y-dia', String(c.yOffsetDia));
  root.style.setProperty('--shell-nameplate-maxw-dia', String(c.maxWidthDia));
  root.style.setProperty('--shell-nameplate-v-anchor', c.vAnchor);
  root.style.setProperty('--shell-nameplate-h-anchor', c.hAnchor);
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
