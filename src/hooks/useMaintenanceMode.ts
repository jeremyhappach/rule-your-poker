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
    // If enabling maintenance mode, end all active sessions first
    if (enabled) {
      console.log('[MAINTENANCE] Enabling maintenance mode - ending all active sessions');
      
      // Get all active games
      const { data: activeGames } = await supabase
        .from('games')
        .select('id')
        .in('status', ['waiting', 'dealer_selection', 'game_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress', 'game_over']);

      if (activeGames && activeGames.length > 0) {
        const gameIds = activeGames.map(g => g.id);
        
        // End all active sessions
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString(),
            pending_session_end: false
          })
          .in('id', gameIds);
        
        console.log('[MAINTENANCE] Ended', gameIds.length, 'active sessions');
      }
    }

    // Update the maintenance mode setting
    const { error } = await supabase
      .from('system_settings')
      .update({ 
        value: { enabled },
        updated_at: new Date().toISOString()
      })
      .eq('key', 'maintenance_mode');

    if (error) {
      console.error('[MAINTENANCE] Error updating maintenance mode:', error);
      return false;
    }

    setIsMaintenanceMode(enabled);
    return true;
  };

  return { isMaintenanceMode, loading, toggleMaintenanceMode };
};
