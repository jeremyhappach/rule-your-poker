import { supabase } from "@/integrations/supabase/client";
import { getActiveHolmRoundWithGame } from "./holmRoundUtils";
import { logGameState, logAllDecisionsIn } from "./gameStateDebugLog";
import { persistTransition } from "./persistSyncDebugEvent";

// PostgreSQL owns Holm rules, money and lifecycle. These wrappers request
// authoritative operations and acknowledge exact presentation identities.

export async function checkHolmRoundComplete(gameId: string) {
  const { game, round, error } = await getActiveHolmRoundWithGame(gameId);

  if (error || !game || !round) {
    console.warn('[HOLM CHECK] Active game/round unavailable', { gameId, error });
    return;
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('position, decision_locked, current_decision')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (playersError || !players?.length) {
    console.warn('[HOLM CHECK] Active players unavailable', { gameId, playersError });
    return;
  }

  const allDecided = players.every(
    player => player.decision_locked && player.current_decision !== null,
  );
  if (!allDecided) {
    console.log('[HOLM CHECK] Decisions remain; server owns the next turn');
    return;
  }

  if (round.status === 'processing' || round.status === 'showdown' || round.status === 'completed') {
    return;
  }

  if (!game.all_decisions_in || game.all_decisions_in_round_id !== round.id) {
    console.warn('[HOLM CHECK] Exact-round completion was not published by the server; refusing client repair');
    return;
  }

  await logAllDecisionsIn(gameId, round.id, true, 'holmGameLogic:checkHolmRoundComplete', {
    player_decisions: players.map(player => ({
      position: player.position,
      decision: player.current_decision,
      locked: player.decision_locked,
    })),
    round_status: round.status,
  });

  await endHolmRound(gameId);
}

export type HolmInitialHandStartResult = {
  outcome: 'started' | 'already-started' | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  buck_position?: number;
  pot?: number;
  deduped?: boolean;
};

export async function startHolmInitialHand(
  gameId: string,
): Promise<HolmInitialHandStartResult> {
  const { data, error } = await supabase.rpc('start_holm_initial_hand', {
    _game_id: gameId,
    _skip_ante_collection: false,
  });

  if (error) {
    throw new Error(`Holm initial-hand RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmInitialHandStartResult;
  if (result.outcome !== 'started' && result.outcome !== 'already-started') {
    throw new Error(`Holm initial-hand RPC rejected: ${result.reason ?? 'unknown reason'}`);
  }

  if (result.outcome === 'started') {
    persistTransition(gameId, 'holm', 1, 'hand-start', {
      buckPosition: result.buck_position ?? null,
      pot: result.pot ?? null,
      firstHand: true,
      atomic: true,
    });
  }

  console.log('[HOLM] Initial hand RPC complete', result);
  return result;
}

export async function endHolmRound(gameId: string) {
  console.log('[HOLM END] ========== Starting endHolmRound for game:', gameId, '==========');

  // DEBUG LOG: endHolmRound called (fire-and-forget)
  logGameState({
    gameId,
    eventType: 'END_HOLM_ROUND_CALLED',
    sourceLocation: 'holmGameLogic:endHolmRound:entry',
    details: { timestamp: new Date().toISOString() },
  });

  // ARCHITECTURAL STANDARD: Use centralized round-fetching utility
  const { game, round, error: fetchError } = await getActiveHolmRoundWithGame(gameId);

  if (fetchError || !game) {
    console.log('[HOLM END] ERROR: Game not found:', fetchError);
    return;
  }

  console.log('[HOLM END] Game data:', {
    current_round: game.current_round,
    pot: game.pot,
    status: game.status
  });

  if (!round) {
    console.log('[HOLM END] ERROR: No rounds found for game');
    return;
  }

  // Holm's final multi-player action is resolved inside PostgreSQL.  The
  // browser may observe a legacy hand and request this exact resolver, but it
  // never claims processing, reveals cards, evaluates hands, or settles chips.
  // A duplicate call is intentionally inert and the service recovery invokes
  // this same RPC when no browser survives the final action.
  const { error: resolveError } = await (supabase as any).rpc('resolve_holm_showdown', {
    p_game_id: gameId,
    p_expected_round_id: round.id,
  });
  if (resolveError) {
    console.error('[HOLM END] Database showdown resolver failed', resolveError);
  }
  return;
}

export type HolmNextHandResult = {
  outcome: 'started' | 'already-started' | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  buck_position?: number;
  pot?: number;
  deduped?: boolean;
};

export async function proceedToNextHolmRound(
  gameId: string,
  expectedRoundId: string,
): Promise<HolmNextHandResult> {
  const { data, error } = await supabase.rpc('proceed_to_next_holm_hand', {
    p_game_id: gameId,
    p_expected_round_id: expectedRoundId,
  });

  if (error) {
    throw new Error(`Holm next-hand RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmNextHandResult;
  if (result.outcome !== 'started' && result.outcome !== 'already-started') {
    throw new Error(`Holm next-hand RPC rejected: ${result.reason ?? 'unknown reason'}`);
  }

  if (result.outcome === 'started') {
    persistTransition(gameId, 'holm', result.hand_number ?? 1, 'hand-start', {
      roundId: result.round_id ?? null,
      buckPosition: result.buck_position ?? null,
      pot: result.pot ?? null,
      firstHand: false,
      atomic: true,
    });
  }

  console.log('[HOLM NEXT] Atomic successor-hand result', result);
  return result;
}

export type HolmPreparedNextHandResult = {
  outcome: 'prepared' | 'already-prepared' | 'already-active' | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  pending_turn_position?: number;
  pot?: number;
  presentation_fallback_at?: string;
  acknowledgements_required?: number;
  deduped?: boolean;
};

export async function prepareNextHolmRound(
  gameId: string,
  expectedRoundId: string,
): Promise<HolmPreparedNextHandResult> {
  const { data, error } = await (supabase as any).rpc('prepare_next_holm_hand', {
    p_game_id: gameId,
    p_expected_round_id: expectedRoundId,
  });

  if (error) {
    throw new Error(`Holm next-hand preparation RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmPreparedNextHandResult;
  if (
    result.outcome !== 'prepared'
    && result.outcome !== 'already-prepared'
    && result.outcome !== 'already-active'
  ) {
    throw new Error(`Holm next-hand preparation rejected: ${result.reason ?? 'unknown reason'}`);
  }
  if (!result.round_id) {
    throw new Error('Holm next-hand preparation returned no successor identity');
  }
  return result;
}

export type HolmPreparedDealAcknowledgementResult = {
  outcome:
    | 'acknowledged-waiting'
    | 'acknowledged-paused'
    | 'activated'
    | 'already-active'
    | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  buck_position?: number;
  decision_deadline?: string;
  pot?: number;
  pending_acknowledgements?: number;
  acknowledged?: boolean;
  from_fallback?: boolean;
  deduped?: boolean;
};

export async function acknowledgePreparedHolmHandDealt(
  gameId: string,
  dealerGameId: string,
  predecessorRoundId: string,
  successorRoundId: string,
  handNumber: number,
): Promise<HolmPreparedDealAcknowledgementResult> {
  const { data, error } = await (supabase as any).rpc('acknowledge_holm_prepared_hand_dealt', {
    p_game_id: gameId,
    p_dealer_game_id: dealerGameId,
    p_predecessor_round_id: predecessorRoundId,
    p_successor_round_id: successorRoundId,
    p_hand_number: handNumber,
  });

  if (error) {
    throw new Error(`Holm prepared-deal acknowledgement RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmPreparedDealAcknowledgementResult;
  if (
    result.outcome !== 'acknowledged-waiting'
    && result.outcome !== 'acknowledged-paused'
    && result.outcome !== 'activated'
    && result.outcome !== 'already-active'
  ) {
    throw new Error(`Holm prepared-deal acknowledgement rejected: ${result.reason ?? 'unknown reason'}`);
  }
  return result;
}
