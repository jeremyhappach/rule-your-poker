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
  const cronRunId = crypto.randomUUID();
  console.log('[CRON-ENFORCE] Starting deadline enforcement scan', { cronRunId });

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
    // IMPORTANT: Include 'waiting', 'waiting_for_players' since games can get stuck there and need cleanup
    const activeStatuses = ['waiting', 'dealer_selection', 'configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over', 'waiting_for_players'];
    
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, status, is_paused, config_deadline, ante_decision_deadline, updated_at')
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
    // Calculate staleness threshold (2 hours in ms)
    const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
    
    for (const game of games || []) {
      // Quick check: does this game have any deadline that might be expired?
      const configDeadlineExpired = game.config_deadline && new Date(game.config_deadline) < now;
      const anteDeadlineExpired = game.ante_decision_deadline && new Date(game.ante_decision_deadline) < now;
      
      // ALWAYS invoke enforce-deadlines for games in configuring/game_selection with a config_deadline
      // This ensures the deadline is checked even if it hasn't technically expired yet (clock sync issues)
      const isConfigPhase = game.status === 'dealer_selection' || game.status === 'configuring' || game.status === 'game_selection';
      const hasConfigDeadline = !!game.config_deadline;
      
      // dealer_selection games without a config_deadline might be STALE and need cleanup
      // The enforce-deadlines function has logic to handle these (>60 seconds idle = cleanup)
      const isDealerSelectionStale = game.status === 'dealer_selection' && !game.config_deadline;
      
      // Check for stale "waiting" or "in_progress" games (>2 hours since last update)
      const gameUpdatedAt = game.updated_at ? new Date(game.updated_at) : null;
      const msSinceUpdate = gameUpdatedAt ? now.getTime() - gameUpdatedAt.getTime() : 0;
      const isStaleWaiting = game.status === 'waiting' && msSinceUpdate > STALE_THRESHOLD_MS;
      const isStaleInProgress = game.status === 'in_progress' && msSinceUpdate > STALE_THRESHOLD_MS;
      
      const mightNeedEnforcement = 
        configDeadlineExpired || 
        anteDeadlineExpired || 
        (isConfigPhase && hasConfigDeadline) || // Always check config phase games with deadlines
        isDealerSelectionStale || // Always check stale dealer_selection games
        isStaleWaiting || // Check stale waiting games for cleanup
        isStaleInProgress || // Check stale in_progress games for cleanup
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

        const invokeWithRetry = async () => {
          let lastResponse: any = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
             const response = await supabase.functions.invoke('enforce-deadlines', {
               body: { gameId: game.id, source: 'cron', requestId: cronRunId },
             });

            lastResponse = response;

            if (!response.error) return response;

            const msg = String(response.error?.message ?? '');
            const isTransient =
              msg.includes('502') ||
              msg.toLowerCase().includes('bad gateway') ||
              msg.includes('503') ||
              msg.toLowerCase().includes('service unavailable') ||
              msg.toLowerCase().includes('edge function returned a non-2xx') ||
              msg.toLowerCase().includes('timeout');

            if (!isTransient || attempt === 3) return response;

            const waitMs = 400 * attempt;
            console.log('[CRON-ENFORCE] Transient enforce-deadlines error; retrying', {
              gameId: game.id,
              attempt,
              waitMs,
              msg,
            });
            await new Promise((r) => setTimeout(r, waitMs));
          }

          return lastResponse;
        };

        const response = await invokeWithRetry();

        if (response.error) {
          console.error('[CRON-ENFORCE] Error enforcing deadlines for game', game.id, ':', response.error);
          results.push({ gameId: game.id, status: game.status, result: `error: ${response.error.message}` });
        } else {
          const actionsTaken = response.data?.actionsTaken || [];
          console.log('[CRON-ENFORCE] Enforcement result for game', game.id, ':', actionsTaken);
          results.push({
            gameId: game.id,
            status: game.status,
            result: actionsTaken.length > 0 ? actionsTaken.join('; ') : 'no_action_needed',
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
