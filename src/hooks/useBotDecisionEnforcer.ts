import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { makeBotDecisions } from '@/lib/botPlayer';

interface UseBotDecisionEnforcerProps {
  gameId: string | undefined;
  gameStatus: string | undefined;
  isPaused: boolean | undefined;
  allDecisionsIn: boolean | null | undefined;
  gameType: string | null | undefined;
  currentTurnPosition: number | null | undefined;
  roundId: string | undefined;
}

/**
 * Polling hook that runs every 2 seconds to detect and force stuck bot decisions.
 * This acts as a safety net when the normal useEffect-based bot trigger fails.
 */
export function useBotDecisionEnforcer({
  gameId,
  gameStatus,
  isPaused,
  allDecisionsIn,
  gameType,
  currentTurnPosition,
  roundId,
}: UseBotDecisionEnforcerProps) {
  const processingRef = useRef(false);
  const lastProcessedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    // Some code paths briefly use 'betting' as a game-level status; bots must still act.
    if (gameStatus !== 'in_progress' && gameStatus !== 'betting') return;
    if (isPaused) return;
    if (allDecisionsIn) return;

    const checkForStuckBot = async () => {
      // Skip if already processing
      if (processingRef.current) {
        return;
      }

      try {
        const isHolmGame = gameType === 'holm-game' || gameType === 'holm';
        
        // For Holm games, check if the current turn position is a bot that hasn't decided
        // For 3-5-7, check if any bot is missing a decision
        let query = supabase
          .from('players')
          .select('id, user_id, position, current_decision, is_bot, sitting_out')
          .eq('game_id', gameId)
          .eq('is_bot', true)
          .eq('sitting_out', false)
          .is('current_decision', null);

        if (isHolmGame && currentTurnPosition !== null && currentTurnPosition !== undefined) {
          query = query.eq('position', currentTurnPosition);
        }

        const { data: pendingBots } = await query;

        if (!pendingBots || pendingBots.length === 0) {
          // No stuck bots
          return;
        }

        // Create a key to avoid re-processing the same stuck state repeatedly
        const stuckKey = `${roundId}:${pendingBots.map(b => b.id).sort().join(',')}`;
        if (lastProcessedKeyRef.current === stuckKey) {
          // Already tried to fix this exact stuck state
          return;
        }

        console.log('[BOT ENFORCER] 🔧 Detected stuck bot(s), forcing decision:', {
          bots: pendingBots.map(b => ({ id: b.id, pos: b.position })),
          roundId,
          turnPosition: currentTurnPosition,
        });

        processingRef.current = true;
        lastProcessedKeyRef.current = stuckKey;

        try {
          await makeBotDecisions(gameId, currentTurnPosition ?? null);
          console.log('[BOT ENFORCER] ✅ Forced bot decision completed');
        } catch (error) {
          console.error('[BOT ENFORCER] ❌ Error forcing bot decision:', error);
        } finally {
          processingRef.current = false;
        }
      } catch (error) {
        console.error('[BOT ENFORCER] Error checking for stuck bots:', error);
      }
    };

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForStuckBot, 1000);

    // Poll every 2 seconds
    const interval = setInterval(checkForStuckBot, 2000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [gameId, gameStatus, isPaused, allDecisionsIn, gameType, currentTurnPosition, roundId]);

  // Reset the processed key when round changes to allow re-processing in new rounds
  useEffect(() => {
    lastProcessedKeyRef.current = null;
  }, [roundId]);
}
