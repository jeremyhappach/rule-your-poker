/**
 * Debug Harness — sync runtime cache.
 *
 * The Game Defaults UI persists a `debug_harness` id per game_type on
 * the `game_defaults` table. Game-logic call sites (deck creation,
 * scoring shortcuts, etc.) are pure synchronous functions and cannot
 * await a DB query, so we mirror the rows into an in-memory cache
 * populated once at app boot and kept fresh via realtime.
 *
 * Contract:
 *   - `getActiveHarnessCached(gameType)` returns 'none' until the cache
 *     is hydrated. Callers MUST treat 'none' as a no-op so a slow first
 *     load can never silently flip behavior mid-session.
 *   - Cache values are stable strings matching profile ids in
 *     `./profiles.ts`. Unknown values surface as their raw text so the
 *     UI/registry remains the single source of truth for legality.
 */

import { supabase } from '@/integrations/supabase/client';

const cache: Record<string, string> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;
let realtimeBound = false;

export function getActiveHarnessCached(gameType: string): string {
  return cache[gameType] ?? 'none';
}

export function isHarnessCacheLoaded(): boolean {
  return loaded;
}

/** Idempotent hydrate + (lazy) realtime bind. Safe to call from many sites. */
export async function ensureHarnessCacheLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('game_defaults')
        .select('game_type, debug_harness');
      if (!error && data) {
        for (const row of data as Array<{ game_type: string; debug_harness: string | null }>) {
          cache[row.game_type] = row.debug_harness ?? 'none';
        }
      }
    } catch {
      /* swallow — 'none' fallback preserves safety */
    } finally {
      loaded = true;
      bindRealtime();
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
          cache[row.game_type] = (row.debug_harness ?? 'none') as string;
        },
      )
      .subscribe();
  } catch {
    /* noop */
  }
}
