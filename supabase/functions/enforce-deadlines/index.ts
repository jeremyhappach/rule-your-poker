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
    if (game.status === 'ante_decision' && game.ante_decision_deadline) {
      const anteDeadline = new Date(game.ante_decision_deadline);
      if (now > anteDeadline) {
        console.log('[ENFORCE-CLIENT] Ante deadline expired for game', gameId);
        
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Find undecided players and auto-sit them out
        const undecidedPlayers = players?.filter((p: any) => !p.ante_decision && !p.sitting_out) || [];
        
        if (undecidedPlayers.length > 0) {
          for (const player of undecidedPlayers) {
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

          const undecidedIds = undecidedPlayers.map((p: any) => p.id);
          
          await supabase
            .from('players')
            .update({
              ante_decision: 'sit_out',
              sitting_out: true,
              waiting: false,
            })
            .in('id', undecidedIds);
          
          actionsTaken.push(`Ante timeout: Auto-sat-out ${undecidedIds.length} undecided players`);
        }
        
        // Re-fetch players after updates
        const { data: freshPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        const antedUpPlayers = freshPlayers?.filter((p: any) => p.ante_decision === 'ante_up' && !p.sitting_out) || [];
        
        console.log('[ENFORCE-CLIENT] After ante timeout: anted_up=', antedUpPlayers.length);
        
        if (antedUpPlayers.length >= 2) {
          await supabase
            .from('games')
            .update({ ante_decision_deadline: null })
            .eq('id', gameId);
          
          actionsTaken.push(`Ante timeout: ${antedUpPlayers.length} players anted up, ready to start`);
        } else {
          // Not enough players
          const currentDealer = freshPlayers?.find((p: any) => p.position === game.dealer_position);
          const dealerIsActive = currentDealer && !currentDealer.sitting_out;
          
          if (!dealerIsActive) {
            const eligibleDealers = freshPlayers?.filter((p: any) => 
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

    // ============= 3. ENFORCE DECISION DEADLINE (stay/fold) =============
    if (game.status === 'in_progress' || game.status === 'betting') {
      // Only handle Holm turn-based decisions here
      // Dice games (SCC, Horses) and game progression handled by cron
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
                    // Another client already processed this player.
                    // IMPORTANT: Do NOT return early — we may still need to advance the turn
                    // if the other client only locked the player but didn't update the round.
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
                  // CRITICAL: Use current server time (Date.now()) plus full timer for the NEW deadline
                  // This ensures the next player gets a full timer from THIS moment
                  const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                  console.log('[ENFORCE-CLIENT] Setting new deadline for next player:', {
                    nextPosition: nextPlayer.position,
                    timerSeconds,
                    newDeadline,
                    oldDeadline: currentRound.decision_deadline,
                  });

                  // CRITICAL: Use optimistic locking - only update if the deadline matches what we saw
                  // This prevents race conditions where multiple clients both try to advance the turn
                  const { data: turnAdvanceResult } = await supabase
                    .from('rounds')
                    .update({
                      current_turn_position: nextPlayer.position,
                      decision_deadline: newDeadline,
                    })
                    .eq('id', currentRound.id)
                    .eq('decision_deadline', currentRound.decision_deadline) // Optimistic lock!
                    .select();

                  if (!turnAdvanceResult || turnAdvanceResult.length === 0) {
                    // Another caller likely updated the round between our SELECT and UPDATE.
                    // IMPORTANT: Do NOT assume the deadline is now valid — re-check and self-heal.
                    console.log('[ENFORCE-CLIENT] Turn advance skipped - deadline was already updated by another client');

                    const { data: latestRound, error: latestRoundError } = await supabase
                      .from('rounds')
                      .select('id, status, round_number, current_turn_position, decision_deadline')
                      .eq('id', currentRound.id)
                      .maybeSingle();

                    if (latestRoundError) {
                      console.warn('[ENFORCE-CLIENT] Failed to re-fetch round after optimistic lock miss:', latestRoundError);
                    }

                    // If the round is STILL overdue (or has a null deadline), push it forward so the next player
                    // does not get instantly auto-folded.
                    // CRITICAL: Use FRESH server time for this comparison, not the stale `nowIso` from request start.
                    // Otherwise a deadline set 500ms ago by another client would still appear "overdue".
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
                  // (Showdown/hand evaluation handled by cron for bot-only, by client for humans connected)
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
