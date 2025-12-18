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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

      if (currentRound?.status === 'betting') {
        const deadline = currentRound.decision_deadline ? new Date(currentRound.decision_deadline) : null;
        const deadlineExpired = deadline ? now > deadline : false;

        // Helper: find next undecided position clockwise
        const getNextUndecidedPosition = (
          activePlayers: any[],
          afterPosition: number
        ): number | null => {
          const undecidedPositions = activePlayers
            .filter(p => !p.decision_locked)
            .map(p => p.position)
            .sort((a: number, b: number) => a - b);

          if (undecidedPositions.length === 0) return null;

          const higher = undecidedPositions.filter((p: number) => p > afterPosition);
          return higher.length > 0 ? higher[0] : undecidedPositions[0];
        };

        const setAllDecisionsInAtomic = async () => {
          const { data: lockResult, error: lockError } = await supabase
            .from('games')
            .update({ all_decisions_in: true })
            .eq('id', gameId)
            .eq('all_decisions_in', false)
            .select();

          if (lockError || !lockResult || lockResult.length === 0) {
            actionsTaken.push('All players decided - but another process already claimed the lock, skipping');
          } else {
            actionsTaken.push('All players decided - all_decisions_in set to true (atomic lock acquired)');
          }
        };

        const advanceHolmTurn = async (
          roundId: string,
          fromPosition: number,
          activePlayers: any[]
        ) => {
          const nextUndecided = getNextUndecidedPosition(activePlayers, fromPosition);

          if (!nextUndecided) {
            await setAllDecisionsInAtomic();
            return;
          }

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
              current_turn_position: nextUndecided,
              decision_deadline: newDeadline,
            })
            .eq('id', roundId);

          actionsTaken.push(`Advanced turn from position ${fromPosition} to ${nextUndecided}`);
        };

        // HOLM (turn-based)
        // Simplified + reliable: bots decide ONLY on the server, immediately when it's their turn.
        // Clients simply render whatever is in the DB.
        if ((game.game_type === 'holm-game' || game.game_type === 'holm') && currentRound.current_turn_position) {
          const fetchActivePlayers = async () => {
            const { data } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            return (data ?? []).filter((p: any) => p.status === 'active' && !p.sitting_out);
          };

          const fetchRound = async (roundId: string) => {
            const { data } = await supabase
              .from('rounds')
              .select('id, status, round_number, current_turn_position, decision_deadline, community_cards_revealed')
              .eq('id', roundId)
              .single();
            return data;
          };

          let activePlayers = await fetchActivePlayers();
          let workingRound = currentRound;

          // Wait for community cards to be dealt before bots can decide (at least 2 should be revealed)
          const communityRevealed = workingRound.community_cards_revealed ?? 0;
          if (communityRevealed < 2) {
            actionsTaken.push(`Holm: waiting for community cards (${communityRevealed}/2 revealed)`);
            // Don't process bot turns yet - community cards not ready
          } else {

          // If multiple bots are back-to-back, resolve them all in a single invocation.
          for (let i = 0; i < 10; i++) {
            const currentPos = workingRound.current_turn_position;
            if (!currentPos) break;

            const currentTurnPlayer = activePlayers.find((p: any) => p.position === currentPos);
            if (!currentTurnPlayer || !currentTurnPlayer.is_bot) break;

            // If the bot already has a decision recorded but the turn didn't advance (race), advance now.
            if (currentTurnPlayer.decision_locked || currentTurnPlayer.current_decision) {
              if (!currentTurnPlayer.decision_locked) {
                await supabase
                  .from('players')
                  .update({ decision_locked: true })
                  .eq('id', currentTurnPlayer.id)
                  .or('decision_locked.is.null,decision_locked.eq.false');
              }

              await advanceHolmTurn(workingRound.id, currentPos, activePlayers);
              activePlayers = await fetchActivePlayers();
              const refreshed = await fetchRound(workingRound.id);
              if (refreshed) workingRound = refreshed as any;
              continue;
            }

            // Small delay before bot reveals decision for visual pacing
            await new Promise(resolve => setTimeout(resolve, 300));

            // Decide immediately (no waiting on the countdown).
            const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';

            const { data: updatedBot, error: botUpdateError } = await supabase
              .from('players')
              .update({ current_decision: botDecision, decision_locked: true })
              .eq('id', currentTurnPlayer.id)
              .is('current_decision', null)
              .or('decision_locked.is.null,decision_locked.eq.false')
              .select();

            if (botUpdateError) {
              console.error('[ENFORCE] Holm bot decision update error:', botUpdateError);
              break;
            }

            if (updatedBot && updatedBot.length > 0) {
              actionsTaken.push(`Holm bot turn: decided '${botDecision}' at position ${currentPos}`);
            }

            // Advance to next player (or lock all_decisions_in if complete)
            activePlayers = await fetchActivePlayers();
            await advanceHolmTurn(workingRound.id, currentPos, activePlayers);

            const refreshed = await fetchRound(workingRound.id);
            if (refreshed) workingRound = refreshed as any;
          }

          // Timeout enforcement for HUMAN turns
          const holmDeadline = workingRound.decision_deadline ? new Date(workingRound.decision_deadline) : null;
          const holmDeadlineExpired = holmDeadline ? now > holmDeadline : false;

          if (holmDeadlineExpired && workingRound.current_turn_position) {
            console.log('[ENFORCE] Decision deadline expired for game', gameId, 'round', workingRound.round_number);

            const currentPos = workingRound.current_turn_position;
            const currentTurnPlayer = activePlayers.find((p: any) => p.position === currentPos);

            if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
              if (currentTurnPlayer.is_bot) {
                // Should be rare because bots are handled above, but keep as a safety net.
                const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                await supabase
                  .from('players')
                  .update({ current_decision: botDecision, decision_locked: true })
                  .eq('id', currentTurnPlayer.id);

                actionsTaken.push(`Holm bot timeout fallback: decided '${botDecision}' at position ${currentPos}`);
              } else {
                await supabase
                  .from('players')
                  .update({ current_decision: 'fold', decision_locked: true })
                  .eq('id', currentTurnPlayer.id);

                actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentPos}`);
              }
            }

            activePlayers = await fetchActivePlayers();
            await advanceHolmTurn(workingRound.id, currentPos, activePlayers);
          }
          } // end of community cards ready check
        }

        // 3-5-7 (simultaneous)
        if ((game.game_type === '3-5-7-game' || game.game_type === '3-5-7') && deadlineExpired) {
          console.log('[ENFORCE] Decision deadline expired for game', gameId, 'round', currentRound.round_number);

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