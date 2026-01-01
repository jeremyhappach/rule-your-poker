/**
 * Horses Round Logic
 * Handles creating and managing rounds for the Horses dice game
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Start a new Horses round
 * Creates a round record and sets the game to in_progress
 * Collects antes from all active players and sets the pot
 */
export async function startHorsesRound(gameId: string, isFirstHand: boolean = false): Promise<void> {
  console.log('[HORSES] 🎲 Starting round', { gameId, isFirstHand });

  // Get current game state including ante_amount
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot, ante_amount')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('[HORSES] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  // Get active players for ante collection
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, chips, sitting_out')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[HORSES] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  const activePlayers = (players || []).filter(p => !p.sitting_out);
  const anteAmount = game.ante_amount || 2;

  // Collect antes from active players using atomic decrement
  if (activePlayers.length > 0 && anteAmount > 0) {
    const playerIds = activePlayers.map(p => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount,
    });

    if (anteError) {
      console.error('[HORSES] ERROR collecting antes:', anteError);
    } else {
      console.log('[HORSES] Antes collected from', playerIds.length, 'players, amount:', anteAmount);
    }
  }

  // Calculate pot: previous pot (for re-ante/tie) + new antes
  const newAnteTotal = activePlayers.length * anteAmount;
  const potForRound = (isFirstHand ? 0 : (game.pot || 0)) + newAnteTotal;

  const newRoundNumber = isFirstHand ? 1 : (game.current_round || 0) + 1;
  const newHandNumber = (game.total_hands || 0) + 1;

  // Create the round record with the correct pot
  // NOTE: cards_dealt has a check constraint (2-7) - use 2 as minimum for non-card games
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: newRoundNumber,
      hand_number: newHandNumber,
      cards_dealt: 2, // Horses doesn't deal cards but constraint requires >= 2
      status: 'betting', // Use existing status; horses_state manages gamePhase
      pot: potForRound,
      // horses_state will be initialized by the controller
    })
    .select()
    .single();

  if (roundError || !roundData) {
    console.error('[HORSES] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  console.log('[HORSES] Round created:', roundData.id, 'pot:', potForRound);

  // Update game status to in_progress with the new pot
  const { error: updateError } = await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: newRoundNumber,
      total_hands: newHandNumber,
      pot: potForRound,
      all_decisions_in: false,
      awaiting_next_round: false,
      is_first_hand: isFirstHand,
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('[HORSES] Failed to update game:', updateError);
    throw new Error('Failed to update game status');
  }

  console.log('[HORSES] Game set to in_progress, pot:', potForRound);
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
