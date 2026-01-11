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
    .select('current_round, total_hands, pot, ante_amount, status, awaiting_next_round')
    .eq('id', gameId)
    .maybeSingle();

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

  const baseRoundNumber = (typeof game.current_round === 'number' ? game.current_round : latestRoundNumber) ?? 0;
  const newRoundNumber = baseRoundNumber + 1;
  const newHandNumber = (game.total_hands || 0) + 1;

  // CRITICAL: Prevent multi-client race where multiple players start the first hand at the same time,
  // OR multiple clients try to start the next hand after a rollover.
  // We "claim" the right to start the new hand by atomically flipping pointers on the game row.
  // This also clears any stale game_over / last_round_result so the UI doesn't show the previous winner.
  if (isFirstHand) {
    const { data: claim, error: claimError } = await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: newHandNumber,
        awaiting_next_round: false,
        all_decisions_in: false,
        last_round_result: null,
        game_over_at: null,
        is_first_hand: true,
      })
      .eq('id', gameId)
      .neq('status', 'in_progress')
      .select('id');

    if (claimError) {
      console.warn('[SCC] Failed to claim first-hand start (continuing):', claimError);
    }

    if (!claim || claim.length === 0) {
      console.log('[SCC] Another client claimed first-hand start, skipping');
      return;
    }
  } else if (game.awaiting_next_round) {
    // Rollover / re-ante: multiple clients may see awaiting_next_round and try to start the next hand.
    let q = supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: newHandNumber,
        awaiting_next_round: false,
        all_decisions_in: false,
        last_round_result: null,
        game_over_at: null,
        is_first_hand: false,
      })
      .eq('id', gameId)
      .eq('awaiting_next_round', true);

    // Only one client should succeed: require the current_round we observed.
    if (typeof game.current_round === 'number') q = q.eq('current_round', game.current_round);
    else q = q.is('current_round', null);

    const { data: claim, error: claimError } = await q.select('id');

    if (claimError) {
      console.warn('[SCC] Failed to claim rollover start (continuing):', claimError);
    }

    if (!claim || claim.length === 0) {
      console.log('[SCC] Another client claimed rollover start (or no longer awaiting), skipping');
      return;
    }
  }
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
        last_round_result: null,
        game_over_at: null,
        is_first_hand: isFirstHand,
      })
      .eq('id', gameId);

    return;
  }

  // Get active players for ante collection
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, chips, sitting_out, sit_out_next_hand')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[SCC] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  // For rollovers (not first hand), reactivate ALL sitting_out players for the tiebreaker
  // A rollover is a continuation of the SAME hand, so sit_out_next_hand should NOT apply
  // (it means "sit out the next GAME", not "sit out the rollover")
  if (!isFirstHand) {
    const playersToReactivate = (players || []).filter((p) => p.sitting_out);
    if (playersToReactivate.length > 0) {
      const reactivateIds = playersToReactivate.map((p) => p.id);
      console.log('[SCC] Reactivating ALL sitting_out players for rollover:', reactivateIds);
      await supabase
        .from('players')
        .update({ sitting_out: false })
        .in('id', reactivateIds);
    }
  }

  // Re-fetch to get updated sitting_out status
  const { data: freshPlayers } = await supabase
    .from('players')
    .select('id, chips, sitting_out')
    .eq('game_id', gameId);

  const activePlayers = (freshPlayers || []).filter((p) => !p.sitting_out);
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
  // CRITICAL: Clear stale deadlines from config/ante phases so cron doesn't enforce them mid-game
  const { error: updateError } = await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: newRoundNumber,
      total_hands: newHandNumber,
      pot: potForRound,
      all_decisions_in: false,
      awaiting_next_round: false,
      last_round_result: null,
      game_over_at: null,
      is_first_hand: isFirstHand,
      config_deadline: null,
      ante_decision_deadline: null,
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
