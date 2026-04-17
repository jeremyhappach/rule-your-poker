/**
 * Mounts NetworkSimProvider + the always-visible indicator at the app root.
 * Listens to Supabase auth so the user-level setting is loaded as soon as
 * the user signs in, regardless of which page they're on.
 */
import { useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { NetworkSimProvider } from '@/hooks/useNetworkSim';
import { NetworkSimIndicator } from '@/components/NetworkSimIndicator';

export function AppNetworkSim({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <NetworkSimProvider userId={userId}>
      {children}
      <NetworkSimIndicator />
    </NetworkSimProvider>
  );
}
