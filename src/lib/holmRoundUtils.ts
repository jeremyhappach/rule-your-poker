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

/**
 * Update the active round by its ID (not by round_number).
 * 
 * CRITICAL: Always use round.id for updates, never construct
 * update queries using round_number or other non-unique fields.
 */
export async function updateRoundById(
  roundId: string,
  updates: Record<string, any>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('rounds')
      .update(updates)
      .eq('id', roundId);

    if (error) {
      console.error('[HOLM ROUND UTILS] Error updating round:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

/**
 * Atomic round status transition with guard.
 * 
 * Only updates if the current status matches expectedStatus.
 * Returns whether the transition succeeded (true = we won the race).
 */
export async function atomicRoundStatusTransition(
  roundId: string,
  expectedStatus: string,
  newStatus: string,
  additionalUpdates?: Record<string, any>
): Promise<{ claimed: boolean; error: string | null }> {
  try {
    const updates = { status: newStatus, ...additionalUpdates };
    
    const { data, error } = await supabase
      .from('rounds')
      .update(updates)
      .eq('id', roundId)
      .eq('status', expectedStatus)
      .select();

    if (error) {
      return { claimed: false, error: error.message };
    }

    // If no rows were updated, another client won the race
    const claimed = data && data.length > 0;
    return { claimed, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { claimed: false, error: message };
  }
}

/**
 * Complete a stuck showdown by revealing all community cards and marking complete.
 * 
 * Used for recovery when a showdown is stuck mid-reveal.
 */
export async function forceCompleteShowdown(
  roundId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('rounds')
      .update({
        community_cards_revealed: 4,
        status: 'completed',
        decision_deadline: null,
        current_turn_position: null
      })
      .eq('id', roundId);

    if (error) {
      return { success: false, error: error.message };
    }

    console.log('[HOLM ROUND UTILS] Force-completed showdown for round:', roundId);
    return { success: true, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
