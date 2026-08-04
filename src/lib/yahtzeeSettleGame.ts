/**
 * Single client entry point for authoritative Yahtzee terminal settlement.
 *
 * Every eligible connected session participant may submit the same immutable
 * identity. The database owns outcome derivation, payout, result, post-payout
 * snapshots, tie rollover, and game/session disposition in one replay-safe
 * transaction. The client owns presentation only.
 */
import { supabase } from '@/integrations/supabase/client';

export type YahtzeeSettlementStatus = 'settled' | 'already_settled';
export type YahtzeeTerminalDisposition =
  | 'game_over'
  | 'session_ended'
  | 'tie_rollover';

export interface YahtzeeSettleGameParams {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
}

export interface YahtzeeSettleGameResult {
  status: YahtzeeSettlementStatus;
  resultId: string | null;
  handNumber: number;
  terminalDisposition: YahtzeeTerminalDisposition;
  winnerPlayerId: string | null;
  amountPerLoser: number | null;
  totalWinnerGain: number | null;
}

export async function settleYahtzeeGame(
  params: YahtzeeSettleGameParams,
): Promise<YahtzeeSettleGameResult> {
  const { data, error } = await supabase.rpc('yahtzee_settle_game', {
    p_game_id: params.gameId,
    p_round_id: params.roundId,
    p_dealer_game_id: params.dealerGameId,
    p_hand_number: params.handNumber,
  });

  if (error) {
    console.error('[YAHTZEE SETTLE] RPC failed', {
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
    (
      terminalDisposition !== 'game_over' &&
      terminalDisposition !== 'session_ended' &&
      terminalDisposition !== 'tie_rollover'
    )
  ) {
    throw new Error('yahtzee_settle_game returned an invalid settlement result');
  }

  return {
    status,
    resultId: (payload.result_id as string | null | undefined) ?? null,
    handNumber: (payload.hand_number as number | undefined) ?? params.handNumber,
    terminalDisposition,
    winnerPlayerId: (payload.winner_player_id as string | null | undefined) ?? null,
    amountPerLoser: (payload.amount_per_loser as number | null | undefined) ?? null,
    totalWinnerGain: (payload.total_winner_gain as number | null | undefined) ?? null,
  };
}
