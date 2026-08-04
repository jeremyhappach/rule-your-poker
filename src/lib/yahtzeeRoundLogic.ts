/**
 * Yahtzee Round Logic
 * Handles creating rounds and managing the session lifecycle for Yahtzee.
 * Follows the same patterns as horsesRoundLogic.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { createInitialYahtzeeDice } from "./yahtzeeGameLogic";
import { createEmptyScorecard } from "./yahtzeeScoring";
import { YahtzeeState } from "./yahtzeeTypes";
import { logYahtzeeHandStart } from "./yahtzeeSyncDiagnostics";
import { getYahtzeeSeedScenario } from "./debugFlags";
import { applyYahtzeeSeedScenario } from "./yahtzeeSeedScenarios";
import { resolveSessionHostPlayerId } from "./debugHarness/resolveHarnessHost";

export async function startYahtzeeRound(gameId: string, isFirstHand: boolean = false): Promise<void> {
  console.log('[YAHTZEE] 🎲 Starting round', { gameId, isFirstHand });

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot, ante_amount, status, awaiting_next_round, dealer_position, current_game_uuid, game_type, is_paused, current_host')
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
        all_decisions_in_round_id: null,
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
        all_decisions_in_round_id: null,
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
    .select('id, user_id, position, is_bot, chips, sitting_out, status, created_at')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[YAHTZEE] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  // Exclude observer/left from active participants — they have no turn, no ante.
  const activePlayers = (players || []).filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
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

  // DEV-only: seed near-end scorecards for end-of-game regression testing.
  // Advantaged player is the canonical SESSION HOST — identical on every
  // client, never the local viewer / init-race winner.
  const seedScenario = getYahtzeeSeedScenario();
  if (seedScenario && isFirstHand) {
    const hostPlayerId = resolveSessionHostPlayerId(
      { current_host: (game as any)?.current_host ?? null },
      activePlayers as any,
    );
    applyYahtzeeSeedScenario(initialState, seedScenario, hostPlayerId);
  }

  // Yahtzee doesn't collect antes into a pot. At match end, each loser pays
  // the fixed configured stake to the unique winner.
  const potForRound = 0;

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
      all_decisions_in_round_id: null,
      awaiting_next_round: false,
      last_round_result: null,
      game_over_at: null,
      is_first_hand: isFirstHand,
      config_deadline: null,
      ante_decision_deadline: null,
    })
    .eq('id', gameId);

  // The terminal settlement owner transfers the fixed configured stake.

  logYahtzeeHandStart(gameId, newHandNumber, turnOrder.length);

  console.log('[YAHTZEE] ✅ Round started, pot:', potForRound);
}
