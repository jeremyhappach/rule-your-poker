import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SLIM CLIENT-SIDE DEADLINE ENFORCER
 * 
 * This edge function is designed to be called by connected clients.
 * It ONLY handles time-sensitive deadline enforcement:
 * - Config deadline (dealer setup timeout)
 * - Ante decision deadline
 * - Decision deadline (stay/fold during gameplay)
 * 
 * It does NOT handle:
 * - Stale game cleanup (handled by cron)
 * - Bot-only game detection (handled by cron)
 * - Hand evaluation/game progression (handled by cron)
 * - Game over countdown progression (handled by cron)
 * 
 * This keeps the function fast and focused for client-side polling.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to log sitting_out/sit_out_next_hand changes for debugging
async function logSittingOutChange(
  supabase: any,
  playerId: string,
  userId: string,
  gameId: string,
  username: string | null,
  isBot: boolean,
  fieldChanged: 'sitting_out' | 'sit_out_next_hand',
  oldValue: boolean,
  newValue: boolean,
  reason: string,
  sourceLocation: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  if (isBot) return;
  if (oldValue === newValue) return;

  try {
    await supabase
      .from('sitting_out_debug_log')
      .insert({
        player_id: playerId,
        user_id: userId,
        game_id: gameId,
        username: username || null,
        is_bot: isBot,
        field_changed: fieldChanged,
        old_value: oldValue,
        new_value: newValue,
        reason,
        source_location: sourceLocation,
        additional_context: additionalContext || null,
      });
  } catch (e) {
    console.error('[ENFORCE] Failed to log sitting out change:', e);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const keyToUse = serviceRoleKey || anonKey;

    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[ENFORCE-CLIENT] Missing required env vars');
      return new Response(JSON.stringify({
        error: 'Backend configuration missing',
        retry: true,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[ENFORCE-CLIENT] Failed to parse request body:', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gameId: string | undefined = body?.gameId;
    const source: string = body?.source ?? 'client';
    const requestId: string | null = typeof body?.requestId === 'string' ? body.requestId : null;

    console.log('[ENFORCE-CLIENT] Received', { gameId, source, requestId });
    
    if (!gameId) {
      return new Response(JSON.stringify({ error: 'gameId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const actionsTaken: string[] = [];

    // Fetch game data
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    // Game not found - return success so clients don't error
    if (!game) {
      return new Response(JSON.stringify({
        success: true,
        gameMissing: true,
        gameId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (gameError) {
      console.error('[ENFORCE-CLIENT] Game query failed:', gameError);
      return new Response(JSON.stringify({
        error: 'Temporary backend error',
        retry: true,
        gameId,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip paused games - deadlines freeze when paused
    if (game.is_paused) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Game is paused, no deadlines enforced',
        actionsTaken: [],
        gameStatus: game.status,
        isPaused: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= 1. ENFORCE CONFIG DEADLINE =============
    if ((game.status === 'dealer_selection' || game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
      const configDeadline = new Date(game.config_deadline);
      const msUntilDeadline = configDeadline.getTime() - now.getTime();
      
      if (msUntilDeadline <= 0) {
        console.log('[ENFORCE-CLIENT] Config deadline EXPIRED for game', gameId);
        
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        const dealerPlayer = players?.find((p: any) => p.position === game.dealer_position);

        if (dealerPlayer) {
          await logSittingOutChange(
            supabase,
            dealerPlayer.id,
            dealerPlayer.user_id,
            gameId,
            null,
            dealerPlayer.is_bot,
            'sitting_out',
            dealerPlayer.sitting_out,
            true,
            'Dealer timed out during config phase',
            'enforce-deadlines/client:config_deadline',
            { dealer_position: game.dealer_position, config_deadline: game.config_deadline }
          );

          // Mark dealer as sitting out
          await supabase
            .from('players')
            .update({ sitting_out: true, waiting: false })
            .eq('id', dealerPlayer.id);

          actionsTaken.push(`Config timeout: Dealer at position ${dealerPlayer.position} sat out`);

          // Fetch game defaults to check allow_bot_dealers
          const { data: gameDefaults } = await supabase
            .from('game_defaults')
            .select('allow_bot_dealers')
            .eq('game_type', 'holm')
            .maybeSingle();
          
          const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

          // Re-fetch players to get updated list
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);

          // Count remaining eligible dealers
          const eligibleDealers = freshPlayers?.filter((p: any) =>
            !p.sitting_out &&
            p.id !== dealerPlayer.id &&
            (allowBotDealers || !p.is_bot)
          ) || [];

          if (eligibleDealers.length >= 1) {
            // Rotate dealer to next eligible player
            const sortedEligible = eligibleDealers.sort((a: any, b: any) => a.position - b.position);
            const currentDealerIdx = sortedEligible.findIndex((p: any) => p.position > game.dealer_position);
            const nextDealer = currentDealerIdx >= 0
              ? sortedEligible[currentDealerIdx]
              : sortedEligible[0];

            const newConfigDeadline = new Date(Date.now() + 30000).toISOString();

            await supabase
              .from('games')
              .update({
                dealer_position: nextDealer.position,
                config_deadline: newConfigDeadline,
              })
              .eq('id', gameId);

            actionsTaken.push(`Config timeout: Rotated dealer to position ${nextDealer.position}`);
          } else {
            // Not enough eligible dealers
            await supabase
              .from('games')
              .update({
                status: 'waiting_for_players',
                config_deadline: null,
                config_complete: false,
              })
              .eq('id', gameId);

            actionsTaken.push('Config timeout: No eligible dealers, returning to waiting_for_players');
          }
        }
      }
    }

    // ============= 2. ENFORCE ANTE DECISION DEADLINE =============
    if (game.status === 'ante_decision') {
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId);
      
      // CRITICAL FIX: Bots should ALWAYS ante up immediately, regardless of deadline
      // This prevents the race condition where client-side makeBotAnteDecisions doesn't fire
      const undecidedBots = players?.filter((p: any) => 
        p.is_bot && !p.ante_decision && !p.sitting_out
      ) || [];
      
      if (undecidedBots.length > 0) {
        console.log('[ENFORCE-CLIENT] 🤖 Auto-anteing', undecidedBots.length, 'bots for game', gameId);
        
        const botIds = undecidedBots.map((p: any) => p.id);
        await supabase
          .from('players')
          .update({ ante_decision: 'ante_up' })
          .in('id', botIds);
        
        actionsTaken.push(`Bot ante: Auto-anted ${botIds.length} bots`);
      }
      
      // Now check if deadline has expired for HUMANS
      if (game.ante_decision_deadline) {
        const anteDeadline = new Date(game.ante_decision_deadline);
        if (now > anteDeadline) {
          console.log('[ENFORCE-CLIENT] Ante deadline expired for game', gameId);
          
          // Re-fetch players after bot ante updates
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);
          
          // Find undecided HUMAN players and auto-sit them out (bots already handled above)
          const undecidedHumans = freshPlayers?.filter((p: any) => 
            !p.is_bot && !p.ante_decision && !p.sitting_out
          ) || [];
          
          if (undecidedHumans.length > 0) {
            for (const player of undecidedHumans) {
              await logSittingOutChange(
                supabase,
                player.id,
                player.user_id,
                gameId,
                null,
                player.is_bot,
                'sitting_out',
                player.sitting_out,
                true,
                'Player did not respond to ante decision in time',
                'enforce-deadlines/client:ante_deadline',
                { ante_decision_deadline: game.ante_decision_deadline }
              );
            }

            const undecidedIds = undecidedHumans.map((p: any) => p.id);
            
            await supabase
              .from('players')
              .update({
                ante_decision: 'sit_out',
                sitting_out: true,
                waiting: false,
              })
              .in('id', undecidedIds);
            
            actionsTaken.push(`Ante timeout: Auto-sat-out ${undecidedIds.length} undecided human players`);
          }
          
          // Re-fetch players after updates
          const { data: finalPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);
          
          const antedUpPlayers = finalPlayers?.filter((p: any) => p.ante_decision === 'ante_up' && !p.sitting_out) || [];
          
          console.log('[ENFORCE-CLIENT] After ante timeout: anted_up=', antedUpPlayers.length);
          
          if (antedUpPlayers.length >= 2) {
            await supabase
              .from('games')
              .update({ ante_decision_deadline: null })
              .eq('id', gameId);
            
            actionsTaken.push(`Ante timeout: ${antedUpPlayers.length} players anted up, ready to start`);
          } else {
            // Not enough players
            const currentDealer = finalPlayers?.find((p: any) => p.position === game.dealer_position);
            const dealerIsActive = currentDealer && !currentDealer.sitting_out;
            
            if (!dealerIsActive) {
              const eligibleDealers = finalPlayers?.filter((p: any) => 
                !p.is_bot && !p.sitting_out
              ).sort((a: any, b: any) => a.position - b.position) || [];
              
              if (eligibleDealers.length >= 1) {
                const currentPos = game.dealer_position || 1;
                const higherPositions = eligibleDealers.filter((p: any) => p.position > currentPos);
                const nextDealer = higherPositions.length > 0 
                  ? higherPositions[0] 
                  : eligibleDealers[0];
                
                await supabase
                  .from('games')
                  .update({
                    status: 'waiting_for_players',
                    ante_decision_deadline: null,
                    dealer_position: nextDealer.position,
                  })
                  .eq('id', gameId);
                
                actionsTaken.push(`Ante timeout: Dealer sat out, rotated to position ${nextDealer.position}`);
              } else {
                await supabase
                  .from('games')
                  .update({
                    status: 'waiting_for_players',
                    ante_decision_deadline: null,
                  })
                  .eq('id', gameId);
                
                actionsTaken.push('Ante timeout: No active players, returning to waiting_for_players');
              }
            } else {
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  ante_decision_deadline: null,
                })
                .eq('id', gameId);
              
              actionsTaken.push(`Ante timeout: Only ${antedUpPlayers.length} player(s) anted up, returning to waiting_for_players`);
            }
          }
        }
      }
    }

    // ============= 3. ENFORCE DECISION DEADLINE (stay/fold) =============
    if (game.status === 'in_progress' || game.status === 'betting') {
      // ============= 3A. HOLM GAME TURN TIMEOUTS =============
      if (game.game_type === 'holm-game') {
        const { data: overdueRounds } = await supabase
          .from('rounds')
          .select('*')
          .eq('game_id', gameId)
          .eq('status', 'betting')
          .not('decision_deadline', 'is', null)
          .lt('decision_deadline', nowIso)
          .order('decision_deadline', { ascending: true })
          .limit(1);

        const currentRound = overdueRounds?.[0];

        if (currentRound?.decision_deadline && currentRound.status === 'betting') {
          const decisionDeadline = new Date(currentRound.decision_deadline);
          if (now > decisionDeadline) {
            console.log('[ENFORCE-CLIENT] Decision deadline expired for game', gameId, 'round', currentRound.round_number);

            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            const activePlayers = players?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];
            const currentTurnPos = currentRound.current_turn_position;

            if (currentTurnPos) {
              const currentTurnPlayer = activePlayers.find((p: any) => p.position === currentTurnPos);

              if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
                if (currentTurnPlayer.is_bot) {
                  // Bot decision - simple 50/50
                  const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                  const { data: botUpdateResult } = await supabase
                    .from('players')
                    .update({ current_decision: botDecision, decision_locked: true })
                    .eq('id', currentTurnPlayer.id)
                    .eq('decision_locked', false)
                    .select();

                  if (botUpdateResult && botUpdateResult.length > 0) {
                    actionsTaken.push(`Bot timeout: Made decision '${botDecision}' for position ${currentTurnPlayer.position}`);
                  }
                } else {
                  // Human player - auto-fold
                  const { data: humanUpdateResult } = await supabase
                    .from('players')
                    .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                    .eq('id', currentTurnPlayer.id)
                    .eq('decision_locked', false)
                    .select();

                  if (!humanUpdateResult || humanUpdateResult.length === 0) {
                    console.log('[ENFORCE-CLIENT] Skipping player update - already processed by another client');
                    actionsTaken.push('Skipped - player already processed');
                  } else {
                    actionsTaken.push(
                      `Decision timeout: Auto-folded player at position ${currentTurnPlayer.position}`
                    );
                  }
                }

                // Advance turn to next undecided player
                const { data: freshPlayers } = await supabase
                  .from('players')
                  .select('*')
                  .eq('game_id', gameId);

                const freshActivePlayers = freshPlayers?.filter((p: any) => 
                  p.status === 'active' && !p.sitting_out && p.ante_decision === 'ante_up'
                ) || [];
                const undecidedPlayers = freshActivePlayers.filter((p: any) => !p.decision_locked);

                if (undecidedPlayers.length > 0) {
                  // Find next undecided player
                  const sortedUndecided = undecidedPlayers.sort((a: any, b: any) => a.position - b.position);
                  const higherPositions = sortedUndecided.filter((p: any) => p.position > currentTurnPos);
                  const nextPlayer = higherPositions.length > 0 
                    ? higherPositions[0] 
                    : sortedUndecided[0];

                  // Get decision timer
                  const { data: gameDefaults } = await supabase
                    .from('game_defaults')
                    .select('decision_timer_seconds')
                    .eq('game_type', 'holm')
                    .maybeSingle();

                  const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 30;
                  const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                  console.log('[ENFORCE-CLIENT] Setting new deadline for next player:', {
                    nextPosition: nextPlayer.position,
                    timerSeconds,
                    newDeadline,
                    oldDeadline: currentRound.decision_deadline,
                  });

                  const { data: turnAdvanceResult } = await supabase
                    .from('rounds')
                    .update({
                      current_turn_position: nextPlayer.position,
                      decision_deadline: newDeadline,
                    })
                    .eq('id', currentRound.id)
                    .eq('decision_deadline', currentRound.decision_deadline)
                    .select();

                  if (!turnAdvanceResult || turnAdvanceResult.length === 0) {
                    console.log('[ENFORCE-CLIENT] Turn advance skipped - deadline was already updated by another client');

                    const { data: latestRound, error: latestRoundError } = await supabase
                      .from('rounds')
                      .select('id, status, round_number, current_turn_position, decision_deadline')
                      .eq('id', currentRound.id)
                      .maybeSingle();

                    if (latestRoundError) {
                      console.warn('[ENFORCE-CLIENT] Failed to re-fetch round after optimistic lock miss:', latestRoundError);
                    }

                    const latestDeadline = (latestRound as any)?.decision_deadline as string | null | undefined;
                    const freshNowIso = new Date().toISOString();
                    const isStillOverdue = !latestDeadline || latestDeadline < freshNowIso;

                    if ((latestRound as any)?.status === 'betting' && isStillOverdue) {
                      const healedDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                      const { data: healRes } = await supabase
                        .from('rounds')
                        .update({ decision_deadline: healedDeadline })
                        .eq('id', currentRound.id)
                        .eq('decision_deadline', latestDeadline ?? null)
                        .select();

                      if (healRes && healRes.length > 0) {
                        actionsTaken.push(`Healed overdue deadline for position ${(latestRound as any)?.current_turn_position ?? nextPlayer.position}`);
                      } else {
                        actionsTaken.push('Skipped - another client advanced turn (deadline already changed)');
                      }
                    } else {
                      actionsTaken.push('Skipped - another client advanced turn');
                    }

                    return new Response(JSON.stringify({
                      success: true,
                      actionsTaken,
                      gameStatus: game.status,
                      timestamp: nowIso,
                      source,
                      requestId,
                    }), {
                      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                  }

                  actionsTaken.push(`Turn advanced to position ${nextPlayer.position}`);
                } else {
                  // All players decided - set all_decisions_in flag
                  const { data: lockResult } = await supabase
                    .from('games')
                    .update({ all_decisions_in: true })
                    .eq('id', gameId)
                    .eq('all_decisions_in', false)
                    .select();

                  if (lockResult && lockResult.length > 0) {
                    actionsTaken.push('All players decided - flagged for showdown');
                  }
                }
              }
            }
          }
        }
      }

      // ============= 3B. DICE GAME (HORSES/SCC) TURN TIMEOUTS =============
      if (game.game_type === 'horses' || game.game_type === 'ship-captain-crew') {
        // Get the current round
        const { data: currentRound } = await supabase
          .from('rounds')
          .select('*')
          .eq('game_id', gameId)
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (currentRound) {
          const horsesState = currentRound.horses_state as any;
          
          // Check if there's a turn deadline that has expired
          if (horsesState?.turnDeadline && horsesState?.gamePhase === 'playing') {
            const turnDeadline = new Date(horsesState.turnDeadline);
            const msOverdue = now.getTime() - turnDeadline.getTime();
            
            // GRACE PERIOD: Skip enforcement if deadline just barely expired (within 3 seconds)
            // This prevents race conditions where a turn advances and the next player 
            // immediately times out due to clock skew or stale deadline data.
            if (msOverdue > 3000) {
              console.log('[ENFORCE-CLIENT] 🎲 DICE GAME turn deadline expired', {
                gameId,
                gameType: game.game_type,
                currentPlayer: horsesState.currentTurnPlayerId,
                turnDeadline: horsesState.turnDeadline,
                msOverdue,
              });

              const currentPlayerId = horsesState.currentTurnPlayerId;
              const turnOrder = (horsesState.turnOrder || []) as string[];
              const playerStates = horsesState.playerStates || {};

              // Get player info
              const { data: players } = await supabase
                .from('players')
                .select('id, user_id, is_bot, sitting_out, auto_fold, position, profiles(username)')
                .eq('game_id', gameId);

              const currentPlayer = players?.find((p: any) => p.id === currentPlayerId);

              if (currentPlayer && !currentPlayer.sitting_out) {
                // Check if this player is already in auto_fold mode (being handled by a client)
                if (currentPlayer.auto_fold) {
                  // Player is in auto-roll mode - a client should be handling their turn.
                  // Check if their turn is REALLY stuck (deadline expired by more than 20 seconds)
                  // This catches cases where ALL clients disconnected mid-turn.
                  if (msOverdue > 20000) {
                    console.log('[ENFORCE-CLIENT] 🎲 DICE GAME: auto_fold player stuck, forcing completion', {
                      gameId,
                      currentPlayerId,
                      msOverdue,
                    });
                    
                    // Force-complete their turn with whatever dice they have
                    const currentPlayerState = playerStates[currentPlayerId] || {};
                    let finalDice = currentPlayerState.dice || [];
                    if (!finalDice.length || finalDice.every((d: any) => d.value === 0)) {
                      finalDice = Array(5).fill(null).map(() => ({
                        value: Math.floor(Math.random() * 6) + 1,
                        isHeld: true
                      }));
                    } else {
                      finalDice = finalDice.map((d: any) => ({ ...d, isHeld: true }));
                    }

                    // Simple hand evaluation (for Horses - works as fallback for SCC)
                    const diceValues = finalDice.map((d: any) => d.value);
                    const valueCounts: Record<number, number> = {};
                    diceValues.forEach((v: number) => {
                      valueCounts[v] = (valueCounts[v] || 0) + 1;
                    });
                    let bestOfAKind = 0;
                    let bestValue = 0;
                    for (const [val, count] of Object.entries(valueCounts)) {
                      const numVal = parseInt(val);
                      const numCount = count as number;
                      if (numCount > bestOfAKind || (numCount === bestOfAKind && numVal > bestValue)) {
                        bestOfAKind = numCount;
                        bestValue = numVal;
                      }
                    }
                    
                    // For SCC, check qualification
                    let result: any;
                    if (game.game_type === 'ship-captain-crew') {
                      const has6 = diceValues.includes(6);
                      const has5 = diceValues.includes(5);
                      const has4 = diceValues.includes(4);
                      const isQualified = has6 && has5 && has4;
                      if (isQualified) {
                        // Find cargo dice (not 6, 5, or 4)
                        const cargoValues = diceValues.filter((v: number) => v !== 6 && v !== 5 && v !== 4);
                        const cargoSum = cargoValues.reduce((a: number, b: number) => a + b, 0);
                        result = {
                          isQualified: true,
                          cargoSum,
                          rank: 100 + cargoSum,
                          description: `Cargo ${cargoSum}`,
                        };
                      } else {
                        result = {
                          isQualified: false,
                          cargoSum: 0,
                          rank: 0,
                          description: 'No Qualify',
                        };
                      }
                    } else {
                      result = {
                        ofAKindCount: bestOfAKind,
                        highValue: bestValue,
                        rank: bestOfAKind * 10 + bestValue,
                        description: `${bestOfAKind} ${bestValue}${bestOfAKind > 1 ? 's' : ''}`
                      };
                    }

                    const updatedPlayerState = {
                      ...currentPlayerState,
                      dice: finalDice,
                      rollsRemaining: 0,
                      isComplete: true,
                      result,
                      heldMaskBeforeComplete: finalDice.map((d: any) => d.isHeld),
                      heldCountBeforeComplete: finalDice.filter((d: any) => d.isHeld).length,
                    };

                    // Find next player
                    const currentIndex = turnOrder.indexOf(currentPlayerId);
                    let nextPlayerId: string | null = null;
                    let allComplete = true;
                    for (let i = 1; i <= turnOrder.length; i++) {
                      const checkIdx = (currentIndex + i) % turnOrder.length;
                      const checkId = turnOrder[checkIdx];
                      const checkState = checkId === currentPlayerId ? updatedPlayerState : playerStates[checkId];
                      if (!checkState?.isComplete) {
                        nextPlayerId = checkId;
                        allComplete = false;
                        break;
                      }
                    }

                    const newPlayerStates = { ...playerStates, [currentPlayerId]: updatedPlayerState };
                    let newHorsesState: any;
                    if (allComplete || !nextPlayerId) {
                      newHorsesState = {
                        ...horsesState,
                        playerStates: newPlayerStates,
                        currentTurnPlayerId: null,
                        turnDeadline: null,
                        gamePhase: 'complete',
                      };
                      actionsTaken.push(`Dice stuck recovery: ${(currentPlayer.profiles as any)?.username || 'Player'} force-completed, round complete`);
                    } else {
                      const nextPlayer = players?.find((p: any) => p.id === nextPlayerId);
                      const nextDeadline = nextPlayer?.is_bot ? null : new Date(Date.now() + 30000).toISOString();
                      newHorsesState = {
                        ...horsesState,
                        playerStates: newPlayerStates,
                        currentTurnPlayerId: nextPlayerId,
                        turnDeadline: nextDeadline,
                      };
                      actionsTaken.push(`Dice stuck recovery: ${(currentPlayer.profiles as any)?.username || 'Player'} force-completed, advancing`);
                    }

                    await supabase
                      .from('rounds')
                      .update({ 
                        horses_state: newHorsesState,
                        status: allComplete ? 'completed' : 'betting',
                      })
                      .eq('id', currentRound.id);
                  } else {
                    console.log('[ENFORCE-CLIENT] 🎲 DICE GAME: auto_fold player still within recovery window', {
                      gameId,
                      currentPlayerId,
                      msOverdue,
                    });
                  }
                } else {
                  // Player is NOT in auto_fold mode - set it now so clients can animate their turn
                  console.log('[ENFORCE-CLIENT] 🎲 DICE GAME: Setting auto_fold for timed out player', {
                    gameId,
                    currentPlayerId,
                    username: (currentPlayer.profiles as any)?.username,
                  });

                  // Set auto_fold on the player so client-side bot logic takes over
                  await supabase
                    .from('players')
                    .update({ auto_fold: true })
                    .eq('id', currentPlayerId);

                  // Extend the deadline to give client bot logic time to animate (15 seconds)
                  const extendedDeadline = new Date(Date.now() + 15000).toISOString();
                  await supabase
                    .from('rounds')
                    .update({ 
                      horses_state: {
                        ...horsesState,
                        turnDeadline: extendedDeadline,
                      }
                    })
                    .eq('id', currentRound.id);

                  actionsTaken.push(`Dice timeout: ${(currentPlayer.profiles as any)?.username || 'Player'} set to auto-roll mode`);
                }
              }
            } else if (msOverdue > 0) {
              // Deadline just expired but within grace period - skip this cycle
              console.log('[ENFORCE-CLIENT] 🎲 DICE GAME deadline within grace period, skipping', {
                gameId,
                msOverdue,
                currentPlayer: horsesState.currentTurnPlayerId,
              });
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      actionsTaken,
      gameStatus: game.status,
      timestamp: nowIso,
      source,
      requestId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ENFORCE-CLIENT] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
