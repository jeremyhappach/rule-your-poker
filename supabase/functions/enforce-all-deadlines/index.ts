import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * This edge function is designed to be called by a cron job.
 * It scans ALL active games and enforces deadlines for each one.
 * This ensures deadlines are enforced even when no clients are connected.
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[CRON-ENFORCE] Starting deadline enforcement scan');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    const keyToUse = serviceRoleKey || anonKey;

    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[CRON-ENFORCE] Missing required env vars');
      return new Response(JSON.stringify({ error: 'Backend configuration missing' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    // Find all games that might have expired deadlines
    // These are games in active states with deadlines that could be expired
    // IMPORTANT: Include 'waiting_for_players' since games can transition there and still need cleanup
    const activeStatuses = ['configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over', 'waiting_for_players'];
    
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, status, is_paused, config_deadline, ante_decision_deadline')
      .in('status', activeStatuses)
      .eq('is_paused', false); // Skip paused games

    if (gamesError) {
      console.error('[CRON-ENFORCE] Failed to fetch games:', gamesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch games' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[CRON-ENFORCE] Found', games?.length || 0, 'active games to check');

    const results: { gameId: string; status: string; result: string }[] = [];
    const now = new Date();

    // Process each game that might have an expired deadline
    for (const game of games || []) {
      // Quick check: does this game have any deadline that might be expired?
      const configDeadlineExpired = game.config_deadline && new Date(game.config_deadline) < now;
      const anteDeadlineExpired = game.ante_decision_deadline && new Date(game.ante_decision_deadline) < now;
      
      // ALWAYS invoke enforce-deadlines for games in configuring/game_selection with a config_deadline
      // This ensures the deadline is checked even if it hasn't technically expired yet (clock sync issues)
      const isConfigPhase = game.status === 'configuring' || game.status === 'game_selection';
      const hasConfigDeadline = !!game.config_deadline;
      
      const mightNeedEnforcement = 
        configDeadlineExpired || 
        anteDeadlineExpired || 
        (isConfigPhase && hasConfigDeadline) || // Always check config phase games with deadlines
        game.status === 'in_progress' || 
        game.status === 'betting' ||
        game.status === 'game_over';

      if (!mightNeedEnforcement) {
        results.push({ gameId: game.id, status: game.status, result: 'skipped_no_deadline' });
        continue;
      }
      
      console.log('[CRON-ENFORCE] Processing game:', game.id, {
        status: game.status,
        configDeadline: game.config_deadline,
        configDeadlineExpired,
        anteDeadlineExpired,
      });

      // Call the enforce-deadlines function for this game
      try {
        console.log('[CRON-ENFORCE] Invoking enforce-deadlines for game:', game.id);
        
        const response = await supabase.functions.invoke('enforce-deadlines', {
          body: { gameId: game.id },
        });

        if (response.error) {
          console.error('[CRON-ENFORCE] Error enforcing deadlines for game', game.id, ':', response.error);
          results.push({ gameId: game.id, status: game.status, result: `error: ${response.error.message}` });
        } else {
          const actionsTaken = response.data?.actionsTaken || [];
          console.log('[CRON-ENFORCE] Enforcement result for game', game.id, ':', actionsTaken);
          results.push({ 
            gameId: game.id, 
            status: game.status, 
            result: actionsTaken.length > 0 ? actionsTaken.join('; ') : 'no_action_needed' 
          });
        }
      } catch (err) {
        console.error('[CRON-ENFORCE] Exception enforcing deadlines for game', game.id, ':', err);
        results.push({ gameId: game.id, status: game.status, result: `exception: ${err}` });
      }
    }

    const duration = Date.now() - startTime;
    console.log('[CRON-ENFORCE] Completed in', duration, 'ms. Results:', results);

    return new Response(JSON.stringify({
      success: true,
      gamesProcessed: games?.length || 0,
      results,
      durationMs: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[CRON-ENFORCE] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
