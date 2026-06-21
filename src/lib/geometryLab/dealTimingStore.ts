/**
 * Deal Timing — GLOBAL, shell-owned motion knobs that shape ONE DEAL.
 *
 * Mirrors `canonicalShellLayoutConfig` exactly: a single value lives in
 * `public.system_settings` (key: `deal_timing`), is bootstrapped once at
 * app boot, kept in sync via realtime, and is editable only by admins.
 *
 * Invariant — ONE DEAL, ONE FEEL:
 *   These values are NOT a per-user / per-device / per-game preference.
 *   Every player, every observer, every device sees the same timing so
 *   no one can infer who changed the settings by watching the motion.
 *
 *   launchSpacingMs       — gap between successive card launches
 *   durationMs            — translate(0)→translate(dx,dy) flight time
 *   ownershipClaimDelayMs — pause between arrival and destination
 *                           claiming ownership (transport destroyed)
 *
 * Inspect Mode still applies its own (slower) override at the call site
 * for visual auditing; normal play uses these global values.
 */

import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealTimingConfig {
  launchSpacingMs: number;
  durationMs: number;
  ownershipClaimDelayMs: number;
}

export const DEAL_TIMING_DEFAULTS: DealTimingConfig = {
  launchSpacingMs: 80,
  durationMs: 220,
  ownershipClaimDelayMs: 16,
};

export const DEAL_TIMING_BOUNDS = {
  launchSpacingMs: { min: 20, max: 800, step: 5 },
  durationMs: { min: 75, max: 600, step: 5 },
  ownershipClaimDelayMs: { min: 0, max: 100, step: 1 },
} as const;

export const DEAL_TIMING_KEY = 'deal_timing';

function clampField(n: unknown, key: keyof DealTimingConfig): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return DEAL_TIMING_DEFAULTS[key];
  const b = DEAL_TIMING_BOUNDS[key];
  const c = Math.max(b.min, Math.min(b.max, num));
  return Math.round(c / b.step) * b.step;
}

function sanitize(value: unknown): DealTimingConfig {
  const v = (value ?? {}) as Partial<Record<keyof DealTimingConfig, unknown>>;
  return {
    launchSpacingMs: clampField(v.launchSpacingMs, 'launchSpacingMs'),
    durationMs: clampField(v.durationMs, 'durationMs'),
    ownershipClaimDelayMs: clampField(v.ownershipClaimDelayMs, 'ownershipClaimDelayMs'),
  };
}

// ── In-memory store + subscribers ──────────────────────────────

let current: DealTimingConfig = { ...DEAL_TIMING_DEFAULTS };
const listeners = new Set<() => void>();

function setCurrent(next: DealTimingConfig) {
  current = next;
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function getDealTiming(): DealTimingConfig {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useDealTiming(): DealTimingConfig {
  return useSyncExternalStore(subscribe, getDealTiming, getDealTiming);
}

// ── Bootstrap ─────────────────────────────────────────────────

let bootstrapped = false;

export function bootstrapDealTiming(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  void (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', DEAL_TIMING_KEY)
        .maybeSingle();
      if (error) {
        console.warn('[DealTiming] fetch error', error);
        return;
      }
      if (data?.value) setCurrent(sanitize(data.value));
    } catch (err) {
      console.warn('[DealTiming] fetch threw', err);
    }
  })();

  try {
    supabase
      .channel('deal-timing-config')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: `key=eq.${DEAL_TIMING_KEY}`,
        },
        (payload) => {
          const next = (payload.new as { value?: unknown } | null)?.value;
          if (next != null) setCurrent(sanitize(next));
        },
      )
      .subscribe();
  } catch (err) {
    console.warn('[DealTiming] realtime subscribe failed', err);
  }
}

// ── Admin save ────────────────────────────────────────────────

/**
 * Persist new GLOBAL values. Requires admin role (enforced by RLS on
 * `system_settings`). Realtime broadcasts to every other client.
 */
export async function saveDealTiming(
  next: Partial<DealTimingConfig>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const merged = sanitize({ ...current, ...next });
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: DEAL_TIMING_KEY,
        value: merged as unknown as Record<string, number>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  if (error) return { ok: false, error: error.message };
  setCurrent(merged);
  return { ok: true };
}

export async function resetDealTiming(): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveDealTiming({ ...DEAL_TIMING_DEFAULTS });
}
