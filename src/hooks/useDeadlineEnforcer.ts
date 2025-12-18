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
    // If the publishable key is unavailable in this build context, any backend call can hard-fail.
    // Bail early to prevent blank screens in error/preview environments.
    const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');
    if (!publishableKey || publishableKey.length === 0) {
      console.warn('[DEADLINE ENFORCER] Missing publishable key; skipping deadline enforcement');
      return;
    }

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
      if (now - lastCallRef.current < 2000) return;
      lastCallRef.current = now;

      try {
        // Must be authenticated to call this backend function (verify_jwt=true).
        // If auth is still initializing, skip this tick instead of surfacing errors.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          return;
        }

        // Wrap in inner try-catch to fully suppress transient cold-start errors
        let data, error;
        try {
          const result = await supabase.functions.invoke('enforce-deadlines', {
            body: { gameId },
          });
          data = result.data;
          error = result.error;
        } catch (invokeErr: any) {
          // Completely suppress transient errors - don't even log
          const msg = String(invokeErr?.message ?? invokeErr ?? '');
          if (msg.includes('503') || msg.includes('Key length is zero') || msg.includes('401') || msg.includes('cold start')) {
            return;
          }
          throw invokeErr; // Re-throw non-transient errors
        }

        if (error) {
          const msg = String((error as any)?.message ?? error ?? '');
          // Transient backend/platform states we should silently ignore and retry next poll.
          if (msg.includes('503') || msg.includes('Key length is zero') || msg.includes('401') || msg.includes('cold start')) {
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
