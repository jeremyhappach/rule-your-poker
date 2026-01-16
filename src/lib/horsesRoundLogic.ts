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
    .select('current_round, total_hands, pot, ante_amount, status, awaiting_next_round, dealer_position')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError || !game) {
    console.error('[HORSES] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  // IMPORTANT:
  // This app keeps historical rounds in the same session (gameId) when starting a "new game".
  // That means round_number=1 may already exist from a previous Horses game.
  // So we must choose the next round_number based on (game.current_round OR max(round_number)).
  const { data: latestRound, error: latestRoundError } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRoundError) {
    console.warn('[HORSES] Failed to read latest round_number (continuing):', latestRoundError);
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
      console.warn('[HORSES] Failed to claim first-hand start (continuing):', claimError);
    }

    if (!claim || claim.length === 0) {
      console.log('[HORSES] Another client claimed first-hand start, skipping');
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
      console.warn('[HORSES] Failed to claim rollover start (continuing):', claimError);
    }

    if (!claim || claim.length === 0) {
      console.log('[HORSES] Another client claimed rollover start (or no longer awaiting), skipping');
      return;
    }
  }
  // IMPORTANT: Because newRoundNumber is always "next" (never reuses old round #1), this will not resurrect old state.
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id, pot, hand_number')
    .eq('game_id', gameId)
    .eq('round_number', newRoundNumber)
    .maybeSingle();

  if (existingRound) {
    console.log('[HORSES] Round already exists, just updating game status', {
      roundId: existingRound.id,
      roundNumber: newRoundNumber,
    });

    const existingHandNumber = (existingRound as any)?.hand_number as number | null; // eslint-disable-line @typescript-eslint/no-explicit-any

    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: existingHandNumber ? Math.max(newHandNumber, existingHandNumber) : newHandNumber,
        pot: (existingRound as any)?.pot ?? game.pot ?? 0, // eslint-disable-line @typescript-eslint/no-explicit-any
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
    .select('id, user_id, position, is_bot, chips, sitting_out, sit_out_next_hand')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[HORSES] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  // For rollovers (not first hand), reactivate ALL sitting_out players for the tiebreaker
  // A rollover is a continuation of the SAME hand, so sit_out_next_hand should NOT apply
  // (it means "sit out the next GAME", not "sit out the rollover")
  // Also clear sitting_out for anyone who got marked sitting_out during the round
  if (!isFirstHand) {
    const playersToReactivate = (players || []).filter((p) => p.sitting_out);
    if (playersToReactivate.length > 0) {
      const reactivateIds = playersToReactivate.map((p) => p.id);
      console.log('[HORSES] Reactivating ALL sitting_out players for rollover:', reactivateIds);
      await supabase
        .from('players')
        .update({ sitting_out: false })
        .in('id', reactivateIds);
    }
  }

  // Re-fetch to get updated sitting_out status
  const { data: freshPlayers } = await supabase
    .from('players')
    .select('id, user_id, position, is_bot, chips, sitting_out')
    .eq('game_id', gameId);

  const activePlayers = (freshPlayers || []).filter((p) => !p.sitting_out);
  const anteAmount = game.ante_amount || 2;

  // Pre-initialize horses_state so dice games can start even if the client can't UPDATE rounds (RLS-safe).
  const sortedActive = [...activePlayers].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const dealerPos = (game as any)?.dealer_position as number | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dealerIdx = dealerPos ? sortedActive.findIndex((p) => p.position === dealerPos) : -1;
  const turnOrder = dealerIdx >= 0
    ? Array.from({ length: sortedActive.length }, (_, i) => sortedActive[(dealerIdx + i + 1) % sortedActive.length].id)
    : sortedActive.map((p) => p.id);

  const firstTurnPlayer = sortedActive.find((p) => p.id === turnOrder[0]) ?? null;
  const controllerUserId =
    turnOrder
      .map((id) => sortedActive.find((p) => p.id === id))
      .find((p) => p && !p.is_bot)?.user_id ?? null;

  const initialDice = [
    { value: 0, isHeld: false },
    { value: 0, isHeld: false },
    { value: 0, isHeld: false },
    { value: 0, isHeld: false },
    { value: 0, isHeld: false },
  ];

  const initialState: any = {
    currentTurnPlayerId: turnOrder[0] ?? null,
    playerStates: Object.fromEntries(
      turnOrder.map((pid) => [
        pid,
        { dice: initialDice, rollsRemaining: 3, isComplete: false },
      ]),
    ),
    gamePhase: 'playing',
    turnOrder,
    botControllerUserId: controllerUserId,
    turnDeadline: firstTurnPlayer?.is_bot
      ? null
      : new Date(Date.now() + 10_000).toISOString(),
  };

  // Calculate pot: previous pot (for re-ante/tie) + new antes
  const newAnteTotal = activePlayers.length * anteAmount;
  const potForRound = (isFirstHand ? 0 : (game.pot || 0)) + newAnteTotal;

  // STEP 1: Create the round record FIRST (before collecting antes)
  // This ensures we don't collect antes multiple times if round creation fails
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
      horses_state: initialState,
    })
    .select()
    .single();

  if (roundError || !roundData) {
    console.error('[HORSES] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  console.log('[HORSES] Round created:', roundData.id, 'pot:', potForRound);

  // STEP 2: Update game status/pointers BEFORE collecting antes
  // CRITICAL: Clear config_deadline and ante_decision_deadline so the enforce-deadlines cron
  // doesn't incorrectly process stale deadlines and mark players sitting_out mid-game.
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
      // Clear stale deadlines - dice games manage their own turn timers via horses_state.turnDeadline
      config_deadline: null,
      ante_decision_deadline: null,
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('[HORSES] Failed to update game:', updateError);
    // Don't throw here - we already created the round, just log the error
  }

  console.log('[HORSES] Game set to in_progress, pot:', potForRound);

  // STEP 3: Collect antes AFTER round is created and game pointers are set
  if (activePlayers.length > 0 && anteAmount > 0) {
    const playerIds = activePlayers.map((p) => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount,
    });

    if (anteError) {
      console.error('[HORSES] ERROR collecting antes:', anteError);
      // Don't throw - the game is already in_progress, we'll handle missing antes gracefully
    } else {
      console.log('[HORSES] Antes collected from', playerIds.length, 'players, amount:', anteAmount);
    }
  }
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
        last_round_result: 'One tie all tie - rollover',
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
