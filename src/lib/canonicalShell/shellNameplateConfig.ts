/**
 * Shell Nameplate Config — global, shell-owned geometry for the
 * canonical opponent-seat nameplate (CanonicalSeatCluster identity
 * pill).
 *
 * Stored in `public.system_settings` under key `shell_nameplate` as
 * JSON:
 *
 *   {
 *     anchorStart: 'upper' | 'lower' | 'inner' | 'outer',
 *     attachment:  'inner' | 'center' | 'outer',
 *     xOffsetDia:  number,    // chip-DIAMETER ratio
 *     yOffsetDia:  number,    // chip-DIAMETER ratio
 *     maxWidthDia: number,    // chip-DIAMETER ratio
 *   }
 *
 * COORDINATE CONTRACT
 *   1. ANCHOR START — reference point on chip-circle perimeter:
 *        upper = top of chip
 *        lower = bottom of chip
 *        inner = side of chip facing table center  (mirrors per seat)
 *        outer = side of chip facing away from table center (mirrors)
 *   2. NAMEPLATE ATTACHMENT — horizontal pin point on the pill:
 *        inner  = pill inner edge   (mirrors per seat)
 *        center = pill horizontal center
 *        outer  = pill outer edge   (mirrors per seat)
 *      Vertical pin is implied by anchor:
 *        anchor=upper        → pill bottom pinned
 *        anchor=lower        → pill top pinned
 *        anchor=inner/outer  → pill vertical center pinned
 *   3. OFFSETS (after anchor + attachment resolve base placement):
 *        X: negative = outward (mirrored), positive = inward (mirrored)
 *        Y: negative = upward,             positive = downward
 *      Units are chip-circle DIAMETERS (viewport-stable).
 *
 *   Center-anchored cluster slots (HOME=-1, BOTTOM_RAIL=-3) collapse
 *   the inner/outer axis to the center value (no left/right table-edge
 *   exists for them); attachment 'inner' / 'outer' resolve to 'center'
 *   and the X offset collapses to 0.
 *
 * BASELINE (matches current visual placement of the above-chip pill):
 *   anchorStart = upper, attachment = center, X = 0, Y = 0, maxW = 2.2.
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 * Live draft preview: the admin panel calls previewShellNameplate(...)
 * which updates the in-memory store + notifies subscribers WITHOUT
 * persisting; on close the preview is cleared and the committed
 * snapshot snaps back.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export type ShellNameplateAnchorStart = 'upper' | 'lower' | 'inner' | 'outer' | 'center';
export type ShellNameplateAttachment = 'inner' | 'center' | 'outer';

export interface ShellNameplateConfig {
  anchorStart: ShellNameplateAnchorStart;
  attachment: ShellNameplateAttachment;
  xOffsetDia: number;
  yOffsetDia: number;
  maxWidthDia: number;
}

export const SHELL_NAMEPLATE_KEY = 'shell_nameplate';

export const SHELL_NAMEPLATE_ANCHOR_OPTIONS: ShellNameplateAnchorStart[] =
  ['upper', 'lower', 'inner', 'outer', 'center'];
export const SHELL_NAMEPLATE_ATTACHMENT_OPTIONS: ShellNameplateAttachment[] =
  ['inner', 'center', 'outer'];

export const DEFAULT_SHELL_NAMEPLATE: ShellNameplateConfig = {
  anchorStart: 'upper',
  attachment: 'center',
  xOffsetDia: 0,
  yOffsetDia: 0,
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

function sanitizeAnchor(v: unknown): ShellNameplateAnchorStart {
  return SHELL_NAMEPLATE_ANCHOR_OPTIONS.includes(v as ShellNameplateAnchorStart)
    ? (v as ShellNameplateAnchorStart)
    : DEFAULT_SHELL_NAMEPLATE.anchorStart;
}
function sanitizeAttachment(v: unknown): ShellNameplateAttachment {
  return SHELL_NAMEPLATE_ATTACHMENT_OPTIONS.includes(v as ShellNameplateAttachment)
    ? (v as ShellNameplateAttachment)
    : DEFAULT_SHELL_NAMEPLATE.attachment;
}

function sanitize(value: unknown): ShellNameplateConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const x = Number(v.xOffsetDia);
  const y = Number(v.yOffsetDia);
  const w = Number(v.maxWidthDia);
  return {
    anchorStart: sanitizeAnchor(v.anchorStart),
    attachment: sanitizeAttachment(v.attachment),
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
  root.style.setProperty('--shell-nameplate-anchor-start', c.anchorStart);
  root.style.setProperty('--shell-nameplate-attachment', c.attachment);
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
