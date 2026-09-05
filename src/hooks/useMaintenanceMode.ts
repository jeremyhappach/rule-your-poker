import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useMaintenanceMode = () => {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMaintenanceMode = async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      if (!error && data) {
        const value = data.value as { enabled?: boolean };
        setIsMaintenanceMode(value?.enabled ?? false);
      }
      setLoading(false);
    };

    fetchMaintenanceMode();

    // Subscribe to changes
    const channel = supabase
      .channel('maintenance-mode-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: 'key=eq.maintenance_mode'
        },
        (payload) => {
          console.log('[MAINTENANCE] Settings changed:', payload);
          if (payload.new && typeof payload.new === 'object' && 'value' in payload.new) {
            const value = (payload.new as any).value as { enabled?: boolean };
            setIsMaintenanceMode(value?.enabled ?? false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleMaintenanceMode = async (enabled: boolean): Promise<boolean> => {
    const { data, error } = await supabase.rpc("admin_set_maintenance_mode" as any, { p_enabled: enabled } as any);
    if (error) {
      console.error("Maintenance request failed:", error);
      return false;
    }
    setIsMaintenanceMode((data as unknown as { enabled: boolean }).enabled);
    return true;
  };

  return { isMaintenanceMode, loading, toggleMaintenanceMode };
};
