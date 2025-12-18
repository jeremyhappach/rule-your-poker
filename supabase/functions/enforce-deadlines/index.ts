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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const keyToUse = serviceRoleKey || anonKey;

    console.log('[ENFORCE] Init', {
      hasUrl: !!supabaseUrl,
      serviceRoleKeyLen: serviceRoleKey.length,
      anonKeyLen: anonKey.length,
      hasAuthHeader: !!authHeader,
    });

    if (!supabaseUrl || !keyToUse) {
      return new Response(JSON.stringify({
        error: 'Backend configuration missing (SUPABASE_URL / key)',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      supabaseUrl,
      keyToUse,
      serviceRoleKey
        ? undefined
        : {
            global: {
              headers: authHeader ? { Authorization: authHeader } : {},
            },
          }
    );

    const { gameId } = await req.json();
    
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
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return new Response(JSON.stringify({ error: 'Game not found' }), {
        status: 404,
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
    if ((game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
      const configDeadline = new Date(game.config_deadline);
      if (now > configDeadline) {
        console.log('[ENFORCE] Config deadline expired for game', gameId);
        
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
          
          // Count remaining eligible dealers (non-sitting-out, non-bot humans)
          const eligibleDealers = players?.filter(p => 
            !p.is_bot && 
            !p.sitting_out && 
            p.id !== dealerPlayer.id
          ) || [];
          
          if (eligibleDealers.length >= 1) {
            // Rotate dealer to next eligible player
            const sortedEligible = eligibleDealers.sort((a, b) => a.position - b.position);
            const currentDealerIdx = sortedEligible.findIndex(p => p.position > game.dealer_position);
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
            // This preserves chip stacks and allows players to rejoin
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
                // Human player - auto-fold
                await supabase
                  .from('players')
                  .update({ current_decision: 'fold', decision_locked: true })
                  .eq('id', currentTurnPlayer.id);
                
                actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentTurnPlayer.position}`);
              }
            }
            
            // CRITICAL: After decision, advance turn to next player
            const activePlayers = players?.filter(p => p.status === 'active' && !p.sitting_out) || [];
            const positions = activePlayers.map(p => p.position).sort((a, b) => a - b);
            const currentPos = currentRound.current_turn_position;
            
            // Find next position clockwise
            const higherPositions = positions.filter(p => p > currentPos);
            const nextPosition = higherPositions.length > 0 
              ? Math.min(...higherPositions) 
              : Math.min(...positions);
            
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
                actionsTaken.push('All players decided - all_decisions_in set to true (atomic lock acquired)');
              }
            } else if (nextPosition !== currentPos) {
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
              
              actionsTaken.push(`Advanced turn from position ${currentPos} to ${nextPosition}`);
            }
          } else if (game.game_type === '3-5-7-game' || game.game_type === '3-5-7') {
            // 3-5-7: Auto-fold all undecided players
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);
            
            const undecidedPlayers = players?.filter(p => 
              !p.sitting_out && 
              !p.current_decision &&
              p.ante_decision === 'ante_up'
            ) || [];
            
            if (undecidedPlayers.length > 0) {
              const undecidedIds = undecidedPlayers.map(p => p.id);
              
              await supabase
                .from('players')
                .update({ current_decision: 'fold', decision_locked: true })
                .in('id', undecidedIds);
              
              actionsTaken.push(`Decision timeout: Auto-folded ${undecidedIds.length} undecided players in 3-5-7`);
            }
          }
        }
      }
    }

    // 4. ENFORCE GAME OVER COUNTDOWN (session ending after game)
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