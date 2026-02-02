// Cribbage round orchestration - database integration layer

import { supabase } from '@/integrations/supabase/client';
import { initializeCribbageGame } from './cribbageGameLogic';
import type { CribbageState } from './cribbageTypes';

/**
 * Start a new Cribbage round/hand.
 * 
 * This creates a round record with cribbage_state initialized:
 * - Shuffles and deals cards to each player
 * - Sets up the discard phase
 * - Initializes peg scores and pot
 */
export async function startCribbageRound(
  gameId: string,
  isFirstHand: boolean = true
): Promise<{ success: boolean; roundId?: string; error?: string }> {
  console.log('[CRIBBAGE] Starting cribbage round', { gameId, isFirstHand });

  try {
    // Fetch game data
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*, players(*)')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      throw new Error(`Failed to fetch game: ${gameError?.message}`);
    }

    // Guard: Don't start a round if game is already over
    if (game.status === 'game_over' || game.status === 'session_ended') {
      console.log('[CRIBBAGE] Game already over, not starting round');
      return { success: false, error: 'Game already over' };
    }

    // Get active players (not sitting out)
    const activePlayers = (game.players || []).filter(
      (p: any) => !p.sitting_out && p.status === 'active'
    );

    if (activePlayers.length < 2) {
      throw new Error('Need at least 2 players to start cribbage');
    }

    if (activePlayers.length > 4) {
      throw new Error('Cribbage supports maximum 4 players');
    }

    // Determine dealer
    const dealerPosition = game.dealer_position || 1;
    const dealerPlayer = activePlayers.find((p: any) => p.position === dealerPosition) 
      || activePlayers[0];
    
    if (!dealerPlayer) {
      throw new Error('Could not determine dealer');
    }

    // Sort players by position for consistent turn order
    const sortedPlayers = [...activePlayers].sort((a: any, b: any) => a.position - b.position);
    const playerIds = sortedPlayers.map((p: any) => p.id);

    // Get ante amount (used only for payout calculation, not pot collection)
    const anteAmount = game.ante_amount || 1;

    // Initialize cribbage game state (pot will be 0 since no collection)
    const cribbageState = initializeCribbageGame(
      playerIds,
      dealerPlayer.id,
      anteAmount
    );
    
    // Override pot to 0 - cribbage uses direct transfers, not pot
    cribbageState.pot = 0;

    // Get current dealer_game_id
    const dealerGameId = game.current_game_uuid;
    if (!dealerGameId) {
      throw new Error('No dealer_game_id - cannot create round');
    }

    // Calculate hand number
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .limit(1);

    const handNumber = existingRounds && existingRounds.length > 0
      ? (existingRounds[0].hand_number || 0) + 1
      : 1;

    // Create round record with cribbage_state
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1, // Cribbage uses single round per hand
        hand_number: handNumber,
        cards_dealt: 6, // Max cards dealt (varies by player count but we track max)
        pot: cribbageState.pot,
        status: 'betting', // Using 'betting' for active play
        cribbage_state: cribbageState as any,
      })
      .select()
      .single();

    if (roundError || !round) {
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }

    // Update game status
    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: 1,
        total_hands: handNumber,
        pot: cribbageState.pot,
        is_first_hand: isFirstHand,
      })
      .eq('id', gameId);

    // Store player cards in player_cards table for each player
    for (const playerId of playerIds) {
      const playerState = cribbageState.playerStates[playerId];
      if (playerState) {
        await supabase
          .from('player_cards')
          .upsert({
            player_id: playerId,
            round_id: round.id,
            cards: playerState.hand as any,
          }, {
            onConflict: 'player_id,round_id',
          });
      }
    }

    console.log('[CRIBBAGE] Round started successfully', {
      roundId: round.id,
      handNumber,
      playerCount: playerIds.length,
      phase: cribbageState.phase,
    });

    return { success: true, roundId: round.id };

  } catch (error: any) {
    console.error('[CRIBBAGE] Error starting round:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update cribbage state in the database
 */
export async function updateCribbageState(
  roundId: string,
  newState: CribbageState
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('rounds')
      .update({
        cribbage_state: newState as any,
        pot: newState.pot,
      })
      .eq('id', roundId);

    if (error) {
      console.error('[CRIBBAGE] Failed to update state:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[CRIBBAGE] Error updating state:', error);
    return false;
  }
}

/**
 * End a cribbage game/hand and distribute winnings
 */
export async function endCribbageGame(
  gameId: string,
  roundId: string,
  cribbageState: CribbageState
): Promise<boolean> {
  console.log('[CRIBBAGE] Ending game', { 
    gameId, 
    roundId, 
    winner: cribbageState.winnerPlayerId,
    multiplier: cribbageState.payoutMultiplier,
    anteAmount: cribbageState.anteAmount,
  });

  try {
    if (!cribbageState.winnerPlayerId) {
      throw new Error('No winner specified');
    }

    // Fetch round to get hand_number and dealer_game_id
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('hand_number, dealer_game_id')
      .eq('id', roundId)
      .single();

    if (roundError) {
      console.error('[CRIBBAGE] Failed to fetch round:', roundError);
    }

    const handNumber = round?.hand_number ?? 1;
    const dealerGameId = round?.dealer_game_id ?? null;

    // Get all player IDs (losers are everyone except winner)
    const playerIds = Object.keys(cribbageState.playerStates);
    const loserIds = playerIds.filter(id => id !== cribbageState.winnerPlayerId);

    // Calculate payout based on ante and multiplier (skunk/double-skunk)
    const baseAmount = cribbageState.anteAmount;
    const multiplier = cribbageState.payoutMultiplier;
    const amountPerLoser = baseAmount * multiplier;
    const totalWinnerGain = amountPerLoser * loserIds.length;

    console.log('[CRIBBAGE] Direct chip transfers:', {
      baseAmount,
      multiplier,
      amountPerLoser,
      loserCount: loserIds.length,
      totalWinnerGain,
    });

    // Build chip change tracking for game_results
    const chipChanges: Record<string, number> = {};

    // Deduct from each loser (fire-and-forget)
    for (const loserId of loserIds) {
      chipChanges[loserId] = -amountPerLoser;
      supabase.rpc('increment_player_chips', {
        p_player_id: loserId,
        p_amount: -amountPerLoser,
      }).then(({ error }) => {
        if (error) console.error('[CRIBBAGE] Failed to deduct from loser:', loserId, error);
      });
    }

    // Award to winner (fire-and-forget)
    chipChanges[cribbageState.winnerPlayerId] = totalWinnerGain;
    supabase.rpc('increment_player_chips', {
      p_player_id: cribbageState.winnerPlayerId,
      p_amount: totalWinnerGain,
    }).then(({ error }) => {
      if (error) console.error('[CRIBBAGE] Failed to award winner:', error);
    });

    // Get winner username for display
    const { data: winner } = await supabase
      .from('players')
      .select('id, profiles(username)')
      .eq('id', cribbageState.winnerPlayerId)
      .single();

    const skunkType = multiplier === 3 ? 'Double-Skunk!' : multiplier === 2 ? 'Skunk!' : '';
    const resultDescription = `${(winner?.profiles as any)?.username || 'Player'} wins${skunkType ? ' ' + skunkType : ''} +$${totalWinnerGain}`;

    // Update game status
    await supabase
      .from('games')
      .update({
        status: 'game_over',
        pot: 0,
        last_round_result: resultDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    // Mark round as completed
    await supabase
      .from('rounds')
      .update({
        status: 'completed',
        cribbage_state: cribbageState as any,
      })
      .eq('id', roundId);

    // Record in game_results with actual hand_number and chip changes
    supabase
      .from('game_results')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        hand_number: handNumber,
        pot_won: totalWinnerGain, // Total won (not from pot, but for consistency)
        winner_player_id: cribbageState.winnerPlayerId,
        winner_username: (winner?.profiles as any)?.username,
        winning_hand_description: resultDescription,
        is_chopped: false,
        player_chip_changes: chipChanges,
        game_type: 'cribbage',
      })
      .then(({ error }) => {
        if (error) console.error('[CRIBBAGE] Failed to record game result:', error);
      });

    console.log('[CRIBBAGE] Game ended successfully - direct transfers complete');
    return true;

  } catch (error) {
    console.error('[CRIBBAGE] Error ending game:', error);
    return false;
  }
}
