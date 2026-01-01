/**
 * Ship Captain Crew Round Logic
 * Handles creating and managing rounds for the SCC dice game
 * Follows the same pattern as horsesRoundLogic.ts
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Start a new Ship Captain Crew round
 * Creates a round record and sets the game to in_progress
 * Collects antes from all active players and sets the pot
 */
export async function startSCCRound(gameId: string, isFirstHand: boolean = false): Promise<void> {
  console.log('[SCC] 🎲 Starting round', { gameId, isFirstHand });

  // Get current game state including ante_amount
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot, ante_amount, status')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('[SCC] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  // Get the next round number based on existing rounds
  const { data: latestRound, error: latestRoundError } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRoundError) {
    console.warn('[SCC] Failed to read latest round_number (continuing):', latestRoundError);
  }

  const latestRoundNumber = latestRound?.round_number ?? 0;

  // If we are starting the FIRST hand and the game is already in progress, this is a duplicate call.
  if (isFirstHand && game.status === 'in_progress') {
    console.log('[SCC] Game already in_progress (first hand), skipping duplicate startSCCRound');
    return;
  }

  const baseRoundNumber = (typeof game.current_round === 'number' ? game.current_round : latestRoundNumber) ?? 0;
  const newRoundNumber = baseRoundNumber + 1;
  const newHandNumber = (game.total_hands || 0) + 1;

  // GUARD: If the round already exists for this computed round number, assume a previous call partially failed.
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id, pot, hand_number')
    .eq('game_id', gameId)
    .eq('round_number', newRoundNumber)
    .maybeSingle();

  if (existingRound) {
    console.log('[SCC] Round already exists, just updating game status', {
      roundId: existingRound.id,
      roundNumber: newRoundNumber,
    });

    const existingHandNumber = (existingRound as any)?.hand_number as number | null;

    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: existingHandNumber ? Math.max(newHandNumber, existingHandNumber) : newHandNumber,
        pot: (existingRound as any)?.pot ?? game.pot ?? 0,
        all_decisions_in: false,
        awaiting_next_round: false,
        is_first_hand: isFirstHand,
      })
      .eq('id', gameId);

    return;
  }

  // Get active players for ante collection
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, chips, sitting_out')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[SCC] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  const activePlayers = (players || []).filter((p) => !p.sitting_out);
  const anteAmount = game.ante_amount || 2;

  // Calculate pot: previous pot (for re-ante/tie) + new antes
  const newAnteTotal = activePlayers.length * anteAmount;
  const potForRound = (isFirstHand ? 0 : (game.pot || 0)) + newAnteTotal;

  // STEP 1: Create the round record FIRST (before collecting antes)
  // NOTE: cards_dealt has a check constraint (2-7) - use 2 as minimum for non-card games
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: newRoundNumber,
      hand_number: newHandNumber,
      cards_dealt: 2, // SCC doesn't deal cards but constraint requires >= 2
      status: 'betting', // Use existing status; horses_state manages gamePhase
      pot: potForRound,
      // horses_state will be initialized by the controller (reusing same field)
    })
    .select()
    .single();

  if (roundError || !roundData) {
    console.error('[SCC] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  console.log('[SCC] Round created:', roundData.id, 'pot:', potForRound);

  // STEP 2: Update game status/pointers BEFORE collecting antes
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
    console.error('[SCC] Failed to update game:', updateError);
  }

  console.log('[SCC] Game set to in_progress, pot:', potForRound);

  // STEP 3: Collect antes AFTER round is created and game pointers are set
  if (activePlayers.length > 0 && anteAmount > 0) {
    const playerIds = activePlayers.map((p) => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount,
    });

    if (anteError) {
      console.error('[SCC] ERROR collecting antes:', anteError);
    } else {
      console.log('[SCC] Antes collected from', playerIds.length, 'players, amount:', anteAmount);
    }
  }
}

/**
 * End the current SCC round and prepare for the next hand
 */
export async function endSCCRound(
  gameId: string, 
  winnerId: string | null, 
  winnerDescription: string,
  isTie: boolean = false
): Promise<void> {
  console.log('[SCC] Ending round', { gameId, winnerId, winnerDescription, isTie });

  if (isTie) {
    // For ties, set awaiting_next_round which will trigger re-ante
    const { error } = await supabase
      .from('games')
      .update({
        awaiting_next_round: true,
        last_round_result: 'Roll Over',
      })
      .eq('id', gameId);

    if (error) {
      console.error('[SCC] Failed to set tie state:', error);
    }
  } else if (winnerId) {
    // Winner takes the pot
    const { error } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: winnerDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    if (error) {
      console.error('[SCC] Failed to set game over:', error);
    }
  }
}
