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
    
    // Find rounds older than 30 days that are NOT final rounds
    const { data: roundsToPurge, error: findError } = await supabase
      .from('rounds')
      .select('id, game_id, round_number, hand_number, is_final_round, created_at')
      .lt('created_at', cutoffDate)
      .eq('is_final_round', false);
    
    if (findError) {
      console.error('[PURGE] Error finding rounds to purge:', findError);
      throw findError;
    }
    
    if (!roundsToPurge || roundsToPurge.length === 0) {
      console.log('[PURGE] No rounds to purge');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No rounds to purge',
          purgedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[PURGE] Found', roundsToPurge.length, 'rounds to purge');
    
    const roundIds = roundsToPurge.map(r => r.id);
    
    // Delete player_cards for these rounds first (foreign key constraint)
    const { error: cardsDeleteError } = await supabase
      .from('player_cards')
      .delete()
      .in('round_id', roundIds);
    
    if (cardsDeleteError) {
      console.error('[PURGE] Error deleting player_cards:', cardsDeleteError);
      throw cardsDeleteError;
    }
    
    console.log('[PURGE] Deleted player_cards for', roundIds.length, 'rounds');
    
    // Delete player_actions for these rounds
    const { error: actionsDeleteError } = await supabase
      .from('player_actions')
      .delete()
      .in('round_id', roundIds);
    
    if (actionsDeleteError) {
      console.error('[PURGE] Error deleting player_actions:', actionsDeleteError);
      throw actionsDeleteError;
    }
    
    console.log('[PURGE] Deleted player_actions for', roundIds.length, 'rounds');
    
    // Delete the rounds
    const { error: roundsDeleteError } = await supabase
      .from('rounds')
      .delete()
      .in('id', roundIds);
    
    if (roundsDeleteError) {
      console.error('[PURGE] Error deleting rounds:', roundsDeleteError);
      throw roundsDeleteError;
    }
    
    console.log('[PURGE] Successfully purged', roundsToPurge.length, 'old non-final rounds');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Purged ${roundsToPurge.length} old rounds`,
        purgedCount: roundsToPurge.length,
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
