/**
 * useNetworkSim — Loads the user's network simulation settings from profiles
 * and pushes them into the global networkSim runtime so simulateRealtime()
 * applies the correct delay profile.
 */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { configureNetworkSim, NetworkSimMode } from '@/lib/networkSim';

interface NetworkSimContextValue {
  mode: NetworkSimMode;
  loggingEnabled: boolean;
  refresh: () => Promise<void>;
}

const NetworkSimContext = createContext<NetworkSimContextValue | null>(null);

export function NetworkSimProvider({ children, userId }: { children: ReactNode; userId: string | undefined }) {
  const [mode, setMode] = useState<NetworkSimMode>('off');
  const [loggingEnabled, setLoggingEnabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      configureNetworkSim({ mode: 'off', loggingEnabled: false, userId: null });
      setMode('off');
      setLoggingEnabled(false);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('network_sim_mode, network_sim_logging' as any)
      .eq('id', userId)
      .maybeSingle();
    const nextMode = ((data as any)?.network_sim_mode ?? 'off') as NetworkSimMode;
    const nextLogging = Boolean((data as any)?.network_sim_logging);
    configureNetworkSim({ mode: nextMode, loggingEnabled: nextLogging, userId });
    setMode(nextMode);
    setLoggingEnabled(nextLogging);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Subscribe to live changes on this user's profile so toggling from settings
  // takes effect immediately without a reload.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile-network-sim-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const row = payload.new as any;
          const nextMode = (row?.network_sim_mode ?? 'off') as NetworkSimMode;
          const nextLogging = Boolean(row?.network_sim_logging);
          configureNetworkSim({ mode: nextMode, loggingEnabled: nextLogging, userId });
          setMode(nextMode);
          setLoggingEnabled(nextLogging);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <NetworkSimContext.Provider value={{ mode, loggingEnabled, refresh }}>
      {children}
    </NetworkSimContext.Provider>
  );
}

export function useNetworkSim(): NetworkSimContextValue {
  const ctx = useContext(NetworkSimContext);
  if (!ctx) {
    return { mode: 'off', loggingEnabled: false, refresh: async () => {} };
  }
  return ctx;
}
