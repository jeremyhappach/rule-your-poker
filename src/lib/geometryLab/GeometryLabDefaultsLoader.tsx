/**
 * Geometry Lab — single app-level loader + realtime channel.
 *
 * Replaces the per-domain bespoke loaders for JSON-blob `system_settings`
 * domains. One realtime channel routes every payload by `system_settings.key`
 * to the matching registered domain.
 *
 * REALTIME CONTRACT (post-audit, June 2026):
 *   1. Realtime: subscribe to ALL `system_settings` changes. At event
 *      time, check the live registry (NOT a captured key snapshot) so
 *      domains registered AFTER the loader mounts still receive remote
 *      updates. Previously the loader captured `listRegisteredKeys()`
 *      once at mount, silently dropping every late-registered domain
 *      (shell_nameplate, shell_chip_balance, holm_buck_indicator,
 *      cribbage.peggingRow, activeHandLayout.*, etc.) — producing the
 *      "persists but doesn't update until refresh" class of bug.
 *   2. Initial fetch: bulk-fetch every currently registered domain at
 *      mount; ALSO subscribe to `_subscribeRegistrations(...)` so any
 *      domain registered later triggers a one-shot lazy fetch of its
 *      committed value.
 *
 * Phase 1 scope unchanged: only domains registered via `registerDomain(...)`
 * route through here. `geometry_overrides` retains its own loader.
 */

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  _setFromRemote,
  _markBootstrappedNoRow,
  _subscribeRegistrations,
  isBootstrapped,
  listRegisteredKeys,
} from './defaultsRegistry';

export function GeometryLabDefaultsLoader() {
  useEffect(() => {
    let cancelled = false;
    let initialFetchDone = false;
    // Avoid duplicate lazy fetches for the same key.
    const lazyFetchInflight = new Set<string>();

    async function lazyFetchOne(key: string): Promise<void> {
      if (cancelled) return;
      if (isBootstrapped(key)) return;
      if (lazyFetchInflight.has(key)) return;
      lazyFetchInflight.add(key);
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[GeometryLabDefaultsLoader] lazy fetch failed', { key, error });
          _markBootstrappedNoRow(key);
          return;
        }
        if (data?.value != null) {
          _setFromRemote(key, data.value, { isInitialFetch: true, rowExists: true });
        } else {
          _markBootstrappedNoRow(key);
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[GeometryLabDefaultsLoader] lazy fetch threw', { key, err });
        _markBootstrappedNoRow(key);
      } finally {
        lazyFetchInflight.delete(key);
      }
    }

    // 1) Initial bulk fetch — one query for every domain registered at boot.
    void (async () => {
      try {
        const keys = listRegisteredKeys();
        if (keys.length > 0) {
          const { data, error } = await supabase
            .from('system_settings')
            .select('key,value')
            .in('key', keys);
          if (cancelled) return;
          if (error) {
            // eslint-disable-next-line no-console
            console.warn('[GeometryLabDefaultsLoader] initial fetch failed', error);
            for (const k of keys) _markBootstrappedNoRow(k);
          } else {
            const seen = new Set<string>();
            for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
              seen.add(row.key);
              _setFromRemote(row.key, row.value, { isInitialFetch: true, rowExists: true });
            }
            for (const k of keys) {
              if (!seen.has(k)) _markBootstrappedNoRow(k);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[GeometryLabDefaultsLoader] initial fetch threw', err);
        for (const k of listRegisteredKeys()) _markBootstrappedNoRow(k);
      } finally {
        initialFetchDone = true;
        // Any domain registered while the initial fetch was in flight is
        // already bootstrapped via the normal observer path. Catch any
        // stragglers that registered before this flag flipped but after
        // the keys snapshot was taken.
        for (const k of listRegisteredKeys()) {
          if (!isBootstrapped(k)) void lazyFetchOne(k);
        }
      }
    })();

    // 2) Late-registration observer — domains registered AFTER mount get
    //    a one-shot fetch so they see their committed value immediately
    //    without waiting for a future write.
    const unsubReg = _subscribeRegistrations((key) => {
      if (!initialFetchDone) return; // initial fetch will cover it
      void lazyFetchOne(key);
    });

    // 3) Single realtime channel — route every system_settings change by
    //    consulting the LIVE registry membership, not a captured key set.
    //    This is what lets late-registered domains receive remote echoes.
    const channel = supabase
      .channel('geometry_lab_defaults')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown } | null;
          if (!row?.key) return;
          // Live-check registry membership at event time.
          if (!listRegisteredKeys().includes(row.key)) return;
          const value = (payload.new as { value?: unknown } | null)?.value;
          if (value == null) return;
          _setFromRemote(row.key, value, { isInitialFetch: false });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      unsubReg();
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
