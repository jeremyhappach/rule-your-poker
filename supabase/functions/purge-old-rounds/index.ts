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
    console.log('[PURGE] Starting old rounds purge...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();
    
    console.log('[PURGE] Cutoff date:', cutoffDate);
    
    // Step 1: Find the most recent round (by created_at) for each game
    // These are the "final" rounds we want to keep
    const { data: allRounds, error: fetchError } = await supabase
      .from('rounds')
      .select('id, game_id, created_at')
      .lt('created_at', cutoffDate)
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      console.error('[PURGE] Error fetching rounds:', fetchError);
      throw fetchError;
    }
    
    if (!allRounds || allRounds.length === 0) {
      console.log('[PURGE] No old rounds found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No old rounds to process',
          purgedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[PURGE] Found', allRounds.length, 'rounds older than 30 days');
    
    // Group rounds by game_id and find the most recent for each game
    const gameLatestRound = new Map<string, string>();
    for (const round of allRounds) {
      if (!gameLatestRound.has(round.game_id)) {
        // First one we see is the most recent (sorted desc)
        gameLatestRound.set(round.game_id, round.id);
      }
    }
    
    console.log('[PURGE] Found', gameLatestRound.size, 'unique games with old rounds');
    
    // Get IDs to keep (most recent per game)
    const idsToKeep = new Set(gameLatestRound.values());
    
    // Get IDs to purge (all except the most recent per game)
    const idsToPurge = allRounds
      .map(r => r.id)
      .filter(id => !idsToKeep.has(id));
    
    if (idsToPurge.length === 0) {
      console.log('[PURGE] No rounds to purge (all are final rounds)');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No non-final rounds to purge',
          purgedCount: 0,
          keptCount: idsToKeep.size
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[PURGE] Will purge', idsToPurge.length, 'rounds, keeping', idsToKeep.size, 'final rounds');
    
    // Delete player_cards for these rounds first (foreign key constraint)
    const { error: cardsDeleteError } = await supabase
      .from('player_cards')
      .delete()
      .in('round_id', idsToPurge);
    
    if (cardsDeleteError) {
      console.error('[PURGE] Error deleting player_cards:', cardsDeleteError);
      throw cardsDeleteError;
    }
    
    console.log('[PURGE] Deleted player_cards for', idsToPurge.length, 'rounds');
    
    // Delete player_actions for these rounds
    const { error: actionsDeleteError } = await supabase
      .from('player_actions')
      .delete()
      .in('round_id', idsToPurge);
    
    if (actionsDeleteError) {
      console.error('[PURGE] Error deleting player_actions:', actionsDeleteError);
      throw actionsDeleteError;
    }
    
    console.log('[PURGE] Deleted player_actions for', idsToPurge.length, 'rounds');
    
    // Delete the rounds
    const { error: roundsDeleteError } = await supabase
      .from('rounds')
      .delete()
      .in('id', idsToPurge);
    
    if (roundsDeleteError) {
      console.error('[PURGE] Error deleting rounds:', roundsDeleteError);
      throw roundsDeleteError;
    }
    
    console.log('[PURGE] Successfully purged', idsToPurge.length, 'old non-final rounds');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Purged ${idsToPurge.length} old rounds, kept ${idsToKeep.size} final rounds`,
        purgedCount: idsToPurge.length,
        keptCount: idsToKeep.size,
        cutoffDate: cutoffDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PURGE] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
