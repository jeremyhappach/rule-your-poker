/**
 * Shell Opponent Card-Backs Config — global, shell-owned geometry for
 * the canonical opponent-seat card-back fan (all games).
 *
 * Stored in `public.system_settings` under key
 * `shell_opponent_card_backs` as JSON:
 *
 *   { maxFanSpanPct: number }  // % of chip-bubble width
 *
 * CONTRACT
 *   maxFanSpanPx =
 *     resolvedChipBubbleWidthPx × (maxFanSpanPct / 100)
 *
 *   The percentage is the authored source of truth; pixels are only
 *   the derived measurement after the canonical chip bubble
 *   ([data-chip-center="${position}"]) has been resolved at runtime.
 *
 * POLICY (applied by `ShellOpponentCardBacks`):
 *   - Low card counts preserve the natural / default spread.
 *   - As card count rises, progressively tighten the horizontal fan
 *     only enough to remain within Maximum Fan Span.
 *   - Card-back size and aspect ratio stay canonical (per-variant
 *     constants owned by the renderer — no shrink-to-fit).
 *   - No readability / minimum-size logic; backs may overlap fully as
 *     needed to satisfy the cap.
 *   - The fan is centered on its existing opponent-card anchor.
 *   - No per-game exceptions and no viewport-based constants.
 *
 * Realtime: routed through GeometryLabDefaultsLoader's single channel
 * via registerDomain — every client receives admin saves automatically.
 */

import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface ShellOpponentCardBacksConfig {
  /** Maximum fan span as a percentage of the chip-bubble width. */
  maxFanSpanPct: number;
}

export const SHELL_OPPONENT_CARD_BACKS_KEY = 'shell_opponent_card_backs';

export const DEFAULT_SHELL_OPPONENT_CARD_BACKS: ShellOpponentCardBacksConfig = {
  // 250% of chip-bubble width ≈ preserves the current natural spread
  // that opponent stacks show in gin / cribbage today.
  maxFanSpanPct: 250,
};

export const SHELL_OPPONENT_CARD_BACKS_BOUNDS = {
  maxFanSpanPct: { min: 50, max: 800, step: 5 },
} as const;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitize(value: unknown): ShellOpponentCardBacksConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const raw = Number(v.maxFanSpanPct);
  return {
    maxFanSpanPct: Number.isFinite(raw)
      ? clamp(
          raw,
          SHELL_OPPONENT_CARD_BACKS_BOUNDS.maxFanSpanPct.min,
          SHELL_OPPONENT_CARD_BACKS_BOUNDS.maxFanSpanPct.max,
        )
      : DEFAULT_SHELL_OPPONENT_CARD_BACKS.maxFanSpanPct,
  };
}

// ── In-memory store with committed value + ephemeral preview ─────────

let committed: ShellOpponentCardBacksConfig = {
  ...DEFAULT_SHELL_OPPONENT_CARD_BACKS,
};
let preview: ShellOpponentCardBacksConfig | null = null;
const listeners = new Set<() => void>();

function effective(): ShellOpponentCardBacksConfig {
  return preview ?? committed;
}

export function getShellOpponentCardBacksConfig(): ShellOpponentCardBacksConfig {
  return effective();
}

export function subscribeShellOpponentCardBacks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

/** Admin draft preview: ephemeral, not persisted. */
export function previewShellOpponentCardBacks(
  next: ShellOpponentCardBacksConfig | null,
): void {
  preview = next ? sanitize(next) : null;
  notify();
}

// ── Geometry Lab draft + realtime registration ──────────────────────
registerDomain<ShellOpponentCardBacksConfig>({
  key: SHELL_OPPONENT_CARD_BACKS_KEY,
  defaults: DEFAULT_SHELL_OPPONENT_CARD_BACKS,
  sanitize,
  onApply: (next) => {
    committed = sanitize(next);
    preview = null;
    notify();
  },
});
