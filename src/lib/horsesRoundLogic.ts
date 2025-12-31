/**
 * Horses Round Logic
 * Handles creating and managing rounds for the Horses dice game
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Start a new Horses round
 * Creates a round record and sets the game to in_progress
 */
export async function startHorsesRound(gameId: string, isFirstHand: boolean = false): Promise<void> {
  console.log('[HORSES] Starting round', { gameId, isFirstHand });

  // Get current game state
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('[HORSES] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  const newRoundNumber = isFirstHand ? 1 : (game.current_round || 0) + 1;
  const newHandNumber = (game.total_hands || 0) + 1;

  // Create the round record
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: newRoundNumber,
      hand_number: newHandNumber,
      cards_dealt: 0, // Horses doesn't deal cards
      status: 'betting', // Use existing status; HorsesGameTable manages gamePhase in horses_state
      pot: game.pot || 0,
      // horses_state will be initialized by HorsesGameTable component
    })
    .select()
    .single();

  if (roundError || !roundData) {
    console.error('[HORSES] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  console.log('[HORSES] Round created:', roundData.id);

  // Update game status to in_progress
  const { error: updateError } = await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: newRoundNumber,
      total_hands: newHandNumber,
      all_decisions_in: false,
      awaiting_next_round: false,
      is_first_hand: isFirstHand,
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('[HORSES] Failed to update game:', updateError);
    throw new Error('Failed to update game status');
  }

  console.log('[HORSES] Game set to in_progress');
}

/**
 * End the current Horses round and prepare for the next hand
 */
export async function endHorsesRound(
  gameId: string, 
  winnerId: string | null, 
  winnerDescription: string,
  isTie: boolean = false
): Promise<void> {
  console.log('[HORSES] Ending round', { gameId, winnerId, winnerDescription, isTie });

  if (isTie) {
    // For ties, set awaiting_next_round which will trigger re-ante
    const { error } = await supabase
      .from('games')
      .update({
        awaiting_next_round: true,
        last_round_result: 'Tie - everyone re-antes!',
      })
      .eq('id', gameId);

    if (error) {
      console.error('[HORSES] Failed to set tie state:', error);
    }
  } else if (winnerId) {
    // Winner takes the pot - handled by HorsesGameTable
    // Just update the game state
    const { error } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: winnerDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    if (error) {
      console.error('[HORSES] Failed to set game over:', error);
    }
  }
}
