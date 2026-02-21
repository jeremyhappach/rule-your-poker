// Gin Rummy round orchestration - database integration layer
// Follows the same patterns as cribbageRoundLogic.ts:
// - DB-First round creation with atomic guards
// - State persistence via gin_rummy_state JSONB column
// - Atomic claim for end-of-game processing

import { supabase } from '@/integrations/supabase/client';
import {
  createInitialGinRummyState,
  dealHand,
  getNextDealer,
  scoreHand,
} from './ginRummyGameLogic';
import { snapshotPlayerChips } from './gameLogic';
import { getBotAlias } from './botAlias';
import { describeKnockResult } from './ginRummyScoring';
import type { GinRummyState } from './ginRummyTypes';

/**
 * Start the first Gin Rummy round/hand.
 * Creates a round record with gin_rummy_state initialized.
 */
export async function startGinRummyRound(
  gameId: string
): Promise<{ success: boolean; roundId?: string; handNumber?: number; error?: string }> {
  console.log('[GIN-RUMMY] Starting gin rummy round', { gameId });

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

    if (game.status === 'game_over' || game.status === 'session_ended') {
      return { success: false, error: 'Game already over' };
    }

    // Get active players - gin rummy is strictly 2 players
    const activePlayers = (game.players || []).filter(
      (p: any) => !p.sitting_out && p.status === 'active'
    );

    if (activePlayers.length !== 2) {
      throw new Error('Gin Rummy requires exactly 2 players');
    }

    // Determine dealer and non-dealer
    const dealerPosition = game.dealer_position || 1;
    const sortedPlayers = [...activePlayers].sort((a: any, b: any) => a.position - b.position);
    const dealerPlayer = sortedPlayers.find((p: any) => p.position === dealerPosition)
      || sortedPlayers[0];
    const nonDealerPlayer = sortedPlayers.find((p: any) => p.id !== dealerPlayer.id)!;

    const anteAmount = game.ante_amount || 1;
    const pointsToWin = game.points_to_win ?? 100;

    // Initialize and deal
    let ginState = createInitialGinRummyState(
      dealerPlayer.id,
      nonDealerPlayer.id,
      anteAmount,
      pointsToWin
    );
    ginState = dealHand(ginState);

    const dealerGameId = game.current_game_uuid;
    if (!dealerGameId) {
      throw new Error('No dealer_game_id - cannot create round');
    }

    // Calculate hand number (DB-First)
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .limit(1);

    const handNumber = existingRounds && existingRounds.length > 0
      ? (existingRounds[0].hand_number || 0) + 1
      : 1;

    // Create round record
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1, // Gin rummy uses single round per hand (like cribbage)
        hand_number: handNumber,
        cards_dealt: 10,
        pot: 0,
        status: 'betting',
        gin_rummy_state: ginState as any,
      })
      .select()
      .single();

    if (roundError || !round) {
      // Atomic guard: unique constraint violation means another client already created it
      if (roundError?.code === '23505') {
        console.log('[GIN-RUMMY] Round already exists (atomic guard)');
        return { success: true };
      }
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }

    const insertedHandNumber = round.hand_number ?? handNumber;

    // Update game status with authoritative values from DB
    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: 1,
        total_hands: insertedHandNumber,
        pot: 0,
        is_first_hand: handNumber === 1,
      })
      .eq('id', gameId);

    // Store player cards for hand history
    for (const playerId of [dealerPlayer.id, nonDealerPlayer.id]) {
      const playerState = ginState.playerStates[playerId];
      if (playerState) {
        await supabase
          .from('player_cards')
          .upsert(
            {
              player_id: playerId,
              round_id: round.id,
              cards: playerState.hand as any,
            },
            { onConflict: 'player_id,round_id' }
          )
          .then(({ error }) => {
            if (error) console.warn('[GIN-RUMMY] Failed to store player cards:', playerId, error.message);
          });
      }
    }

    console.log('[GIN-RUMMY] Round started', { roundId: round.id, handNumber: insertedHandNumber });
    return { success: true, roundId: round.id, handNumber: insertedHandNumber };

  } catch (error: any) {
    console.error('[GIN-RUMMY] Error starting round:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Start the next Gin Rummy hand (after a hand completes).
 * Rotates dealer, preserves match scores, creates new round record.
 */
export async function startNextGinRummyHand(
  gameId: string,
  dealerGameId: string,
  previousState: GinRummyState
): Promise<{
  success: boolean;
  roundId?: string;
  handNumber?: number;
  newState?: GinRummyState;
  error?: string;
  alreadyStarted?: boolean;
}> {
  console.log('[GIN-RUMMY] Starting next hand', { gameId, dealerGameId });

  try {
    // Check if match is over (someone hit pointsToWin)
    if (previousState.winnerPlayerId) {
      return { success: false, error: 'Match already won' };
    }

    // Rotate dealer
    const nextDealerId = getNextDealer(previousState);
    const nextNonDealerId = nextDealerId === previousState.dealerPlayerId
      ? previousState.nonDealerPlayerId
      : previousState.dealerPlayerId;

    // Create new hand state with preserved match scores
    let newState = createInitialGinRummyState(
      nextDealerId,
      nextNonDealerId,
      previousState.anteAmount,
      previousState.pointsToWin,
      previousState.matchScores
    );
    newState = dealHand(newState);

    // Get next hand number (DB-First)
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .limit(1);

    const handNumber = existingRounds && existingRounds.length > 0
      ? (existingRounds[0].hand_number || 0) + 1
      : 1;

    // Atomic insert (unique constraint guard)
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1,
        hand_number: handNumber,
        cards_dealt: 10,
        pot: 0,
        status: 'betting',
        gin_rummy_state: newState as any,
      })
      .select()
      .single();

    if (roundError) {
      if (roundError.code === '23505' || roundError.message?.includes('duplicate key')) {
        console.log('[GIN-RUMMY] Next hand already exists (atomic guard)');
        return { success: true, alreadyStarted: true };
      }
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }

    if (!round) throw new Error('No data returned from round insert');

    const insertedHandNumber = round.hand_number ?? handNumber;

    // Update game state
    await supabase
      .from('games')
      .update({
        total_hands: insertedHandNumber,
        is_first_hand: false,
      })
      .eq('id', gameId);

    // Store player cards
    for (const playerId of [nextDealerId, nextNonDealerId]) {
      const ps = newState.playerStates[playerId];
      if (ps) {
        supabase
          .from('player_cards')
          .upsert(
            { player_id: playerId, round_id: round.id, cards: ps.hand as any },
            { onConflict: 'player_id,round_id' }
          )
          .then(({ error }) => {
            if (error) console.warn('[GIN-RUMMY] Failed to store cards:', playerId, error.message);
          });
      }
    }

    console.log('[GIN-RUMMY] Next hand started', { roundId: round.id, handNumber: insertedHandNumber });
    return { success: true, roundId: round.id, handNumber: insertedHandNumber, newState };

  } catch (error: any) {
    console.error('[GIN-RUMMY] Error starting next hand:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update gin rummy state in the database (after each action).
 */
export async function updateGinRummyState(
  roundId: string,
  newState: GinRummyState
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('rounds')
      .update({ gin_rummy_state: newState as any })
      .eq('id', roundId);

    if (error) {
      console.error('[GIN-RUMMY] Failed to update state:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[GIN-RUMMY] Error updating state:', error);
    return false;
  }
}

/**
 * Fetch authoritative gin rummy state from DB (prevents stale closure issues).
 */
export async function fetchGinRummyState(
  roundId: string
): Promise<GinRummyState | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('gin_rummy_state')
    .eq('id', roundId)
    .single();

  if (error || !data?.gin_rummy_state) {
    console.error('[GIN-RUMMY] Failed to fetch state:', error);
    return null;
  }
  return data.gin_rummy_state as unknown as GinRummyState;
}

/**
 * End a Gin Rummy match and distribute winnings.
 * Uses atomic claim pattern (transition status to 'completed') to prevent double processing.
 */
export async function endGinRummyGame(
  gameId: string,
  roundId: string,
  ginState: GinRummyState
): Promise<boolean> {
  console.log('[GIN-RUMMY] Ending game', {
    gameId,
    roundId,
    winner: ginState.winnerPlayerId,
    matchScores: ginState.matchScores,
  });

  try {
    if (!ginState.winnerPlayerId) {
      throw new Error('No match winner specified');
    }

    const playerIds = Object.keys(ginState.playerStates);
    const loserId = playerIds.find(id => id !== ginState.winnerPlayerId)!;

    // Atomic claim: transition round to 'completed'
    const { data: claimedRounds, error: claimError } = await supabase
      .from('rounds')
      .update({
        status: 'completed',
        gin_rummy_state: ginState as any,
      })
      .eq('id', roundId)
      .neq('status', 'completed')
      .select('hand_number, dealer_game_id');

    if (claimError) {
      console.error('[GIN-RUMMY] Failed to claim end-of-game:', claimError);
      return false;
    }

    const claimedRound = claimedRounds && claimedRounds.length > 0 ? claimedRounds[0] : null;

    if (!claimedRound) {
      console.log('[GIN-RUMMY] Already processed by another client');
      await supabase
        .from('games')
        .update({
          status: 'game_over',
          pot: 0,
          game_over_at: new Date().toISOString(),
        })
        .eq('id', gameId);
      return true;
    }

    const handNumber = claimedRound.hand_number ?? 1;
    const dealerGameId = claimedRound.dealer_game_id ?? null;

    // Fetch dealer_game config for bonus/per-point settings
    const config = await fetchGinRummyConfig(dealerGameId);
    const perPointValue = config.per_point_value ?? 0;
    const anteAmount = ginState.anteAmount || 1;
    
    // Base match payout: the ante amount (chips transfer at match end, not per-hand)
    let payoutAmount = anteAmount;
    
    // Optional: per-point payout on top of ante (based on final score differential)
    if (perPointValue > 0) {
      const winnerScore = ginState.matchScores[ginState.winnerPlayerId] || 0;
      const loserScore = ginState.matchScores[loserId] || 0;
      payoutAmount += (winnerScore - loserScore) * perPointValue;
    }

    const chipChanges: Record<string, number> = {
      [ginState.winnerPlayerId]: payoutAmount,
      [loserId]: -payoutAmount,
    };

    // Execute chip transfer at match end (single transaction)
    const { error: deductError } = await supabase.rpc('increment_player_chips', {
      p_player_id: loserId,
      p_amount: -payoutAmount,
    });
    if (deductError) console.error('[GIN-RUMMY] Failed to deduct loser:', deductError);

    const { error: awardError } = await supabase.rpc('increment_player_chips', {
      p_player_id: ginState.winnerPlayerId,
      p_amount: payoutAmount,
    });
    if (awardError) console.error('[GIN-RUMMY] Failed to award winner:', awardError);

    // Get winner display name
    const { data: winner } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at, profiles(username)')
      .eq('id', ginState.winnerPlayerId)
      .single();

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at')
      .eq('game_id', gameId);

    const winnerUsername = winner?.is_bot && allPlayers
      ? getBotAlias(allPlayers, winner.user_id)
      : ((winner?.profiles as any)?.username || 'Player');

    const winnerScore = ginState.matchScores[ginState.winnerPlayerId] || 0;
    const loserScore = ginState.matchScores[loserId] || 0;
    const resultDescription = `${winnerUsername} wins ${winnerScore}-${loserScore} +$${payoutAmount}`;

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

    // Record in game_results — MUST be awaited so cleanup logic can detect history
    const { error: resultError } = await supabase
      .from('game_results')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        hand_number: handNumber,
        pot_won: payoutAmount,
        winner_player_id: ginState.winnerPlayerId,
        winner_username: winnerUsername,
        winning_hand_description: resultDescription,
        is_chopped: false,
        player_chip_changes: chipChanges,
        game_type: 'gin-rummy',
      });
    if (resultError) console.error('[GIN-RUMMY] Failed to record result:', resultError);

    // Snapshot chips — awaited to ensure history exists before player leaves
    await snapshotPlayerChips(gameId, handNumber).catch((err) => {
      console.error('[GIN-RUMMY] Failed to snapshot chips:', err);
    });

    console.log('[GIN-RUMMY] Game ended successfully, payout:', payoutAmount);
    return true;

  } catch (error) {
    console.error('[GIN-RUMMY] Error ending game:', error);
    return false;
  }
}

/**
 * Fetch gin rummy config from dealer_games record.
 */
async function fetchGinRummyConfig(
  dealerGameId: string | null
): Promise<{
  per_point_value: number;
  gin_bonus: number;
  undercut_bonus: number;
}> {
  const defaults = { per_point_value: 0, gin_bonus: 0, undercut_bonus: 0 };
  if (!dealerGameId) return defaults;

  const { data, error } = await supabase
    .from('dealer_games')
    .select('config')
    .eq('id', dealerGameId)
    .single();

  if (error || !data?.config) return defaults;
  const cfg = data.config as any;
  return {
    per_point_value: cfg.per_point_value ?? 0,
    gin_bonus: cfg.gin_bonus ?? 0,
    undercut_bonus: cfg.undercut_bonus ?? 0,
  };
}

/**
 * Record a per-hand result (for hand history) without ending the match.
 * Also handles per-hand chip transfers for gin/undercut bonuses.
 */
export async function recordGinRummyHandResult(
  gameId: string,
  dealerGameId: string,
  handNumber: number,
  ginState: GinRummyState
): Promise<void> {
  if (!ginState.knockResult) {
    console.log('[GIN-RUMMY] Void hand, no result to record');
    return;
  }

  const result = ginState.knockResult;
  const loserId = result.winnerId === result.knockerId ? result.opponentId : result.knockerId;

  // Fetch config for bonus calculations
  const config = await fetchGinRummyConfig(dealerGameId);
  const ante = ginState.anteAmount;
  
  // Per-hand: record the hand result for history only.
  // Chips only change hands when the match is won (someone reaches pointsToWin).
  // Bonus points (gin/undercut) are flat point values added to the scoring, not chip bonuses.
  let handPayout = ante; // What the winner would earn per hand (for record-keeping)

  // NO chip transfers here — chips only move at match end (endGinRummyGame).
  // This keeps the game zero-sum until the match winner is determined.

  const chipChanges: Record<string, number> = {
    [result.winnerId]: handPayout,
    [loserId]: -handPayout,
  };

  // Get winner username
  const { data: winner } = await supabase
    .from('players')
    .select('id, user_id, is_bot, created_at, profiles(username)')
    .eq('id', result.winnerId)
    .single();

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, user_id, is_bot, created_at')
    .eq('game_id', gameId);

  const winnerUsername = winner?.is_bot && allPlayers
    ? getBotAlias(allPlayers, winner.user_id)
    : ((winner?.profiles as any)?.username || 'Player');

  const description = describeKnockResult(result);

  // Await the insert so the record exists before any cleanup logic runs
  const { error: insertError } = await supabase
    .from('game_results')
    .insert({
      game_id: gameId,
      dealer_game_id: dealerGameId,
      hand_number: handNumber,
      pot_won: handPayout,
      winner_player_id: result.winnerId,
      winner_username: winnerUsername,
      winning_hand_description: `${winnerUsername}: ${description}`,
      is_chopped: false,
      player_chip_changes: chipChanges,
      game_type: 'gin-rummy',
    });
  if (insertError) console.error('[GIN-RUMMY] Failed to record hand result:', insertError);
  else console.log('[GIN-RUMMY] Hand result recorded:', { handNumber, description, handPayout });

  // Snapshot chips per-hand so mid-match quits have history
  void snapshotPlayerChips(gameId, handNumber).catch((err) => {
    console.error('[GIN-RUMMY] Failed to snapshot chips:', err);
  });
}
