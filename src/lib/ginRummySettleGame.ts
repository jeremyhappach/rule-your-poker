/**
 * Identity-only client entry point for Gin Rummy terminal settlement.
 *
 * The database derives the terminal match result and owns the final hand
 * history, payout, snapshots, and disposition. Presentation may replay this
 * immutable request from any connected participant.
 */
import { supabase } from '@/integrations/supabase/client';

export interface GinRummySettleGameParams {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
}

export interface GinRummySettleGameResult {
  status: 'settled' | 'already_settled';
  resultId: string | null;
  handNumber: number;
  winnerPlayerId: string;
  payoutAmount: number;
  terminalDisposition: 'game_over' | 'session_ended';
}

export async function settleGinRummyGame(
  params: GinRummySettleGameParams,
): Promise<GinRummySettleGameResult> {
  const { data, error } = await supabase.rpc('gin_rummy_settle_game', {
    p_game_id: params.gameId,
    p_round_id: params.roundId,
    p_dealer_game_id: params.dealerGameId,
    p_hand_number: params.handNumber,
  });

  if (error) throw error;

  const payload = (data ?? {}) as Record<string, unknown>;
  const status = payload.status;
  const terminalDisposition = payload.terminal_disposition;
  if (
    (status !== 'settled' && status !== 'already_settled') ||
    (terminalDisposition !== 'game_over' && terminalDisposition !== 'session_ended') ||
    typeof payload.winner_player_id !== 'string' ||
    typeof payload.payout_amount !== 'number'
  ) {
    throw new Error('gin_rummy_settle_game returned an invalid settlement result');
  }

  return {
    status,
    resultId: (payload.result_id as string | null | undefined) ?? null,
    handNumber: (payload.hand_number as number | undefined) ?? params.handNumber,
    winnerPlayerId: payload.winner_player_id,
    payoutAmount: payload.payout_amount,
    terminalDisposition,
  };
}
