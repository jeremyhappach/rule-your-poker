/**
 * Debug Harness — sync runtime cache.
 *
 * Three pieces of state are mirrored here:
 *
 *   1. Per-game-type harness selection (game_defaults.debug_harness).
 *   2. HARNESSES MODE master gate
 *      (system_settings row key='harnesses_mode', value.enabled).
 *      This is the ONLY execution gate for debug harnesses.
 *   3. GLOBAL DEBUG MODE (system_settings row key='debug_mode',
 *      value.enabled) — controls visibility of debug pills / trace UI.
 *      It does NOT gate harness execution.
 *
 * Runtime contract (fail-closed):
 *   getActiveHarnessCached(gameType) returns 'none' UNLESS BOTH:
 *     - Harnesses Mode is ON, AND
 *     - The per-game harness for that game_type is a non-'none' value.
 *
 *   Global Debug Mode has no effect on harness execution — the two
 *   toggles are fully independent.
 *
 *   Selections are preserved when Harnesses Mode is toggled OFF —
 *   only the *execution gate* flips.
 */

import { supabase } from '@/integrations/supabase/client';

const harnessCache: Record<string, string> = {};
let harnessLoaded = false;
let harnessesModeEnabled = false;
let harnessesModeLoaded = false;
let globalDebugEnabled = false;
let globalLoaded = false;
let loadPromise: Promise<void> | null = null;
let realtimeBound = false;

const globalListeners = new Set<(enabled: boolean) => void>();
const harnessesModeListeners = new Set<(enabled: boolean) => void>();
const harnessListeners = new Set<() => void>();

export function isGlobalDebugModeCached(): boolean {
  return globalDebugEnabled;
}

export function isGlobalDebugModeLoaded(): boolean {
  return globalLoaded;
}

export function subscribeGlobalDebugMode(cb: (enabled: boolean) => void): () => void {
  globalListeners.add(cb);
  return () => globalListeners.delete(cb);
}

export function isHarnessesModeCached(): boolean {
  return harnessesModeEnabled;
}

export function isHarnessesModeLoaded(): boolean {
  return harnessesModeLoaded;
}

export function subscribeHarnessesMode(cb: (enabled: boolean) => void): () => void {
  harnessesModeListeners.add(cb);
  return () => harnessesModeListeners.delete(cb);
}

export function subscribeHarnessCache(cb: () => void): () => void {
  harnessListeners.add(cb);
  return () => harnessListeners.delete(cb);
}

export function setHarnessCacheValue(
  gameType: string,
  id: string | null | undefined,
): void {
  if (!id || id === 'none') {
    if (gameType in harnessCache) delete harnessCache[gameType];
  } else {
    harnessCache[gameType] = id;
  }
  harnessListeners.forEach((cb) => cb());
}

/**
 * Raw per-game-type harness selection, IGNORING the harnesses-mode gate.
 * Use ONLY for admin UI surfaces that need to display preserved
 * selections while harnesses mode is off.
 */
export function getConfiguredHarnessCached(gameType: string): string {
  return harnessCache[gameType] ?? 'none';
}

/**
 * Returns the *active* harness id for a game type.
 * Fail-closed: returns 'none' whenever Harnesses Mode is off, the
 * caches haven't hydrated, or no per-game selection exists.
 */
export function getActiveHarnessCached(gameType: string): string {
  if (!harnessLoaded || !harnessesModeLoaded) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[DEBUG_HARNESS] getActiveHarnessCached('${gameType}') called before cache hydrated — returning 'none' (fail-closed).`,
      );
    }
    void ensureHarnessCacheLoaded();
    return 'none';
  }
  if (!harnessesModeEnabled) return 'none';
  return harnessCache[gameType] ?? 'none';
}

export function isHarnessCacheLoaded(): boolean {
  return harnessLoaded && harnessesModeLoaded && globalLoaded;
}

/** Idempotent hydrate + (lazy) realtime bind. Safe to call from many sites. */
export async function ensureHarnessCacheLoaded(): Promise<void> {
  if (harnessLoaded && harnessesModeLoaded && globalLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [defaultsRes, settingsRes] = await Promise.all([
        supabase.from('game_defaults').select('game_type, debug_harness'),
        supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['debug_mode', 'harnesses_mode']),
      ]);
      if (!defaultsRes.error && defaultsRes.data) {
        for (const row of defaultsRes.data as Array<{ game_type: string; debug_harness: string | null }>) {
          harnessCache[row.game_type] = row.debug_harness ?? 'none';
        }
      }
      if (!settingsRes.error && settingsRes.data) {
        for (const row of settingsRes.data as Array<{ key: string; value: { enabled?: boolean } | null }>) {
          const enabled = !!row.value?.enabled;
          if (row.key === 'debug_mode') globalDebugEnabled = enabled;
          if (row.key === 'harnesses_mode') harnessesModeEnabled = enabled;
        }
      }
    } catch {
      /* swallow — 'none' fallback preserves safety */
    } finally {
      harnessLoaded = true;
      harnessesModeLoaded = true;
      globalLoaded = true;
      bindRealtime();
      globalListeners.forEach((cb) => cb(globalDebugEnabled));
      harnessesModeListeners.forEach((cb) => cb(harnessesModeEnabled));
      harnessListeners.forEach((cb) => cb());
    }
  })();
  return loadPromise;
}

function bindRealtime(): void {
  if (realtimeBound) return;
  realtimeBound = true;
  try {
    supabase
      .channel('debug-harness-cache')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_defaults' },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { game_type?: string; debug_harness?: string | null }
            | undefined;
          if (!row?.game_type) return;
          harnessCache[row.game_type] = (row.debug_harness ?? 'none') as string;
          harnessListeners.forEach((cb) => cb());
        },
      )
      .subscribe();

    supabase
      .channel('debug-global-mode')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.debug_mode' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { value?: { enabled?: boolean } } | undefined;
          const next = !!row?.value?.enabled;
          if (next === globalDebugEnabled) return;
          globalDebugEnabled = next;
          globalListeners.forEach((cb) => cb(globalDebugEnabled));
        },
      )
      .subscribe();

    supabase
      .channel('debug-harnesses-mode')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.harnesses_mode' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { value?: { enabled?: boolean } } | undefined;
          const next = !!row?.value?.enabled;
          if (next === harnessesModeEnabled) return;
          harnessesModeEnabled = next;
          harnessesModeListeners.forEach((cb) => cb(harnessesModeEnabled));
        },
      )
      .subscribe();
  } catch {
    /* noop */
  }
}
