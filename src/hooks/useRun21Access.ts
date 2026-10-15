import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { acceptsRun21Capability, run21ProjectRef } from '@/lib/run21/access';

/** Discovery only. Every future gameplay/creation/join RPC must authorize again. */
export function useRun21Access(sessionId: string | null = null): boolean {
  const [access, setAccess] = useState<{ sessionId: string | null; allowed: boolean } | null>(null);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const projectRef = run21ProjectRef(import.meta.env.VITE_SUPABASE_URL);
    if (!projectRef) return;

    const refresh = async (userId: string | null) => {
      const requestGeneration = ++generation;
      setAccess(null);
      if (!userId) return;
      try {
        const { data, error } = await supabase.rpc('run21_capabilities' as never, {
          p_session_id: sessionId,
        } as never);
        if (!disposed && generation === requestGeneration) {
          setAccess({ sessionId, allowed: !error && acceptsRun21Capability(data, userId, sessionId, projectRef) });
        }
      } catch {
        if (!disposed && generation === requestGeneration) setAccess(null);
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Never make an auth-dependent request while the auth callback holds its lock.
      ++generation;
      setAccess(null);
      queueMicrotask(() => { if (!disposed) void refresh(session?.user.id ?? null); });
    });
    const initialGeneration = generation;
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && generation === initialGeneration) void refresh(data.session?.user.id ?? null);
    }).catch(() => { if (!disposed) setAccess(null); });
    return () => { disposed = true; ++generation; listener.subscription.unsubscribe(); };
  }, [sessionId]);
  return access?.sessionId === sessionId && access.allowed;
}
