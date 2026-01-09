import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Smart deadline enforcer that uses realtime subscriptions to minimize edge function calls.
 * 
 * Optimizations:
 * 1. If only 1 ACTIVE human player (not sitting out): NO polling at all (bots never timeout, cron handles disconnected human)
 * 2. For multi-human games: Only polls when a deadline is within 15 seconds of expiring
 * 3. Uses realtime subscriptions to detect deadline changes instead of constant polling
 * 
 * This reduces edge function calls by 83-100% depending on game composition.
 */
export const useDeadlineEnforcer = (gameId: string | undefined, gameStatus: string | undefined) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);
  const [nearestDeadline, setNearestDeadline] = useState<Date | null>(null);
  const [humanPlayerCount, setHumanPlayerCount] = useState<number>(0);
  const [isPollingActive, setIsPollingActive] = useState(false);

  // Cleanup function to clear all timers
  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPollingActive(false);
  }, []);

  // The actual enforcement call
  const enforceDeadlines = useCallback(async () => {
    if (!gameId) return;

    // Debounce - don't call more than once per 2 seconds
    const now = Date.now();
    if (now - lastCallRef.current < 2000) return;
    lastCallRef.current = now;

    try {
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

      const isGameMissing = (raw: string) => {
        const msg = raw.toLowerCase();
        return msg.includes('game not found') || msg.includes('pgrst116');
      };

      let data, error;
      try {
        const result = await supabase.functions.invoke('enforce-deadlines', {
          body: { gameId },
        });
        data = result.data;
        error = result.error;
      } catch {
        return;
      }

      if ((data as any)?.gameMissing) {
        clearTimers();
        return;
      }

      if (error) {
        const errorStr = JSON.stringify(error);
        const msg = String((error as any)?.message ?? (error as any)?.context?.message ?? error ?? '');

        if (isGameMissing(msg) || isGameMissing(errorStr)) {
          clearTimers();
          return;
        }

        if (shouldSuppress(msg) || shouldSuppress(errorStr)) return;
        return;
      }
    } catch {
      // Silently suppress all exceptions
    }
  }, [gameId, clearTimers]);

  // Start active polling (every 3 seconds)
  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // Already polling
    
    setIsPollingActive(true);
    
    // Call immediately
    enforceDeadlines();
    
    // Then poll every 3 seconds
    intervalRef.current = setInterval(enforceDeadlines, 3000);
  }, [enforceDeadlines]);

  // Schedule polling to start when deadline is imminent
  const schedulePolling = useCallback((deadline: Date, skipIfSingleHuman: boolean) => {
    clearTimers();
    
    // If only 1 human player, skip all client-side polling
    // Bots never timeout, and cron handles disconnected human
    if (skipIfSingleHuman) {
      return;
    }
    
    const now = new Date();
    const msUntilDeadline = deadline.getTime() - now.getTime();
    const msUntilPollingStart = msUntilDeadline - 15000; // Start 15 seconds before deadline
    
    if (msUntilPollingStart <= 0) {
      // Deadline is within 15 seconds, start polling immediately
      startPolling();
    } else {
      // Schedule polling to start 15 seconds before deadline
      timeoutRef.current = setTimeout(() => {
        startPolling();
      }, msUntilPollingStart);
    }
  }, [clearTimers, startPolling]);

  // Calculate the nearest deadline from game/round state
  const calculateNearestDeadline = useCallback((
    gameData: {
      config_deadline?: string | null;
      ante_decision_deadline?: string | null;
      game_over_at?: string | null;
    } | null,
    roundDeadline?: string | null
  ): Date | null => {
    const deadlines: Date[] = [];
    
    if (gameData?.config_deadline) {
      deadlines.push(new Date(gameData.config_deadline));
    }
    if (gameData?.ante_decision_deadline) {
      deadlines.push(new Date(gameData.ante_decision_deadline));
    }
    if (roundDeadline) {
      deadlines.push(new Date(roundDeadline));
    }
    
    // Filter to only future deadlines
    const now = new Date();
    const futureDeadlines = deadlines.filter(d => d > now);
    
    if (futureDeadlines.length === 0) return null;
    
    // Return the nearest one
    return futureDeadlines.reduce((nearest, current) => 
      current < nearest ? current : nearest
    );
  }, []);

  // Fetch ACTIVE human player count (not sitting out) for the game
  const fetchActiveHumanPlayerCount = useCallback(async () => {
    if (!gameId) return 0;
    
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('is_bot', false)
        .eq('sitting_out', false);
      
      if (error) return 0;
      return data?.length ?? 0;
    } catch {
      return 0;
    }
  }, [gameId]);

  // Main effect: subscribe to realtime and manage polling
  useEffect(() => {
    if (!gameId) {
      clearTimers();
      return;
    }

    // Only run enforcer during active game states
    const activeStates = ['configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over'];
    if (!gameStatus || !activeStates.includes(gameStatus)) {
      clearTimers();
      return;
    }

    let isMounted = true;
    let currentHumanCount = 0;

    // Fetch initial game/round state to get deadlines and player count
    const fetchInitialState = async () => {
      try {
        // Get human player count
        currentHumanCount = await fetchActiveHumanPlayerCount();
        if (isMounted) {
          setHumanPlayerCount(currentHumanCount);
        }

        const { data: gameData } = await supabase
          .from('games')
          .select('config_deadline, ante_decision_deadline, game_over_at, current_round')
          .eq('id', gameId)
          .single();

        if (!isMounted || !gameData) return;

        let roundDeadline: string | null = null;
        if (gameData.current_round !== null && gameData.current_round !== undefined) {
          const { data: roundData } = await supabase
            .from('rounds')
            .select('decision_deadline')
            .eq('game_id', gameId)
            .eq('round_number', gameData.current_round)
            .single();
          
          roundDeadline = roundData?.decision_deadline ?? null;
        }

        const nearest = calculateNearestDeadline(gameData, roundDeadline);
        if (isMounted) {
          setNearestDeadline(nearest);
          if (nearest) {
            schedulePolling(nearest, currentHumanCount <= 1);
          }
        }
      } catch {
        // Ignore errors on initial fetch
      }
    };

    fetchInitialState();

    // Subscribe to player changes (to track human count)
    const playerChannel = supabase
      .channel(`deadline-players-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          if (!isMounted) return;
          
          const newCount = await fetchActiveHumanPlayerCount();
          if (isMounted) {
            currentHumanCount = newCount;
            setHumanPlayerCount(newCount);
            
            // If we went from multi-human to single-human, stop polling
            if (newCount <= 1) {
              clearTimers();
            }
          }
        }
      )
      .subscribe();

    // Subscribe to game changes
    const gameChannel = supabase
      .channel(`deadline-game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          
          const newData = payload.new as any;
          if (!newData) return;

          // Get current round deadline if applicable
          let roundDeadline: string | null = null;
          if (newData.current_round !== null && newData.current_round !== undefined) {
            const { data: roundData } = await supabase
              .from('rounds')
              .select('decision_deadline')
              .eq('game_id', gameId)
              .eq('round_number', newData.current_round)
              .single();
            
            roundDeadline = roundData?.decision_deadline ?? null;
          }

          const nearest = calculateNearestDeadline(newData, roundDeadline);
          
          if (isMounted) {
            const previousDeadline = nearestDeadline;
            setNearestDeadline(nearest);
            
            // If deadline changed, reschedule polling
            if (nearest?.getTime() !== previousDeadline?.getTime()) {
              if (nearest) {
                schedulePolling(nearest, currentHumanCount <= 1);
              } else {
                // No more deadlines, stop polling
                clearTimers();
              }
            }
          }
        }
      )
      .subscribe();

    // Subscribe to round changes (for decision_deadline)
    const roundChannel = supabase
      .channel(`deadline-rounds-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          
          const roundData = payload.new as any;
          if (!roundData?.decision_deadline) return;

          // Re-fetch game data to calculate nearest deadline
          const { data: gameData } = await supabase
            .from('games')
            .select('config_deadline, ante_decision_deadline, game_over_at, current_round')
            .eq('id', gameId)
            .single();

          if (!isMounted || !gameData) return;

          // Only consider the current round's deadline
          let relevantRoundDeadline: string | null = null;
          if (gameData.current_round === roundData.round_number) {
            relevantRoundDeadline = roundData.decision_deadline;
          }

          const nearest = calculateNearestDeadline(gameData, relevantRoundDeadline);
          
          if (isMounted) {
            setNearestDeadline(nearest);
            if (nearest) {
              schedulePolling(nearest, currentHumanCount <= 1);
            } else {
              clearTimers();
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearTimers();
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(gameChannel);
      supabase.removeChannel(roundChannel);
    };
  }, [gameId, gameStatus, clearTimers, calculateNearestDeadline, schedulePolling, fetchActiveHumanPlayerCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);
};
