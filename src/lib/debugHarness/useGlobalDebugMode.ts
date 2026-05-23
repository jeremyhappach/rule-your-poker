/**
 * useGlobalDebugMode — admin-controlled master gate for all debug
 * harnesses. Persisted in system_settings (key='debug_mode').
 *
 * Toggling OFF does NOT clear any per-game harness selection — it only
 * flips the execution gate (see runtimeCache.getActiveHarnessCached).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ensureHarnessCacheLoaded,
  isGlobalDebugModeCached,
  isGlobalDebugModeLoaded,
  subscribeGlobalDebugMode,
} from './runtimeCache';

export function useGlobalDebugMode() {
  const [enabled, setEnabled] = useState<boolean>(isGlobalDebugModeCached());
  const [loading, setLoading] = useState<boolean>(!isGlobalDebugModeLoaded());

  useEffect(() => {
    let cancelled = false;
    void ensureHarnessCacheLoaded().then(() => {
      if (cancelled) return;
      setEnabled(isGlobalDebugModeCached());
      setLoading(false);
    });
    const unsub = subscribeGlobalDebugMode((v) => {
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
      .eq('key', 'debug_mode');
    if (error) {
      // Row may not exist yet (fresh project) — insert it.
      const { error: insErr } = await supabase
        .from('system_settings')
        .insert({ key: 'debug_mode', value: { enabled: next } });
      if (insErr) {
        console.error('[GLOBAL_DEBUG_MODE] toggle failed:', error, insErr);
        return false;
      }
    }
    setEnabled(next);
    return true;
  };

  return { enabled, loading, toggle };
}
