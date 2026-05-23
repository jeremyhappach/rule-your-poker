/**
 * useDebugHarness — runtime accessor for the active debug harness
 * profile id for a given game type.
 *
 * Reads game_defaults.debug_harness. Returns 'none' (no-op) when not
 * configured or while loading, so consumers can branch safely with zero
 * runtime impact when the harness is disabled.
 *
 * Usage:
 *   const harness = useDebugHarness('cribbage');
 *   if (harness === 'quick_skunk') { ...deterministic setup... }
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getHarnessProfile, type DebugHarnessId } from './profiles';

export function useDebugHarness(gameType: string | null | undefined): DebugHarnessId {
  const [harness, setHarness] = useState<DebugHarnessId>('none');

  useEffect(() => {
    if (!gameType) {
      setHarness('none');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('game_defaults')
        .select('debug_harness')
        .eq('game_type', gameType)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setHarness('none');
        return;
      }
      const id = (data as { debug_harness?: string | null }).debug_harness ?? 'none';
      // Validate against the registry so a stale/unknown id never leaks into runtime branches.
      setHarness(getHarnessProfile(gameType, id).id);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType]);

  return harness;
}

/** Imperative one-shot read for non-component code (bots, setup helpers). */
export async function readDebugHarness(gameType: string): Promise<DebugHarnessId> {
  const { data, error } = await supabase
    .from('game_defaults')
    .select('debug_harness')
    .eq('game_type', gameType)
    .maybeSingle();
  if (error || !data) return 'none';
  const id = (data as { debug_harness?: string | null }).debug_harness ?? 'none';
  return getHarnessProfile(gameType, id).id;
}
