import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Prefer service role key for bypassing RLS, fallback to anon key
    const keyToUse = serviceRoleKey || anonKey;

    console.log('[ENFORCE] Init', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
      hasAnonKey: !!anonKey,
      serviceRoleKeyLen: serviceRoleKey?.length || 0,
      anonKeyLen: anonKey?.length || 0,
    });

    // Early exit if env vars not ready (can happen during cold start)
    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[ENFORCE] Missing required env vars:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!keyToUse,
        keyLen: keyToUse?.length || 0,
      });
      return new Response(JSON.stringify({
        error: 'Backend configuration missing - env vars not available',
        retry: true,
      }), {
        status: 503, // Service Unavailable - tells client to retry
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    let body;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[ENFORCE] Failed to parse request body:', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { gameId } = body;
    
    console.log('[ENFORCE] Received gameId:', gameId, 'type:', typeof gameId);
    
    if (!gameId) {
      return new Response(JSON.stringify({ error: 'gameId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let actionsTaken: string[] = [];

    // Fetch game data
    console.log('[ENFORCE] Querying game:', gameId);
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    console.log('[ENFORCE] Game query result:', {
      found: !!game,
      error: gameError?.message || null,
      errorCode: (gameError as any)?.code || null,
      gameStatus: (game as any)?.status || null,
    });

    // Treat "game not found" as a SUCCESS response so clients don't surface 404s.
    const notFoundCode = (gameError as any)?.code;
    const notFoundMsg = String(gameError?.message ?? '').toLowerCase();
    const isNotFound = !game || notFoundCode === 'PGRST116' || notFoundMsg.includes('0 rows');

    if (isNotFound) {
      return new Response(JSON.stringify({
        success: true,
        gameMissing: true,
        retry: false,
        gameId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (gameError) {
      const msg = String(gameError.message ?? '');
      const lower = msg.toLowerCase();
      const isTransient =
        lower.includes('typeerror') ||
        lower.includes('econnreset') ||
        lower.includes('connection reset') ||
        lower.includes('sendrequest') ||
        lower.includes('client error') ||
        lower.includes('timeout') ||
        lower.includes('network');

      console.error('[ENFORCE] Game query failed:', { gameId, error: gameError, isTransient });

      return new Response(JSON.stringify({
        error: 'Temporary backend error',
        retry: true,
        gameId,
        dbError: gameError?.message || null,
        dbCode: (gameError as any)?.code || null,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip ALL deadline enforcement if game is paused
    // This is critical - deadlines freeze when paused, resume when unpaused
    if (game.is_paused) {
      console.log('[ENFORCE] Game is paused, skipping all deadline enforcement for game', gameId);
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

    // 1. ENFORCE CONFIG DEADLINE (dealer setup timeout)
    // CRITICAL: Only enforce if config_deadline is set AND has had at least 5 seconds to elapse
    // This prevents race conditions where the status changes before the deadline is properly set
    if ((game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
      const configDeadline = new Date(game.config_deadline);
      const deadlineAge = now.getTime() - new Date(game.updated_at).getTime();
      
      // Safety: Don't enforce if the game was just updated (< 3 seconds ago)
      // This prevents enforcing on stale deadline data during transitions
      if (deadlineAge < 3000) {
        console.log('[ENFORCE] Config deadline check skipped - game recently updated', { 
          gameId, 
          deadlineAge, 
          status: game.status 
        });
      } else if (now > configDeadline) {
        console.log('[ENFORCE] Config deadline expired for game', gameId, { 
          deadline: game.config_deadline, 
          now: nowIso, 
          deadlineAge 
        });
        
        // Find dealer player
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        const dealerPlayer = players?.find(p => p.position === game.dealer_position);

        if (dealerPlayer) {
          // Mark dealer as sitting out
          await supabase
            .from('players')
            .update({ sitting_out: true, waiting: false })
            .eq('id', dealerPlayer.id);

          // Respect allow_bot_dealers
          const { data: gameDefaults } = await supabase
            .from('game_defaults')
            .select('allow_bot_dealers')
            .eq('game_type', 'holm')
            .maybeSingle();

          const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

          // If no active humans remain, end/delete the session (based on game history)
          const remainingActiveHumans = (players ?? []).filter((p: any) =>
            !p.is_bot &&
            !p.sitting_out &&
            p.id !== dealerPlayer.id
          );

          if (remainingActiveHumans.length < 1) {
            // Re-fetch game to get latest total_hands (avoid stale data race condition)
            const { data: freshGame } = await supabase
              .from('games')
              .select('total_hands')
              .eq('id', gameId)
              .maybeSingle();
            
            const totalHands = (freshGame?.total_hands ?? 0) as number;
            
            // Also check game_results as backup - if any results exist, session has history
            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', gameId);
            
            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
            
            console.log('[ENFORCE] Config timeout session check:', { totalHands, resultsCount, hasHistory });

            if (!hasHistory) {
              // Delete empty session (FK-safe order)
              const { data: roundRows } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId);

              const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);

              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
              }

              await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
              await supabase.from('chat_messages').delete().eq('game_id', gameId);
              await supabase.from('rounds').delete().eq('game_id', gameId);
              await supabase.from('players').delete().eq('game_id', gameId);
              await supabase.from('games').delete().eq('id', gameId);

              actionsTaken.push('Config timeout: No active humans and no history, deleted empty session');
            } else {
              await supabase
                .from('games')
                .update({
                  status: 'game_over',
                  pending_session_end: true,
                  session_ended_at: nowIso,
                  config_deadline: null,
                  config_complete: false,
                })
                .eq('id', gameId);

              actionsTaken.push('Config timeout: No active humans, ended session (has history)');
            }

            return new Response(JSON.stringify({
              success: true,
              actionsTaken,
              gameStatus: 'deleted_or_game_over',
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Count remaining eligible dealers (non-sitting-out, excluding the timed-out dealer)
          const eligibleDealers = players?.filter((p: any) =>
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

            // Calculate new config deadline (30 seconds from now)
            const newConfigDeadline = new Date(Date.now() + 30000).toISOString();

            await supabase
              .from('games')
              .update({
                dealer_position: nextDealer.position,
                config_deadline: newConfigDeadline,
              })
              .eq('id', gameId);

            actionsTaken.push(`Config timeout: Dealer ${dealerPlayer.position} sat out, rotated to ${nextDealer.position}`);
          } else {
            // Not enough eligible dealers - return to waiting_for_players status
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

    // 2. ENFORCE ANTE DECISION DEADLINE
    if (game.status === 'ante_decision' && game.ante_decision_deadline) {
      const anteDeadline = new Date(game.ante_decision_deadline);
      if (now > anteDeadline) {
        console.log('[ENFORCE] Ante deadline expired for game', gameId);
        
        // Find all players
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Find undecided players (no ante_decision yet) and auto-sit them out
        const undecidedPlayers = players?.filter(p => !p.ante_decision && !p.sitting_out) || [];
        
        if (undecidedPlayers.length > 0) {
          const undecidedIds = undecidedPlayers.map(p => p.id);
          
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
        
        // Count how many players successfully anted up
        const antedUpPlayers = freshPlayers?.filter(p => p.ante_decision === 'ante_up' && !p.sitting_out) || [];
        
        console.log('[ENFORCE] After ante timeout: anted_up=', antedUpPlayers.length, 'total=', freshPlayers?.length);
        
        if (antedUpPlayers.length >= 2) {
          // Enough players to start - transition game to in_progress
          // The client will detect this and call startHolmRound
          await supabase
            .from('games')
            .update({
              ante_decision_deadline: null,
              // Don't change status here - let the client handle the transition
              // to avoid race conditions with startHolmRound
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Ante timeout: ${antedUpPlayers.length} players anted up, ready to start`);
        } else if (antedUpPlayers.length < 2) {
          // Not enough players - return to waiting_for_players
          // Check if dealer is still active (not sitting out)
          const currentDealer = freshPlayers?.find(p => p.position === game.dealer_position);
          const dealerIsActive = currentDealer && !currentDealer.sitting_out;
          
          if (!dealerIsActive) {
            // Dealer timed out - rotate to next eligible dealer
            const eligibleDealers = freshPlayers?.filter(p => 
              !p.is_bot && 
              !p.sitting_out
            ).sort((a, b) => a.position - b.position) || [];
            
            if (eligibleDealers.length >= 1) {
              // Find next dealer clockwise from current position
              const currentPos = game.dealer_position || 1;
              const higherPositions = eligibleDealers.filter(p => p.position > currentPos);
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
              
              actionsTaken.push(`Ante timeout: Dealer sat out, rotated to position ${nextDealer.position}, returning to waiting`);
            } else {
              // No eligible dealers at all
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
            // Dealer is still active but not enough players
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

    // 3. ENFORCE DECISION DEADLINE (stay/fold during gameplay)
    if (game.status === 'in_progress' || game.status === 'betting') {
      // Find the latest round
      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1);
      
      const currentRound = rounds?.[0];
      
      if (currentRound?.decision_deadline && currentRound.status === 'betting') {
        const decisionDeadline = new Date(currentRound.decision_deadline);
        if (now > decisionDeadline) {
          console.log('[ENFORCE] Decision deadline expired for game', gameId, 'round', currentRound.round_number);
          
          // Find current turn player (for Holm games)
          if (game.game_type === 'holm-game' && currentRound.current_turn_position) {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);
            
            const currentTurnPlayer = players?.find(p => p.position === currentRound.current_turn_position);
            
            if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
              // CRITICAL: Check decision_locked, not current_decision
              // Only process if the player hasn't already locked their decision
              if (currentTurnPlayer.is_bot) {
                // Bot decision - 50% stay, 50% fold (simple logic for server-side)
                const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                await supabase
                  .from('players')
                  .update({ current_decision: botDecision, decision_locked: true })
                  .eq('id', currentTurnPlayer.id);
                
                actionsTaken.push(`Bot timeout: Made decision '${botDecision}' for bot at position ${currentTurnPlayer.position}`);
              } else {
                // Human player - auto-fold AND set auto_fold flag for future hands
                await supabase
                  .from('players')
                  .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                  .eq('id', currentTurnPlayer.id);
                
                actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentTurnPlayer.position} and set auto_fold=true`);
              }
            }
            
            // CRITICAL: After decision, advance turn to next UNDECIDED player
            // Re-fetch players to get updated decisions
            const { data: freshPlayers } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);
            
            const freshActivePlayers = freshPlayers?.filter(p => p.status === 'active' && !p.sitting_out) || [];
            
            // CRITICAL FIX: In Holm games, check if ALL active players have LOCKED their decision
            // Not just whether they have a current_decision, because players whose turn hasn't come
            // will have null current_decision but should NOT be considered "decided"
            const undecidedActivePlayers = freshActivePlayers.filter(p => !p.decision_locked);
            const currentPos = currentRound.current_turn_position;
            
            console.log('[ENFORCE] Active players:', freshActivePlayers.map(p => ({ pos: p.position, locked: p.decision_locked, decision: p.current_decision })));
            console.log('[ENFORCE] Undecided players:', undecidedActivePlayers.map(p => p.position));
            
            if (undecidedActivePlayers.length === 0) {
              // All players decided - use ATOMIC guard to prevent race conditions
              // Only proceed if we successfully claim the lock (all_decisions_in was false)
              const { data: lockResult, error: lockError } = await supabase
                .from('games')
                .update({ all_decisions_in: true })
                .eq('id', gameId)
                .eq('all_decisions_in', false) // Atomic guard - only update if not already set
                .select();
              
              if (lockError || !lockResult || lockResult.length === 0) {
                actionsTaken.push('All players decided - but another process already claimed the lock, skipping');
              } else {
                // CRITICAL FIX: Also update round status to 'showdown' so client-side
                // processing can detect the state change. Without this, the round stays
                // in 'betting' status and the client never triggers endHolmRound.
                await supabase
                  .from('rounds')
                  .update({ status: 'showdown' })
                  .eq('id', currentRound.id)
                  .eq('status', 'betting'); // Only update if still in betting status
                
                actionsTaken.push('All players decided - all_decisions_in set to true, round status set to showdown (atomic lock acquired)');
              }
            } else {
              // CRITICAL FIX: Only advance to UNDECIDED players
              // Filter positions to only those who haven't locked their decision yet
              const undecidedPositions = undecidedActivePlayers.map(p => p.position).sort((a, b) => a - b);
              
              // Find next undecided position clockwise
              const higherUndecidedPositions = undecidedPositions.filter(p => p > currentPos);
              const nextPosition = higherUndecidedPositions.length > 0 
                ? Math.min(...higherUndecidedPositions) 
                : Math.min(...undecidedPositions);
              
              if (nextPosition !== currentPos) {
                // Advance turn to next undecided player
                const { data: gameDefaults } = await supabase
                  .from('game_defaults')
                  .select('decision_timer_seconds')
                  .eq('game_type', 'holm')
                  .maybeSingle();
                
                const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
                const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                
                await supabase
                  .from('rounds')
                  .update({ 
                    current_turn_position: nextPosition,
                    decision_deadline: newDeadline
                  })
                  .eq('id', currentRound.id);
                
                actionsTaken.push(`Advanced turn from position ${currentPos} to UNDECIDED position ${nextPosition}`);
              }
            }
          }
        }
      }
    }

    // 4. ENFORCE STUCK SHOWDOWN/PROCESSING ROUNDS (Holm game specific)
    // If a Holm round is stuck in 'showdown' or 'processing' status for too long,
    // the endHolmRound function likely failed mid-execution. Auto-recover by
    // setting awaiting_next_round and allowing progression.
    // CRITICAL: Only trigger if game.awaiting_next_round is FALSE and all_decisions_in is TRUE.
    // If awaiting_next_round is already set, the client is handling progression.
    // If all_decisions_in is false, players are still deciding - not stuck.
    if (game.status === 'in_progress' && game.game_type === 'holm-game' && 
        game.awaiting_next_round !== true && game.all_decisions_in === true) {
      const { data: stuckRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .in('status', ['showdown', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      const stuckRound = stuckRounds?.[0];
      if (stuckRound) {
        // Use game.updated_at as proxy for when we entered this state (more accurate than round.created_at)
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
        
        // Only recover if stuck for more than 45 seconds AND no awaiting_next_round flag
        // This gives ample time for normal client-side progression
        if (stuckDuration > 45000) {
          console.log('[ENFORCE] ⚠️ Holm round stuck in', stuckRound.status, 'for', Math.round(stuckDuration/1000), 'seconds (game unchanged) - auto-recovering');
          
          // Mark round as completed and trigger next round
          await supabase
            .from('rounds')
            .update({ status: 'completed' })
            .eq('id', stuckRound.id);
          
          // Set awaiting_next_round to trigger client-side progression
          // NEVER set last_round_result here - let the normal result from endHolmRound stand
          await supabase
            .from('games')
            .update({ 
              awaiting_next_round: true,
              all_decisions_in: true,
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Stuck round recovery: Marked ${stuckRound.status} round ${stuckRound.round_number} as completed, set awaiting_next_round`);
        }
      }
    }

    // 5. ENFORCE AWAITING_NEXT_ROUND TIMEOUT (stuck game watchdog)
    // If a game has been stuck in awaiting_next_round=true for too long (>10 seconds),
    // it means client-side proceedToNextRound never fired. Auto-proceed server-side.
    if (game.status === 'in_progress' && game.awaiting_next_round === true && game.next_round_number) {
      // Check how long the game has been in this state by looking at updated_at
      const gameUpdatedAt = new Date(game.updated_at);
      const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
      
      // If stuck for more than 10 seconds (giving client 4s + buffer)
      if (stuckDuration > 10000) {
        console.log('[ENFORCE] ⚠️ Game stuck in awaiting_next_round for', Math.round(stuckDuration/1000), 'seconds - auto-proceeding');
        
        // Clear result and reset awaiting flag atomically (same as client-side proceedToNextRound)
        const { data: updateResult, error: updateError } = await supabase
          .from('games')
          .update({ 
            awaiting_next_round: false,
            next_round_number: null,
            last_round_result: null,
            all_decisions_in: false, // Reset for next round
          })
          .eq('id', gameId)
          .eq('awaiting_next_round', true)  // Only update if still awaiting (atomic guard)
          .select();
        
        if (updateError || !updateResult || updateResult.length === 0) {
          console.log('[ENFORCE] awaiting_next_round already cleared by another process');
          actionsTaken.push('awaiting_next_round watchdog: Another process already handled it');
        } else {
          const nextRoundNum = game.next_round_number;
          console.log('[ENFORCE] Cleared awaiting state, now starting round', nextRoundNum);
          
          // Get fresh player data for starting the round
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);
          
          const isHolmGame = game.game_type === 'holm-game';
          
          if (isHolmGame) {
            // For Holm games: Let the client handle round start via realtime
            // We just cleared the awaiting flag - client will detect and start the round
            actionsTaken.push(`awaiting_next_round watchdog: Cleared awaiting state for Holm round ${nextRoundNum}`);
          } else {
            // For 3-5-7: Start the round directly server-side
            // This matches what client's proceedToNextRound -> startRound does
            
            // Get active players (anted up and not sitting out)
            const activePlayers = freshPlayers?.filter(p => 
              p.ante_decision === 'ante_up' && !p.sitting_out
            ) || [];
            
            if (activePlayers.length >= 2) {
              // Get game defaults for timer
              const { data: gameDefaults } = await supabase
                .from('game_defaults')
                .select('decision_timer_seconds')
                .eq('game_type', '3-5-7')
                .maybeSingle();
              
              const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
              const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
              
              // Create the round
              const cardsForRound = nextRoundNum === 1 ? 3 : nextRoundNum === 2 ? 5 : 7;

              // IMPORTANT: rounds has a unique constraint on (game_id, round_number).
              // Before inserting, delete any existing round with the same round_number.
              // Without this, the watchdog can error and the game will appear "frozen".
              const { data: existingRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();

              if (existingRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingRound.id);
                await supabase.from('rounds').delete().eq('id', existingRound.id);
              }

              const { error: roundInsertError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  cards_dealt: cardsForRound,
                  pot: game.pot || 0,
                  status: 'betting',
                  decision_deadline: decisionDeadline,
                });

              if (roundInsertError) {
                console.error('[ENFORCE] Failed to insert watchdog round:', {
                  gameId,
                  nextRoundNum,
                  error: roundInsertError,
                });
                actionsTaken.push(`awaiting_next_round watchdog: Failed to insert round ${nextRoundNum} (${roundInsertError.message})`);
              } else {
                // Update game current_round
                await supabase
                  .from('games')
                  .update({ current_round: nextRoundNum })
                  .eq('id', gameId);
              }
              
              // Reset player decisions for new round
              await supabase
                .from('players')
                .update({ current_decision: null, decision_locked: false })
                .eq('game_id', gameId)
                .eq('ante_decision', 'ante_up');
              
              // Deal cards (simplified - just create records, client will fetch)
              // Note: For a more complete implementation, we'd generate cards here
              // For now, let client-side logic handle card generation on next fetch
              
              actionsTaken.push(`awaiting_next_round watchdog: Started 3-5-7 round ${nextRoundNum} with ${activePlayers.length} players`);
            } else {
              actionsTaken.push('awaiting_next_round watchdog: Not enough players to start round');
            }
          }
        }
      } else {
        console.log('[ENFORCE] Game awaiting_next_round for', Math.round(stuckDuration/1000), 's (waiting for client, threshold: 10s)');
      }
    }

    // 6. ENFORCE GAME OVER COUNTDOWN (session ending after game)
    if (game.status === 'game_over' && game.game_over_at) {
      const gameOverAt = new Date(game.game_over_at);
      const gameOverDeadline = new Date(gameOverAt.getTime() + 8000); // 8 seconds countdown
      
      if (now > gameOverDeadline && !game.pending_session_end) {
        console.log('[ENFORCE] Game over countdown expired for game', gameId);
        // Don't automatically progress - let clients handle this via onComplete
        // This just logs that it should have progressed
        actionsTaken.push('Game over countdown expired - clients should have handled progression');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      actionsTaken,
      gameStatus: game.status,
      timestamp: nowIso,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ENFORCE DEADLINES] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});