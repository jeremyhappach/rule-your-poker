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

    // Skip if game is paused
    if (game.is_paused) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Game is paused, no deadlines enforced',
        actionsTaken: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. ENFORCE CONFIG DEADLINE (dealer setup timeout)
    if (game.status === 'config' && game.config_deadline) {
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
            // Not enough dealers - end session
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                session_ended_at: nowIso,
              })
              .eq('id', gameId);
            
            actionsTaken.push('Config timeout: No eligible dealers, session ended');
          }
        }
      }
    }

    // 2. ENFORCE ANTE DECISION DEADLINE
    if (game.status === 'ante_decision' && game.ante_decision_deadline) {
      const anteDeadline = new Date(game.ante_decision_deadline);
      if (now > anteDeadline) {
        console.log('[ENFORCE] Ante deadline expired for game', gameId);
        
        // Find all undecided players and auto-sit them out
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        const undecidedPlayers = players?.filter(p => !p.ante_decision) || [];
        
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
      }
    }

    // 3. ENFORCE DECISION DEADLINE (stay/fold during gameplay)
    if ((game.status === 'in_progress' || game.status === 'betting') && !game.is_paused) {
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
            
            if (currentTurnPlayer && !currentTurnPlayer.current_decision) {
              // Auto-fold the player
              await supabase
                .from('players')
                .update({ current_decision: 'fold', decision_locked: true })
                .eq('id', currentTurnPlayer.id);
              
              actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentTurnPlayer.position}`);
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
