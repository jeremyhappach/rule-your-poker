// Cribbage round orchestration - database integration layer

import { supabase } from '@/integrations/supabase/client';
import { initializeCribbageGame, startNewHand } from './cribbageGameLogic';
import { ensureHarnessCacheLoaded } from './debugHarness/runtimeCache';
import { snapshotPlayerChips } from './gameLogic';
import { getBotAlias } from './botAlias';
import type { CribbageState } from './cribbageTypes';
import { logCribbageHandStart, logCribbageDealerGameStart } from './cribbageSyncDiagnostics';

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
): Promise<{ success: boolean; roundId?: string; handNumber?: number; error?: string }> {
  console.log('[CRIBBAGE] Starting cribbage round', { gameId, isFirstHand });

  try {
    // Ensure harness cache is hydrated so deterministic deal harnesses
    // (e.g. max_pegging_fan) are honored on the very first hand.
    await ensureHarnessCacheLoaded();

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

    // Eligible seated participants: anyone seated, not sitting out, and not
    // an observer / left. Cribbage has no per-hand 'folded' state of its own;
    // upstream bot-ownership + writer-scope fixes ensure no stale 'folded'
    // status leaks into a cribbage replay, so no normalization write is
    // needed here.
    const activePlayers = (game.players || []).filter(
      (p: any) => !p.sitting_out && p.status !== 'observer' && p.status !== 'left'
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

    // IMPORTANT: First hand should run the "choose first dealer" high-card animation
    // on the client *before* we deal cards / initialize cribbage_state.
    // So for isFirstHand, we intentionally leave cribbage_state null here.
    const shouldDeferInitializationToClient = isFirstHand;

    const cribbageState = shouldDeferInitializationToClient
      ? null
      : (() => {
          const s = initializeCribbageGame(playerIds, dealerPlayer.id, anteAmount, {
            pointsToWin: game.points_to_win ?? 121,
            skunkEnabled: game.skunk_enabled ?? true,
            skunkThreshold: game.skunk_threshold ?? 91,
            doubleSkunkEnabled: game.double_skunk_enabled ?? true,
            doubleSkunkThreshold: game.double_skunk_threshold ?? 61,
          });
          // Override pot to 0 - cribbage uses direct transfers, not pot
          s.pot = 0;
          return s;
        })();

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

    // Create round record (cribbage_state may be null for first hand)
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1, // Cribbage uses single round per hand
        hand_number: handNumber,
        cards_dealt: cribbageState ? 6 : 0,
        pot: cribbageState ? cribbageState.pot : 0,
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
        pot: cribbageState ? cribbageState.pot : 0,
        is_first_hand: isFirstHand,
      })
      .eq('id', gameId);

    if (handNumber === 1) {
      logCribbageDealerGameStart(gameId, handNumber, dealerGameId, round.id);
    }
    logCribbageHandStart(gameId, handNumber, dealerPlayer.id, round.id);

    // Store player cards in player_cards table for each player (only after we actually deal)
    if (cribbageState) {
      for (const playerId of playerIds) {
        const playerState = cribbageState.playerStates[playerId];
        if (playerState) {
          try {
            // Use upsert with the unique constraint on (player_id, round_id)
            const { error } = await supabase
              .from('player_cards')
              .upsert(
                {
                  player_id: playerId,
                  round_id: round.id,
                  cards: playerState.hand as any,
                },
                {
                  onConflict: 'player_id,round_id',
                }
              );
            if (error) {
              console.warn('[CRIBBAGE] Failed to store player cards:', playerId, error.message);
            }
          } catch (err) {
            console.warn('[CRIBBAGE] Error storing player cards:', playerId, err);
          }
        }
      }
    }

    console.log('[CRIBBAGE] Round started successfully', {
      roundId: round.id,
      handNumber,
      playerCount: playerIds.length,
      phase: cribbageState ? cribbageState.phase : 'dealer_selection',
    });

    return { success: true, roundId: round.id, handNumber };

  } catch (error: any) {
    console.error('[CRIBBAGE] Error starting round:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Start a new cribbage hand after counting phase completes.
 *
 * Server-authoritative: successor-round creation runs inside the
 * `cribbage_create_next_hand` RPC, which locks the predecessor row,
 * dedupes concurrent callers via the `predecessor_round_id` unique
 * index, inserts the new round + player_cards, and advances
 * games.total_hands atomically. The client no longer computes hand_number
 * or writes the round row directly.
 */
export async function startNextCribbageHand(
  gameId: string,
  dealerGameId: string,
  previousState: CribbageState,
  playerIds: string[],
  predecessorRoundId: string | null
): Promise<{ success: boolean; roundId?: string; handNumber?: number; newState?: CribbageState; error?: string; alreadyStarted?: boolean }> {
  console.log('[CRIBBAGE] Starting next hand', { gameId, dealerGameId, predecessorRoundId });

  try {
    // Ensure harness cache hydrated before deterministic deals on subsequent hands.
    await ensureHarnessCacheLoaded();

    // Calculate the new state with rotated dealer and preserved scores
    const newState = startNewHand(previousState, playerIds);

    // Safety check: winner detected without needing a new hand.
    if (newState.phase === 'complete' && newState.winnerPlayerId) {
      console.log('[CRIBBAGE] startNextCribbageHand detected winner from startNewHand', {
        winnerId: newState.winnerPlayerId,
      });
      return {
        success: true,
        newState,
        error: 'Winner detected - no new hand needed',
      };
    }

    if (!predecessorRoundId) {
      throw new Error('startNextCribbageHand requires predecessorRoundId (server dedupe key)');
    }

    const playerCardsPayload = playerIds
      .map((pid) => {
        const ps = newState.playerStates[pid];
        return ps ? { player_id: pid, cards: ps.hand } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const { data, error } = await supabase.rpc('cribbage_create_next_hand' as any, {
      _predecessor_round_id: predecessorRoundId,
      _cribbage_state: newState as any,
      _player_cards: playerCardsPayload as any,
    });

    if (error) {
      throw new Error(`cribbage_create_next_hand RPC failed: ${error.message}`);
    }

    const result = (data ?? {}) as { round_id?: string; hand_number?: number; deduped?: boolean };
    if (!result.round_id) {
      throw new Error('cribbage_create_next_hand returned no round_id');
    }

    if (result.deduped) {
      console.log('[CRIBBAGE] Next hand already existed (server dedupe)', {
        roundId: result.round_id,
        handNumber: result.hand_number,
        predecessorRoundId,
      });
      return {
        success: true,
        alreadyStarted: true,
        roundId: result.round_id,
        handNumber: result.hand_number,
      };
    }

    console.log('[CRIBBAGE] Next hand started successfully', {
      roundId: result.round_id,
      handNumber: result.hand_number,
      newDealerId: newState.dealerPlayerId,
    });

    return {
      success: true,
      roundId: result.round_id,
      handNumber: result.hand_number,
      newState,
    };
  } catch (error: any) {
    console.error('[CRIBBAGE] Error starting next hand:', error);
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
    if (!roundId || !gameId) {
      console.error('[CRIBBAGE] endCribbageGame called with missing roundId or gameId', { roundId, gameId });
      return false;
    }
    
    if (!cribbageState.winnerPlayerId) {
      throw new Error('No winner specified');
    }

    // Get all player IDs (losers are everyone except winner)
    const playerIds = Object.keys(cribbageState.playerStates);
    const loserIds = playerIds.filter(id => id !== cribbageState.winnerPlayerId);

    // Calculate payout based on ante and multiplier (skunk/double-skunk)
    const baseAmount = cribbageState.anteAmount;
    const multiplier = cribbageState.payoutMultiplier || 1;
    const amountPerLoser = baseAmount * multiplier;
    const totalWinnerGain = amountPerLoser * loserIds.length;

    console.log('[CRIBBAGE] Payout calculation:', {
      baseAmount,
      multiplier,
      amountPerLoser,
      loserCount: loserIds.length,
      totalWinnerGain,
    });

    // Idempotency guard:
    // Only ONE client should execute payouts + result insert. We "claim" processing by atomically
    // transitioning the round to completed (only if it wasn't already).
    // NOTE: Using .select() after .update() only returns rows that were actually modified.
    const { data: claimedRounds, error: claimError } = await supabase
      .from('rounds')
      .update({
        status: 'completed',
        cribbage_state: cribbageState as any,
      })
      .eq('id', roundId)
      .neq('status', 'completed')
      .select('hand_number, dealer_game_id');

    if (claimError) {
      console.error('[CRIBBAGE] Failed to claim end-of-game processing:', claimError);
      return false;
    }

    const claimedRound = claimedRounds && claimedRounds.length > 0 ? claimedRounds[0] : null;

    console.log('[CRIBBAGE] Claim result:', {
      claimedRound,
      rowsAffected: claimedRounds?.length ?? 0,
    });

    // If we didn't claim the round, check if it was already completed or verify status
    if (!claimedRound) {
      // Double-check: maybe another client already completed it
      const { data: existingRound } = await supabase
        .from('rounds')
        .select('status, hand_number, dealer_game_id')
        .eq('id', roundId)
        .single();

      if (existingRound?.status === 'completed') {
        console.log('[CRIBBAGE] endCribbageGame already processed by another client. Ensuring game is game_over.');
      } else {
        console.error('[CRIBBAGE] Failed to claim round - unexpected status:', existingRound?.status);
        // Still try to ensure game_over status is set
      }

      const { data: winner } = await supabase
        .from('players')
        .select('id, user_id, is_bot, created_at, profiles(username)')
        .eq('id', cribbageState.winnerPlayerId)
        .single();

      // Get all players to determine bot alias
      const { data: playersForAlias } = await supabase
        .from('players')
        .select('id, user_id, is_bot, created_at')
        .eq('game_id', gameId);

      const winnerDisplayName = winner?.is_bot && playersForAlias
        ? getBotAlias(playersForAlias, winner.user_id)
        : ((winner?.profiles as any)?.username || 'Player');

      const skunkType = multiplier === 3 ? 'Double-Skunk!' : multiplier === 2 ? 'Skunk!' : '';
      const resultDescription = `${winnerDisplayName} wins${skunkType ? ' ' + skunkType : ''} +$${totalWinnerGain}`;

      await supabase
        .from('games')
        .update({
          status: 'game_over',
          pot: 0,
          last_round_result: resultDescription,
          game_over_at: new Date().toISOString(),
        })
        .eq('id', gameId);

      return true;
    }

    const handNumber = claimedRound.hand_number ?? 1;
    const dealerGameId = claimedRound.dealer_game_id ?? null;

    // Build chip change tracking for game_results
    const chipChanges: Record<string, number> = {};

    console.log('[CRIBBAGE] Executing chip transfers:', {
      winner: cribbageState.winnerPlayerId,
      totalWinnerGain,
      losers: loserIds,
      amountPerLoser,
    });

    // Deduct from each loser (awaited for critical financial data)
    for (const loserId of loserIds) {
      chipChanges[loserId] = -amountPerLoser;
      const { error: deductError } = await supabase.rpc('increment_player_chips', {
        p_player_id: loserId,
        p_amount: -amountPerLoser,
      });
      if (deductError) {
        console.error('[CRIBBAGE] Failed to deduct from loser:', loserId, deductError);
      } else {
        console.log('[CRIBBAGE] Deducted from loser:', loserId, amountPerLoser);
      }
    }

    // Award to winner (awaited for critical financial data)
    chipChanges[cribbageState.winnerPlayerId] = totalWinnerGain;
    const { error: awardError } = await supabase.rpc('increment_player_chips', {
      p_player_id: cribbageState.winnerPlayerId,
      p_amount: totalWinnerGain,
    });
    if (awardError) {
      console.error('[CRIBBAGE] Failed to award winner:', awardError);
    } else {
      console.log('[CRIBBAGE] Awarded winner:', cribbageState.winnerPlayerId, totalWinnerGain);
    }

    // Get winner info for display - use bot alias if applicable
    const { data: winner } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at, profiles(username)')
      .eq('id', cribbageState.winnerPlayerId)
      .single();

    // Get all players to determine bot alias
    const { data: allPlayersForAlias } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at')
      .eq('game_id', gameId);

    const winnerUsername = winner?.is_bot && allPlayersForAlias
      ? getBotAlias(allPlayersForAlias, winner.user_id)
      : ((winner?.profiles as any)?.username || 'Player');

    const skunkType = multiplier === 3 ? 'Double-Skunk!' : multiplier === 2 ? 'Skunk!' : '';
    const resultDescription = `${winnerUsername} wins${skunkType ? ' ' + skunkType : ''} +$${totalWinnerGain}`;

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

    // Record in game_results with actual hand_number and chip changes
    const { error: resultError } = await supabase
      .from('game_results')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        hand_number: handNumber,
        pot_won: totalWinnerGain,
        winner_player_id: cribbageState.winnerPlayerId,
        winner_username: winnerUsername,
        winning_hand_description: resultDescription,
        is_chopped: false,
        player_chip_changes: chipChanges,
        game_type: 'cribbage',
      });
    
    if (resultError) {
      console.error('[CRIBBAGE] Failed to record game result:', resultError);
    } else {
      console.log('[CRIBBAGE] Game result recorded successfully');
    }

    // Fire-and-forget: Snapshot final player chip totals for accurate session results.
    // IMPORTANT: Snapshots should store the player's CURRENT chips balance (running session total),
    // not the per-hand delta. Using snapshotPlayerChips keeps this consistent across game types.
    void snapshotPlayerChips(gameId, handNumber).catch((err) => {
      console.error('[CRIBBAGE] Failed to snapshot player chips:', err);
    });

    console.log('[CRIBBAGE] Game ended successfully - chip transfers and records complete');
    return true;

  } catch (error) {
    console.error('[CRIBBAGE] Error ending game:', error);
    return false;
  }
}
