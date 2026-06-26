/**
 * Canonical Shell Layout Config — global, shell-owned geometry contract.
 *
 * One source of truth for the play-region safe areas (top + bottom) that
 * the canonical shell exposes around the felt. Stored in
 * `public.system_settings` under key `canonical_shell_layout` as JSON:
 *
 *   { playSafeTop: number, playSafeBottom: number }
 *
 * Properties:
 *   - Loaded once at app boot (bootstrap...) and pushed into CSS vars
 *     `--play-top-safe-area` / `--play-bottom-safe-area`.
 *   - Realtime-subscribed: when an admin saves new values, every other
 *     device/tab/user receives them automatically — no reload required.
 *   - Editable only by admins (RLS on system_settings).
 *   - NOT a user/device/game preference. Applies globally.
 *
 * Defaults baked in are only used until the DB row is read; they match
 * the DB seed so first-paint matches the post-fetch geometry.
 */

import { supabase } from '@/integrations/supabase/client';
import { registerDomain } from '@/lib/geometryLab/defaultsRegistry';

export interface CanonicalShellLayoutConfig {
  playSafeTop: number;
  playSafeBottom: number;
}

export const CANONICAL_SHELL_LAYOUT_KEY = 'canonical_shell_layout';

export const DEFAULT_CANONICAL_SHELL_LAYOUT: CanonicalShellLayoutConfig = {
  playSafeTop: 24,
  playSafeBottom: 12,
};

export const CANONICAL_SHELL_LAYOUT_BOUNDS = {
  min: 0,
  max: 40,
  step: 2,
};

function clamp(n: number): number {
  const { min, max, step } = CANONICAL_SHELL_LAYOUT_BOUNDS;
  const c = Math.max(min, Math.min(max, n));
  return Math.round(c / step) * step;
}

function sanitize(value: unknown): CanonicalShellLayoutConfig {
  const v = (value ?? {}) as Partial<Record<string, unknown>>;
  const t = Number((v as Record<string, unknown>).playSafeTop);
  const b = Number((v as Record<string, unknown>).playSafeBottom);
  return {
    playSafeTop: Number.isFinite(t) ? clamp(t) : DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeTop,
    playSafeBottom: Number.isFinite(b) ? clamp(b) : DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeBottom,
  };
}

// ── In-memory store + subscribers ─────────────────────────────

let current: CanonicalShellLayoutConfig = { ...DEFAULT_CANONICAL_SHELL_LAYOUT };
const listeners = new Set<(c: CanonicalShellLayoutConfig) => void>();

function applyToDom(c: CanonicalShellLayoutConfig) {
  const root = document.documentElement;
  root.style.setProperty('--play-top-safe-area', `${c.playSafeTop}px`);
  root.style.setProperty('--play-bottom-safe-area', `${c.playSafeBottom}px`);
}

function setCurrent(next: CanonicalShellLayoutConfig) {
  current = next;
  applyToDom(next);
  listeners.forEach((l) => {
    try { l(next); } catch { /* noop */ }
  });
}

export function getCanonicalShellLayout(): CanonicalShellLayoutConfig {
  return current;
}

export function subscribeCanonicalShellLayout(
  listener: (c: CanonicalShellLayoutConfig) => void,
): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ── Bootstrap ────────────────────────────────────────────────

let bootstrapped = false;

/**
 * Apply baked defaults synchronously so first paint isn't blank, then
 * fetch the global config from the DB and subscribe to realtime updates.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function bootstrapCanonicalShellLayout(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // 1) Synchronous defaults so CSS vars exist before first render.
  applyToDom(current);

  // 2) Async fetch of authoritative global value.
  void (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', CANONICAL_SHELL_LAYOUT_KEY)
        .maybeSingle();
      if (error) {
        console.warn('[CanonicalShellLayoutConfig] fetch error', error);
        return;
      }
      if (data?.value) setCurrent(sanitize(data.value));
    } catch (err) {
      console.warn('[CanonicalShellLayoutConfig] fetch threw', err);
    }
  })();

  // 3) Realtime: every device/user receives admin saves automatically.
  try {
    supabase
      .channel('canonical-shell-layout-config')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: `key=eq.${CANONICAL_SHELL_LAYOUT_KEY}`,
        },
        (payload) => {
          const next = (payload.new as { value?: unknown } | null)?.value;
          if (next != null) setCurrent(sanitize(next));
        },
      )
      .subscribe();
  } catch (err) {
    console.warn('[CanonicalShellLayoutConfig] realtime subscribe failed', err);
  }
}

// ── Admin save ───────────────────────────────────────────────

/**
 * Persist new global values. Requires admin role (enforced by RLS).
 * On success the realtime channel will broadcast to every client,
 * including the caller — local state will update via that channel.
 */
export async function saveCanonicalShellLayout(
  next: Partial<CanonicalShellLayoutConfig>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const merged = sanitize({ ...current, ...next });
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: CANONICAL_SHELL_LAYOUT_KEY,
        value: merged as unknown as Record<string, number>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  if (error) return { ok: false, error: error.message };
  // Optimistically reflect locally; realtime will reconfirm.
  setCurrent(merged);
  return { ok: true };
}
