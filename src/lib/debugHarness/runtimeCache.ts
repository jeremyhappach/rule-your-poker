/**
 * Debug Harness — sync runtime cache.
 *
 * Two pieces of state are mirrored here so pure synchronous game-logic
 * call sites can branch correctly at bootstrap time without awaiting
 * any DB queries:
 *
 *   1. Per-game-type harness selection (game_defaults.debug_harness).
 *   2. The GLOBAL DEBUG MODE master gate
 *      (system_settings row key='debug_mode', value.enabled).
 *
 * Runtime contract (fail-closed):
 *   getActiveHarnessCached(gameType) returns 'none' UNLESS BOTH:
 *     - Global Debug Mode is ON, AND
 *     - The per-game harness for that game_type is a non-'none' value.
 *
 *   This means stale config, late realtime updates, or hydration-in-
 *   progress can never silently arm a harness.
 *
 *   Selections are preserved when Global Debug Mode is toggled OFF —
 *   only the *execution gate* flips. Turning debug mode back ON
 *   re-activates the existing selections without reconfiguration.
 *
 * Bootstrap-only application:
 *   Consumers of this module already read harness state at game
 *   creation / bootstrap call sites (deck creation, initial-state
 *   seeding, scenario application). Because reads are synchronous and
 *   one-shot at those sites, mid-session toggles never leak into
 *   in-flight games — the value was captured at hand setup.
 */

import { supabase } from '@/integrations/supabase/client';

const harnessCache: Record<string, string> = {};
let harnessLoaded = false;
let globalDebugEnabled = false;
let globalLoaded = false;
let loadPromise: Promise<void> | null = null;
let realtimeBound = false;

const globalListeners = new Set<(enabled: boolean) => void>();
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

export function subscribeHarnessCache(cb: () => void): () => void {
  harnessListeners.add(cb);
  return () => harnessListeners.delete(cb);
}

/**
 * Synchronously reconcile the in-tab harness cache after a successful
 * `game_defaults` write on the initiating client. This bypasses the
 * realtime echo so the next bootstrap-time `getActiveHarnessCached(...)`
 * call sees the new value immediately, with no reload required.
 *
 * Contract:
 *  - Call ONLY after the DB write has succeeded.
 *  - `id === 'none'` (or null/undefined) DELETES the entry from the
 *    cache map so subsequent reads fall through `harnessCache[gt] ?? 'none'`
 *    to the literal 'none' default — never a truthy stale sentinel.
 *  - A non-'none' id overwrites in place.
 *  - Listeners are notified so admin UI surfaces re-render.
 *  - This is a no-op for `ensureHarnessCacheLoaded()` semantics; the
 *    initial bootstrap fetch remains the sole hydration path.
 */
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
 * Raw per-game-type harness selection, IGNORING the global debug gate.
 * Use ONLY for admin UI surfaces that need to display preserved
 * selections while debug mode is off.
 */
export function getConfiguredHarnessCached(gameType: string): string {
  return harnessCache[gameType] ?? 'none';
}

/**
 * Returns the *active* harness id for a game type.
 * Fail-closed: returns 'none' whenever Global Debug Mode is off, the
 * caches haven't hydrated, or no per-game selection exists.
 */
export function getActiveHarnessCached(gameType: string): string {
  // Visibility: if a synchronous call site reads the cache before hydration
  // has completed, we fail-closed to 'none' AND warn loudly. This is the
  // canonical signature of a "harness configured but not honored" regression
  // caused by racing game-init against cache bootstrap.
  if (!harnessLoaded || !globalLoaded) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[DEBUG_HARNESS] getActiveHarnessCached('${gameType}') called before cache hydrated — returning 'none' (fail-closed). If a harness was expected, this is the bug.`,
      );
    }
    // Kick off hydration so subsequent calls succeed. Fire-and-forget.
    void ensureHarnessCacheLoaded();
    return 'none';
  }
  if (!globalDebugEnabled) return 'none';
  return harnessCache[gameType] ?? 'none';
}

export function isHarnessCacheLoaded(): boolean {
  return harnessLoaded && globalLoaded;
}

/** Idempotent hydrate + (lazy) realtime bind. Safe to call from many sites. */
export async function ensureHarnessCacheLoaded(): Promise<void> {
  if (harnessLoaded && globalLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [defaultsRes, settingsRes] = await Promise.all([
        supabase.from('game_defaults').select('game_type, debug_harness'),
        supabase.from('system_settings').select('value').eq('key', 'debug_mode').maybeSingle(),
      ]);
      if (!defaultsRes.error && defaultsRes.data) {
        for (const row of defaultsRes.data as Array<{ game_type: string; debug_harness: string | null }>) {
          harnessCache[row.game_type] = row.debug_harness ?? 'none';
        }
      }
      if (!settingsRes.error && settingsRes.data) {
        const v = (settingsRes.data as { value?: { enabled?: boolean } }).value;
        globalDebugEnabled = !!v?.enabled;
      }
    } catch {
      /* swallow — 'none' fallback preserves safety */
    } finally {
      harnessLoaded = true;
      globalLoaded = true;
      bindRealtime();
      globalListeners.forEach((cb) => cb(globalDebugEnabled));
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
  } catch {
    /* noop */
  }
}
