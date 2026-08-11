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
 * Resolve a configured harness to an executable one.
 *
 * This is the single execution boundary: selections remain visible in Admin
 * while the master switch is off, but no gameplay path may receive one until
 * both authoritative cache records have loaded and Harnesses Mode is enabled.
 */
export function resolveActiveHarnessId(
  configuredHarness: string | null | undefined,
  cacheReady: boolean,
  harnessesModeIsEnabled: boolean,
): string {
  if (!cacheReady || !harnessesModeIsEnabled) return 'none';
  return configuredHarness ?? 'none';
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
  return resolveActiveHarnessId(
    harnessCache[gameType],
    true,
    harnessesModeEnabled,
  );
}

export function isHarnessCacheLoaded(): boolean {
  return harnessLoaded && harnessesModeLoaded && globalLoaded;
}

/**
 * Authoritative re-read of the shared global harness record.
 *
 * The ONLY source of truth is:
 *   - public.game_defaults.debug_harness   (per game_type, global)
 *   - public.system_settings key='harnesses_mode'.value.enabled (global gate)
 *
 * Nothing here is user-, device- or dealer-scoped. Returns false when the
 * read failed, so callers can retry instead of pinning a stale 'none'.
 */
async function fetchAuthoritative(): Promise<boolean> {
  try {
    const [defaultsRes, settingsRes] = await Promise.all([
      supabase.from('game_defaults').select('game_type, debug_harness'),
      supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['debug_mode', 'harnesses_mode']),
    ]);
    if (defaultsRes.error || !defaultsRes.data) return false;
    if (settingsRes.error || !settingsRes.data) return false;

    for (const row of defaultsRes.data as Array<{ game_type: string; debug_harness: string | null }>) {
      harnessCache[row.game_type] = row.debug_harness ?? 'none';
    }
    for (const row of settingsRes.data as Array<{ key: string; value: { enabled?: boolean } | null }>) {
      const enabled = !!row.value?.enabled;
      if (row.key === 'debug_mode') globalDebugEnabled = enabled;
      if (row.key === 'harnesses_mode') harnessesModeEnabled = enabled;
    }
    return true;
  } catch {
    return false;
  }
}

function notifyAll(): void {
  globalListeners.forEach((cb) => cb(globalDebugEnabled));
  harnessesModeListeners.forEach((cb) => cb(harnessesModeEnabled));
  harnessListeners.forEach((cb) => cb());
}

/**
 * Force an authoritative re-read of the global record and notify listeners.
 * Used by harness-warning surfaces on mount and by realtime (re)subscription
 * so no client can drift onto a stale local projection.
 */
export async function refreshHarnessCache(): Promise<boolean> {
  const ok = await fetchAuthoritative();
  if (ok) {
    harnessLoaded = true;
    harnessesModeLoaded = true;
    globalLoaded = true;
  }
  bindRealtime();
  notifyAll();
  return ok;
}

/** Idempotent hydrate + (lazy) realtime bind. Safe to call from many sites. */
export async function ensureHarnessCacheLoaded(): Promise<void> {
  if (harnessLoaded && harnessesModeLoaded && globalLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ok = await fetchAuthoritative();
    if (ok) {
      harnessLoaded = true;
      harnessesModeLoaded = true;
      globalLoaded = true;
    } else {
      // Do NOT latch 'loaded' on a failed read — that would pin every
      // later lookup to a fail-closed 'none' for the whole session with no
      // retry. Clear the memoized promise so the next caller retries.
      loadPromise = null;
    }
    bindRealtime();
    notifyAll();
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
