import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GamePresentationMetadata } from '@/lib/canonicalShell/presentationMode';

/** One read per route identity. No gameplay writes or new realtime/polling owner. */
export function useGamePresentationCatalog(sessionId: string | undefined) {
  const [loaded, setLoaded] = useState<{ sessionId: string; rows: GamePresentationMetadata[] } | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    // SELECT * also works with a pre-Phase-1 schema; the optional field then
    // resolves to table. No generated client-type dependency is needed.
    void Promise.resolve(supabase.from('game_defaults').select('*')).then(({data, error}) => {
      if (!cancelled) setLoaded({ sessionId, rows: error ? [] : (data ?? []) });
    }).catch(() => { if (!cancelled) setLoaded({ sessionId, rows: [] }); });
    return () => { cancelled = true; };
  }, [sessionId]);
  return loaded?.sessionId === sessionId ? loaded.rows : [];
}
