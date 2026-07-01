/**
 * useHarnessesMode — admin-controlled master gate for debug harness
 * *execution*. Persisted in system_settings (key='harnesses_mode').
 *
 * Independent of Global Debug Mode (which controls debug UI visibility).
 * Toggling OFF does NOT clear per-game harness selections — only flips
 * the execution gate consulted by `getActiveHarnessCached`.
 *
 * `useGlobalDebugMode` is exported as an alias to preserve existing
 * import sites; the "Harnesses" toggle in Admin has always driven this
 * gate under the hood.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ensureHarnessCacheLoaded,
  isHarnessesModeCached,
  isHarnessesModeLoaded,
  subscribeHarnessesMode,
} from './runtimeCache';

export function useHarnessesMode() {
  const [enabled, setEnabled] = useState<boolean>(isHarnessesModeCached());
  const [loading, setLoading] = useState<boolean>(!isHarnessesModeLoaded());

  useEffect(() => {
    let cancelled = false;
    void ensureHarnessCacheLoaded().then(() => {
      if (cancelled) return;
      setEnabled(isHarnessesModeCached());
      setLoading(false);
    });
    const unsub = subscribeHarnessesMode((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const toggle = async (next: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('system_settings')
      .update({ value: { enabled: next }, updated_at: new Date().toISOString() })
      .eq('key', 'harnesses_mode');
    if (error) {
      const { error: insErr } = await supabase
        .from('system_settings')
        .insert({ key: 'harnesses_mode', value: { enabled: next } });
      if (insErr) {
        console.error('[HARNESSES_MODE] toggle failed:', error, insErr);
        return false;
      }
    }
    setEnabled(next);
    return true;
  };

  return { enabled, loading, toggle };
}

/** @deprecated Alias — the "Harnesses" toggle drives harnesses_mode, not debug_mode. */
export const useGlobalDebugMode = useHarnessesMode;
