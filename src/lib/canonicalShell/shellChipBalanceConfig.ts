/**
 * Shell Chip Balance Config — global, shell-owned typography rules for
 * the chip-circle balance label (CanonicalChipBalanceLabel).
 *
 * Stored in `public.system_settings` under key `shell_chip_balance` as
 * JSON:
 *
 *   {
 *     maxWidthPct: number,   // hard fit envelope, % of chip diameter
 *     prefSizePct: number,   // preferred font size, % of chip diameter
 *     minSizePct:  number,   // minimum font size,  % of chip diameter
 *   }
 *
 * Adaptive typography contract:
 *
 *   availableWidthPx = chipCircleDiameterPx * maxWidthPct
 *
 *   fontSizePx =
 *     largest size between [minSizePct, prefSizePct] * diameterPx
 *     where the formatted balance fits availableWidthPx.
 *
 *   No wrapping, clipping, ellipsis, or horizontal scaling.
 *   Small values never shrink because another player has a large one.
 *
 * Defaults are chosen so the -$999 stress case fits safely inside the
 * cluster-preset chip disc (40 px on phone) without touching the rim.
 *
 * Realtime: registered with the shared Geometry Lab defaults loader —
 * every client receives admin saves automatically.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface ShellChipBalanceConfig {
  maxWidthPct: number;
  prefSizePct: number;
  minSizePct: number;
}

export const SHELL_CHIP_BALANCE_KEY = 'shell_chip_balance';

export const DEFAULT_SHELL_CHIP_BALANCE: ShellChipBalanceConfig = {
  maxWidthPct: 0.90,
  prefSizePct: 0.30,
  minSizePct: 0.18,
};

export const SHELL_CHIP_BALANCE_BOUNDS = {
  maxWidth: { min: 0.40, max: 1.10, step: 0.01 },
  size:     { min: 0.08, max: 0.60, step: 0.01 },
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitize(value: unknown): ShellChipBalanceConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const mw = Number(v.maxWidthPct);
  const ps = Number(v.prefSizePct);
  const ms = Number(v.minSizePct);
  const maxWidthPct = Number.isFinite(mw)
    ? clamp(mw, SHELL_CHIP_BALANCE_BOUNDS.maxWidth.min, SHELL_CHIP_BALANCE_BOUNDS.maxWidth.max)
    : DEFAULT_SHELL_CHIP_BALANCE.maxWidthPct;
  let prefSizePct = Number.isFinite(ps)
    ? clamp(ps, SHELL_CHIP_BALANCE_BOUNDS.size.min, SHELL_CHIP_BALANCE_BOUNDS.size.max)
    : DEFAULT_SHELL_CHIP_BALANCE.prefSizePct;
  let minSizePct = Number.isFinite(ms)
    ? clamp(ms, SHELL_CHIP_BALANCE_BOUNDS.size.min, SHELL_CHIP_BALANCE_BOUNDS.size.max)
    : DEFAULT_SHELL_CHIP_BALANCE.minSizePct;
  // Enforce min ≤ pref so the binary clamp can't invert.
  if (minSizePct > prefSizePct) {
    const swap = minSizePct;
    minSizePct = prefSizePct;
    prefSizePct = swap;
  }
  return { maxWidthPct, prefSizePct, minSizePct };
}

// ── In-memory store with committed value + ephemeral preview ───────

let committed: ShellChipBalanceConfig = { ...DEFAULT_SHELL_CHIP_BALANCE };
let preview: ShellChipBalanceConfig | null = null;
const listeners = new Set<() => void>();

function effective(): ShellChipBalanceConfig {
  return preview ?? committed;
}

export function getShellChipBalanceConfig(): ShellChipBalanceConfig {
  return effective();
}

export function subscribeShellChipBalance(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

/** Admin draft preview: ephemeral, not persisted. */
export function previewShellChipBalance(next: ShellChipBalanceConfig | null): void {
  preview = next ? sanitize(next) : null;
  notify();
}

// ── Geometry Lab draft + realtime registration ────────────────────
registerDomain<ShellChipBalanceConfig>({
  key: SHELL_CHIP_BALANCE_KEY,
  defaults: DEFAULT_SHELL_CHIP_BALANCE,
  sanitize,
  onApply: (next) => {
    committed = sanitize(next);
    preview = null;
    notify();
  },
});
