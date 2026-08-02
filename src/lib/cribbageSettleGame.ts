/**
 * Single client entry point for authoritative Cribbage terminal settlement.
 *
 * Every connected client and every terminal remount may call this function.
 * `public.cribbage_settle_game` owns the durable claim, payout, result,
 * post-payout snapshots, and game/session terminal disposition in one
 * transaction. The client owns presentation only.
 */
import { supabase } from '@/integrations/supabase/client';

export type CribbageSettlementStatus = 'settled' | 'already_settled';
export type CribbageTerminalDisposition = 'game_over' | 'session_ended';

export interface CribbageSettleGameParams {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
}

export interface CribbageSettleGameResult {
  status: CribbageSettlementStatus;
  resultId: string | null;
  handNumber: number;
  terminalDisposition: CribbageTerminalDisposition;
  winnerPlayerId: string | null;
  amountPerLoser: number | null;
  totalWinnerGain: number | null;
  legacyResult: boolean;
}

export async function settleCribbageGame(
  params: CribbageSettleGameParams,
): Promise<CribbageSettleGameResult> {
  const { data, error } = await supabase.rpc('cribbage_settle_game', {
    p_game_id: params.gameId,
    p_round_id: params.roundId,
    p_dealer_game_id: params.dealerGameId,
    p_hand_number: params.handNumber,
  });

  if (error) {
    console.error('[CRIBBAGE SETTLE] RPC failed', {
      gameId: params.gameId,
      roundId: params.roundId,
      dealerGameId: params.dealerGameId,
      handNumber: params.handNumber,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const status = payload.status;
  const terminalDisposition = payload.terminal_disposition;
  if (
    (status !== 'settled' && status !== 'already_settled') ||
    (terminalDisposition !== 'game_over' && terminalDisposition !== 'session_ended')
  ) {
    throw new Error('cribbage_settle_game returned an invalid settlement result');
  }

  return {
    status,
    resultId: (payload.result_id as string | null | undefined) ?? null,
    handNumber: (payload.hand_number as number | undefined) ?? params.handNumber,
    terminalDisposition,
    winnerPlayerId: (payload.winner_player_id as string | null | undefined) ?? null,
    amountPerLoser: (payload.amount_per_loser as number | null | undefined) ?? null,
    totalWinnerGain: (payload.total_winner_gain as number | null | undefined) ?? null,
    legacyResult: payload.legacy_result === true,
  };
}
