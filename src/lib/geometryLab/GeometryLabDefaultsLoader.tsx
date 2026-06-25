/**
 * Geometry Lab — single app-level loader + realtime channel (Phase 1).
 *
 * Replaces the per-domain bespoke loaders for JSON-blob `system_settings`
 * domains. One initial fetch + one channel routes every payload by
 * `system_settings.key` to the matching registered domain.
 *
 * Phase 1 scope: only domains registered via `registerDomain(...)` are
 * routed here. The existing canonical_shell_layout / deal_timing /
 * table_demo private channels keep running side-by-side until Phase 3
 * migrates each of them onto the registry. `geometry_overrides` retains
 * its own row-collection loader until Phase 2 lands the adapter.
 */

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  _setFromRemote,
  _markBootstrappedNoRow,
  listRegisteredKeys,
} from './defaultsRegistry';

export function GeometryLabDefaultsLoader() {
  useEffect(() => {
    const keys = listRegisteredKeys();
    if (keys.length === 0) {
      // No consumers registered yet — nothing to load. Subscribers added
      // later still get the seed value; realtime would not deliver
      // anything useful until a domain is registered anyway.
      return;
    }

    let cancelled = false;

    // 1) Initial fetch — one query for every registered key.
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key,value')
          .in('key', keys);
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[GeometryLabDefaultsLoader] initial fetch failed', error);
          // Mark every key as bootstrapped-no-row so drafts still work.
          for (const k of keys) _markBootstrappedNoRow(k);
          return;
        }
        const seen = new Set<string>();
        for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
          seen.add(row.key);
          _setFromRemote(row.key, row.value, { isInitialFetch: true, rowExists: true });
        }
        for (const k of keys) {
          if (!seen.has(k)) _markBootstrappedNoRow(k);
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[GeometryLabDefaultsLoader] initial fetch threw', err);
        for (const k of keys) _markBootstrappedNoRow(k);
      }
    })();

    // 2) Single realtime channel — route by row.key.
    const channel = supabase
      .channel('geometry_lab_defaults')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown } | null;
          if (!row?.key) return;
          if (!keys.includes(row.key)) return; // not our domain
          const value = (payload.new as { value?: unknown } | null)?.value;
          if (value == null) return;
          _setFromRemote(row.key, value, { isInitialFetch: false });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
