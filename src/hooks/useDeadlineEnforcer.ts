import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that periodically calls the server-side deadline enforcer.
 * This ensures deadlines are enforced even if the responsible player's client is closed.
 * Any active client in the game will trigger deadline enforcement for ALL players.
 */
export const useDeadlineEnforcer = (gameId: string | undefined, gameStatus: string | undefined) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);

  useEffect(() => {
    console.log('[DEADLINE ENFORCER] Hook called with gameId:', gameId, 'status:', gameStatus);
    
    if (!gameId) {
      console.log('[DEADLINE ENFORCER] No gameId, skipping');
      return;
    }

    // Only run enforcer during active game states that have deadlines
    const activeStates = ['configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over'];
    if (!gameStatus || !activeStates.includes(gameStatus)) {
      console.log('[DEADLINE ENFORCER] Status not active, skipping. Status:', gameStatus);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const enforceDeadlines = async () => {
      // Debounce - don't call more than once per 2 seconds
      const now = Date.now();
      if (now - lastCallRef.current < 2000) {
        return;
      }
      lastCallRef.current = now;

      try {
        const { data, error } = await supabase.functions.invoke('enforce-deadlines', {
          body: { gameId },
        });

        if (error) {
          // Transient backend/platform states we should silently ignore and retry next poll.
          // - 503: cold start / env not ready
          // - 401 "Key length is zero": upstream rejected request before function runs (missing/empty apikey)
          // - 401: general auth errors during cold start
          const msg = String(error.message || error || '');
          if (msg.includes('503') || msg.includes('Key length is zero') || msg.includes('401') || msg.includes('cold start')) {
            // Silent retry on next poll - these are transient infrastructure issues
            return;
          }
          console.error('[DEADLINE ENFORCER] Error:', error);
          return;
        }

        if (data?.actionsTaken?.length > 0) {
          console.log('[DEADLINE ENFORCER] Actions taken:', data.actionsTaken);
        }
      } catch (err) {
        console.error('[DEADLINE ENFORCER] Exception:', err);
      }
    };

    // Call immediately on mount/status change
    enforceDeadlines();

    // Poll every 3 seconds
    intervalRef.current = setInterval(enforceDeadlines, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [gameId, gameStatus]);
};
