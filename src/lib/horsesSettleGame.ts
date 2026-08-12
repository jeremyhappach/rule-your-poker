import { supabase } from "@/integrations/supabase/client";

export type HorsesSettlementResult = {
  status: "settled" | "already_settled" | "tie";
  result_id?: string;
  winner_player_id?: string;
  terminal_disposition?: "game_over" | "session_ended";
};

/**
 * Replays the identity-only terminal settlement request. The database derives
 * the winner from persisted dice and owns every financial/lifecycle write.
 */
export async function settleHorsesGame(
  gameId: string,
  roundId: string,
  dealerGameId: string,
  handNumber: number,
): Promise<HorsesSettlementResult> {
  const { data, error } = await supabase.rpc("horses_settle_game" as any, {
    p_game_id: gameId,
    p_round_id: roundId,
    p_dealer_game_id: dealerGameId,
    p_hand_number: handNumber,
  } as any);

  if (error) throw error;
  return data as HorsesSettlementResult;
}
