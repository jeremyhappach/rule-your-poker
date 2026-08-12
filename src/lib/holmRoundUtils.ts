/**
 * Holm Round Utilities
 * 
 * ARCHITECTURAL STANDARD: This module provides the ONLY correct way to fetch
 * the current/active round for Holm games. All other files must use these
 * helpers instead of constructing their own round queries.
 * 
 * Pattern: Filter by dealer_game_id, order by (hand_number DESC, round_number DESC)
 * NEVER use created_at or unscoped round_number queries.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ActiveRoundResult {
  round: any | null;
  error: string | null;
}

/**
 * Fetch the active round for a Holm game.
 * 
 * This is the ONLY correct way to get the current round. It:
 * 1. Scopes to the current dealer_game_id (prevents cross-game contamination)
 * 2. Orders by hand_number DESC, round_number DESC (correct ordering)
 * 3. Returns the single most recent round
 * 
 * @param gameId - The session/game ID
 * @param dealerGameId - The current_game_uuid from games table (optional but recommended)
 */
export async function getActiveHolmRound(
  gameId: string,
  dealerGameId?: string | null
): Promise<ActiveRoundResult> {
  try {
    let query = supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId);

    // CRITICAL: Scope to dealer_game_id when available
    if (dealerGameId) {
      query = query.eq('dealer_game_id', dealerGameId);
    }

    const { data: round, error } = await query
      // CRITICAL: NULLS LAST so null hand_number/round_number rows don't win DESC ordering.
      .order('hand_number', { ascending: false, nullsFirst: false })
      .order('round_number', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[HOLM ROUND UTILS] Error fetching active round:', error);
      return { round: null, error: error.message };
    }

    return { round, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[HOLM ROUND UTILS] Exception fetching active round:', message);
    return { round: null, error: message };
  }
}

/**
 * Fetch the active round along with fresh game state.
 * 
 * This combined fetch ensures we have consistent game + round data
 * without race conditions between separate queries.
 */
export async function getActiveHolmRoundWithGame(
  gameId: string
): Promise<{ game: any | null; round: any | null; error: string | null }> {
  try {
    // Fetch game first to get dealer_game_id
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return { game: null, round: null, error: gameError?.message || 'Game not found' };
    }

    const dealerGameId = (game as any).current_game_uuid as string | null | undefined;
    
    const { round, error: roundError } = await getActiveHolmRound(gameId, dealerGameId);

    return { game, round, error: roundError };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { game: null, round: null, error: message };
  }
}
