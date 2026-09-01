import { supabase } from '@/integrations/supabase/client';

export type HolmDecision = 'stay' | 'fold';

export interface HolmDecisionResult {
  already_locked?: boolean;
  already_terminal?: boolean;
  round_not_betting?: boolean;
  stale_round?: boolean;
  not_current_turn?: boolean;
  game_paused?: boolean;
  player_not_eligible?: boolean;
  all_decisions_in?: boolean;
  server_resolved?: boolean;
  terminal_disposition?: 'game_over' | 'session_ended' | null;
  round_id?: string | null;
  turn_sequence?: number | null;
  current_turn_position?: number | null;
  decision_deadline?: string | null;
}

/**
 * Submits an exact Holm action without browser-side authority preflights.
 * The RPC revalidates game, round, player, ownership, turn, pause, and replay
 * identity while holding the authoritative transaction locks.
 */
export async function submitHolmDecision(params: {
  gameId: string;
  roundId: string;
  playerId: string;
  decision: HolmDecision;
}): Promise<HolmDecisionResult> {
  const { data, error } = await supabase.rpc('holm_submit_decision', {
    p_game_id: params.gameId,
    p_round_id: params.roundId,
    p_player_id: params.playerId,
    p_decision: params.decision,
  });

  if (error) {
    throw new Error(`Holm decision failed: ${error.message}`);
  }

  // Preserve the deployed RPC's response contract for existing callers.
  const result = (data ?? {}) as HolmDecisionResult;
  if (
    result.already_locked
    || result.already_terminal
    || result.round_not_betting
    || result.stale_round
    || result.not_current_turn
    || result.game_paused
    || result.player_not_eligible
    || result.server_resolved
    || !result.all_decisions_in
  ) {
    return result;
  }

  // Compatibility for a deployed response that publishes completion without
  // resolving it. Current production resolves this inside the decision RPC.
  const { checkHolmRoundComplete } = await import('./holmGameLogic');
  await checkHolmRoundComplete(params.gameId);
  return result;
}
