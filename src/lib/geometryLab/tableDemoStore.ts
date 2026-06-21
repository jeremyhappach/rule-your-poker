/**
 * Table Demo — GLOBAL, shell-owned tuning mode that skips gameplay so
 * the lifecycle (deal → pause → advance → deal) keeps running without
 * any player having to make decisions.
 *
 * Mirrors `dealTimingStore` exactly: a single row in
 * `public.system_settings` (key: `table_demo`), bootstrapped once at
 * app boot, kept in sync via realtime, and editable only by admins.
 *
 * Invariant — ONE TABLE, ONE DEAL, ONE FEEL:
 *   Demo Mode is GLOBAL. Flipping it on affects every table, every
 *   device, every observer immediately. This is intentional for the
 *   pre-population tuning phase. If/when a real multiplayer population
 *   exists, this evolves into a per-session demo affordance.
 *
 *   enabled            — master switch
 *   pauseBetweenHandsMs — wall-clock pause after a hand settles before
 *                         the next deal is initiated (0–10000ms)
 */

import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TableDemoConfig {
  enabled: boolean;
  pauseBetweenHandsMs: number;
}

export const TABLE_DEMO_DEFAULTS: TableDemoConfig = {
  enabled: false,
  pauseBetweenHandsMs: 2000,
};

export const TABLE_DEMO_BOUNDS = {
  pauseBetweenHandsMs: { min: 0, max: 10000, step: 100 },
} as const;

export const TABLE_DEMO_KEY = 'table_demo';

function sanitize(value: unknown): TableDemoConfig {
  const v = (value ?? {}) as Partial<Record<keyof TableDemoConfig, unknown>>;
  const pauseRaw = Number(v.pauseBetweenHandsMs);
  const b = TABLE_DEMO_BOUNDS.pauseBetweenHandsMs;
  const pause = Number.isFinite(pauseRaw)
    ? Math.round(Math.max(b.min, Math.min(b.max, pauseRaw)) / b.step) * b.step
    : TABLE_DEMO_DEFAULTS.pauseBetweenHandsMs;
  return {
    enabled: v.enabled === true,
    pauseBetweenHandsMs: pause,
  };
}

// ── In-memory store + subscribers ──────────────────────────────

let current: TableDemoConfig = { ...TABLE_DEMO_DEFAULTS };
const listeners = new Set<() => void>();

function setCurrent(next: TableDemoConfig) {
  current = next;
  // Mirror onto window so non-React code paths (engine loops, bot
  // controllers) can cheaply read the live value without subscribing.
  try {
    (window as unknown as { __TABLE_DEMO__?: TableDemoConfig }).__TABLE_DEMO__ = next;
  } catch { /* SSR safety */ }
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function getTableDemo(): TableDemoConfig {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useTableDemo(): TableDemoConfig {
  return useSyncExternalStore(subscribe, getTableDemo, getTableDemo);
}

// ── Bootstrap ─────────────────────────────────────────────────

let bootstrapped = false;

export function bootstrapTableDemo(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // Seed window mirror with defaults immediately so non-React readers
  // never see undefined before the first DB fetch resolves.
  try {
    (window as unknown as { __TABLE_DEMO__?: TableDemoConfig }).__TABLE_DEMO__ = current;
  } catch { /* SSR safety */ }

  void (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', TABLE_DEMO_KEY)
        .maybeSingle();
      if (error) {
        console.warn('[TableDemo] fetch error', error);
        return;
      }
      if (data?.value) setCurrent(sanitize(data.value));
    } catch (err) {
      console.warn('[TableDemo] fetch threw', err);
    }
  })();

  try {
    supabase
      .channel('table-demo-config')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: `key=eq.${TABLE_DEMO_KEY}`,
        },
        (payload) => {
          const next = (payload.new as { value?: unknown } | null)?.value;
          if (next != null) setCurrent(sanitize(next));
        },
      )
      .subscribe();
  } catch (err) {
    console.warn('[TableDemo] realtime subscribe failed', err);
  }
}

// ── Admin save ────────────────────────────────────────────────

/**
 * Persist new GLOBAL values. Requires admin role (enforced by RLS on
 * `system_settings`). Realtime broadcasts to every other client.
 */
export async function saveTableDemo(
  next: Partial<TableDemoConfig>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const merged = sanitize({ ...current, ...next });
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      [{
        key: TABLE_DEMO_KEY,
        value: merged as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: 'key' },
    );
  if (error) return { ok: false, error: error.message };
  setCurrent(merged);
  return { ok: true };
}

export async function resetTableDemo(): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveTableDemo({ ...TABLE_DEMO_DEFAULTS });
}
