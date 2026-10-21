import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** New-game discovery only; existing matches use their separate gameplay authority. */
export function useBattle31Access(sessionId: string | null = null): boolean {
  const [access, setAccess] = useState<{ sessionId: string | null; allowed: boolean } | null>(null);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const refresh = async (userId: string | null) => {
      const requestGeneration = ++generation;
      setAccess(null);
      if (!userId) return;
      try {
        const { data, error } = await supabase.rpc('battle31_capabilities' as never, { p_session_id: sessionId } as never);
        if (disposed || generation !== requestGeneration) return;
        const capability = data as Record<string, unknown> | null;
        setAccess({ sessionId, allowed: !error && capability?.version === 3 && capability.enabled === true &&
          capability.user_id === userId && capability.session_id === sessionId && typeof capability.fake_money_only === 'boolean' });
      } catch {
        if (!disposed && generation === requestGeneration) setAccess(null);
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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
