import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Smart deadline enforcer that polls the enforce-deadlines edge function.
 * Uses adaptive polling: every 10s normally, every 2s when deadline is imminent.
 */
export const useDeadlineEnforcer = (gameId: string | undefined, gameStatus: string | undefined) => {
  const lastCallRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!gameId) return;
    
    // Only enforce for active game states
    const activeStatuses = ['waiting_for_players', 'configuring', 'ante_up', 'in_progress'];
    if (!gameStatus || !activeStatuses.includes(gameStatus)) {
      return;
    }

    const callEnforceDeadlines = async () => {
      const now = Date.now();
      // Debounce: don't call more than once every 3 seconds to prevent rapid-fire after turn changes
      if (now - lastCallRef.current < 3000) return;
      lastCallRef.current = now;

      try {
        await supabase.functions.invoke('enforce-deadlines', {
          body: { 
            gameId,
            source: 'client-polling',
            requestId: crypto.randomUUID()
          }
        });
      } catch (error) {
        // Silent fail - edge function errors shouldn't crash the UI
        console.warn('[DeadlineEnforcer] Failed to call enforce-deadlines:', error);
      }
    };

    // Initial call
    callEnforceDeadlines();

    // Poll every 10 seconds
    intervalRef.current = setInterval(callEnforceDeadlines, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [gameId, gameStatus]);
};
