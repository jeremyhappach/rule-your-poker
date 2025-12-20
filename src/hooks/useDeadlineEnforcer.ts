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
      return;
    }

    if (!gameId) {
      return;
    }

    // Only run enforcer during active game states that have deadlines
    const activeStates = ['configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over'];
    if (!gameStatus || !activeStates.includes(gameStatus)) {
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

        const shouldSuppress = (rawMsg: string) => {
          const msg = rawMsg.toLowerCase();
          return (
            msg.includes('503') ||
            msg.includes('500') ||
            msg.includes('502') ||
            msg.includes('504') ||
            msg.includes('401') ||
            msg.includes('404') ||
            msg.includes('cold start') ||
            msg.includes('key length is zero') ||
            msg.includes('game not found') ||
            msg.includes('connection reset') ||
            msg.includes('sendrequest') ||
            msg.includes('client error') ||
            msg.includes('dns error') ||
            msg.includes('name resolution') ||
            msg.includes('temporary') ||
            msg.includes('service unavailable') ||
            msg.includes('functionsrelayhttperror') ||
            msg.includes('functionshttperror') ||
            msg.includes('fetch')
          );
        };

        const stopPolling = () => {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        };

        const isGameMissing = (raw: string) => {
          const msg = raw.toLowerCase();
          return msg.includes('game not found') || msg.includes('pgrst116');
        };

        // Wrap in inner try-catch to fully suppress transient backend errors
        let data, error;
        try {
          const result = await supabase.functions.invoke('enforce-deadlines', {
            body: { gameId },
          });
          data = result.data;
          error = result.error;
        } catch {
          // Silently suppress all invoke exceptions - these are transient
          return;
        }

        // If the backend tells us the game is gone, stop polling.
        if ((data as any)?.gameMissing) {
          stopPolling();
          return;
        }

        if (error) {
          const errorStr = JSON.stringify(error);
          const msg = String((error as any)?.message ?? (error as any)?.context?.message ?? error ?? '');

          if (isGameMissing(msg) || isGameMissing(errorStr)) {
            stopPolling();
            return;
          }

          if (shouldSuppress(msg) || shouldSuppress(errorStr)) return;
          return;
        }

        // Silently ignore success results
      } catch {
        // Silently suppress all exceptions
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
