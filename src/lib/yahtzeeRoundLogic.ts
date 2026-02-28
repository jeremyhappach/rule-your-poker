/**
 * Yahtzee Round Logic
 * Handles creating rounds and managing the session lifecycle for Yahtzee.
 * Follows the same patterns as horsesRoundLogic.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { recordGameResult } from "./gameLogic";
import { createInitialYahtzeeDice } from "./yahtzeeGameLogic";
import { createEmptyScorecard } from "./yahtzeeScoring";
import { YahtzeeState } from "./yahtzeeTypes";

export async function startYahtzeeRound(gameId: string, isFirstHand: boolean = false): Promise<void> {
  console.log('[YAHTZEE] 🎲 Starting round', { gameId, isFirstHand });

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot, ante_amount, status, awaiting_next_round, dealer_position, current_game_uuid, game_type, is_paused')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError || !game) {
    console.error('[YAHTZEE] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  // Guards (same as horses)
  if ((game as any).is_paused) {
    console.warn('[YAHTZEE] Blocked - game is paused');
    return;
  }
  if (game.status === 'session_ended') {
    console.warn('[YAHTZEE] Blocked - session ended');
    return;
  }
  if (!isFirstHand) {
    const canStart = game.awaiting_next_round === true || game.status === 'game_over';
    if (!canStart) {
      console.warn('[YAHTZEE] Blocked - not ready for next hand');
      return;
    }
  }

  const dealerGameId = game.current_game_uuid;
  let newHandNumber: number;
  let newRoundNumber: number;

  if (isFirstHand) {
    newHandNumber = 1;
    newRoundNumber = 1;
  } else {
    const { data: latestRound } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    newHandNumber = (latestRound?.hand_number ?? 0) + 1;
    newRoundNumber = newHandNumber;
  }

  // Atomic claim (same pattern as horses)
  if (isFirstHand) {
    const { data: claim } = await supabase
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

    if (!claim || claim.length === 0) {
      console.log('[YAHTZEE] Another client claimed first-hand start, skipping');
      return;
    }
  } else if (game.awaiting_next_round) {
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

    if (typeof game.current_round === 'number') q = q.eq('current_round', game.current_round);
    else q = q.is('current_round', null);

    const { data: claim } = await q.select('id');
    if (!claim || claim.length === 0) {
      console.log('[YAHTZEE] Another client claimed rollover, skipping');
      return;
    }
  }

  // Check for existing round
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('dealer_game_id', dealerGameId)
    .eq('hand_number', newHandNumber)
    .eq('round_number', newRoundNumber)
    .maybeSingle();

  if (existingRound) {
    console.log('[YAHTZEE] Round already exists:', existingRound.id);
    return;
  }

  // Get active players
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, position, is_bot, chips, sitting_out')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[YAHTZEE] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  const activePlayers = (players || []).filter(p => !p.sitting_out);
  const anteAmount = game.ante_amount || 1;

  // Build turn order: left of dealer
  const sortedActive = [...activePlayers].sort((a, b) => a.position - b.position);
  const dealerPos = (game as any)?.dealer_position as number | null;
  const dealerIdx = dealerPos ? sortedActive.findIndex(p => p.position === dealerPos) : -1;

  const turnOrder = dealerIdx >= 0
    ? Array.from({ length: sortedActive.length }, (_, i) => sortedActive[(dealerIdx + 1 + i) % sortedActive.length].id)
    : sortedActive.map(p => p.id);

  const controllerUserId =
    turnOrder
      .map(id => sortedActive.find(p => p.id === id))
      .find(p => p && !p.is_bot)?.user_id ?? null;

  const initialState: YahtzeeState = {
    currentTurnPlayerId: turnOrder[0] ?? null,
    playerStates: Object.fromEntries(
      turnOrder.map(pid => [
        pid,
        {
          dice: createInitialYahtzeeDice(),
          rollsRemaining: 3,
          isComplete: false,
          scorecard: createEmptyScorecard(),
        },
      ]),
    ),
    gamePhase: 'playing',
    turnOrder,
    currentRound: 1,
    botControllerUserId: controllerUserId,
  };

  const newAnteTotal = activePlayers.length * anteAmount;
  const potForRound = (isFirstHand ? 0 : (game.pot || 0)) + newAnteTotal;

  // Create round
  const { error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: newRoundNumber,
      hand_number: newHandNumber,
      cards_dealt: 2, // Constraint requires >= 2
      status: 'betting',
      pot: potForRound,
      yahtzee_state: initialState as any,
      dealer_game_id: dealerGameId || null,
    })
    .select()
    .single();

  if (roundError) {
    console.error('[YAHTZEE] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  // Update game pointers
  await supabase
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

  // Collect antes
  if (activePlayers.length > 0 && anteAmount > 0) {
    const playerIds = activePlayers.map(p => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount,
    });

    if (anteError) {
      console.error('[YAHTZEE] ERROR collecting antes:', anteError);
    } else {
      const anteChipChanges: Record<string, number> = {};
      for (const player of activePlayers) {
        anteChipChanges[player.id] = -anteAmount;
      }

      recordGameResult(
        gameId,
        newHandNumber,
        null,
        'Ante',
        `${activePlayers.length} players anted $${anteAmount}`,
        0,
        anteChipChanges,
        false,
        'yahtzee',
        dealerGameId || null,
      );
    }
  }

  console.log('[YAHTZEE] ✅ Round started, pot:', potForRound);
}

/** End the Yahtzee game and award pot to winner */
export async function endYahtzeeRound(
  gameId: string,
  winnerId: string | null,
  winnerDescription: string,
  isTie: boolean = false,
): Promise<void> {
  console.log('[YAHTZEE] Ending round', { gameId, winnerId, winnerDescription, isTie });

  if (isTie) {
    await supabase
      .from('games')
      .update({
        awaiting_next_round: true,
        last_round_result: 'Tie - rollover',
      })
      .eq('id', gameId);
  } else if (winnerId) {
    await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: winnerDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);
  }
}
