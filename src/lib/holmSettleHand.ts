/**
 * Holm settlement RPC wrapper.
 *
 * This is the single authoritative client entry point for terminating a Holm hand.
 * The RPC `public.holm_settle_hand` owns:
 *   - Row-level locking of `rounds` and `games`
 *   - Terminal-event idempotency (partial unique index on game_results)
 *   - Atomic write of `game_results` (terminal), `players.chips`, `games`, `rounds`
 *   - The dealer-game lifecycle predicate (only `chucky_final_award` sets game_over)
 *
 * The client supplies only authoritative business inputs (identity, event kind,
 * signed chip deltas, presentation string). It never decides whether the dealer
 * game continues.
 */
import { supabase } from "@/integrations/supabase/client";

export type HolmTerminalEventKind =
  | "pussy_tax_carryforward"
  | "chucky_loss_pot_match"
  | "chucky_tiebreak_pot_match"
  | "showdown_final_award"
  | "partial_tie_final_award"
  | "chucky_final_award";

export interface HolmSettleHandParams {
  gameId: string;
  dealerGameId: string;
  handNumber: number;
  eventKind: HolmTerminalEventKind;
  /** Final pot value to persist onto `games.pot` after settlement. */
  potFinal: number;
  /** Whether the frontend should animate awaiting_next_round after settlement. */
  awaitingNextRound: boolean;
  /** Plain string (not JSON) — stored verbatim onto `games.last_round_result`. */
  lastRoundResult: string;
  /** Signed chip deltas by player id. Empty maps are rejected by the RPC. */
  chipDeltas: Record<string, number>;
  winningHandDescription: string;
  winnerPlayerId: string | null;
  winnerUsername: string | null;
  isChopped: boolean;
  potWon: number;
  /**
   * Whether the RPC should mark the hand's round `completed` (and clear
   * decision_deadline / current_turn_position). Mirrors each legacy branch's
   * own round write exactly. Defaults to true.
   */
  markRoundCompleted?: boolean;
  /** Running pot to persist onto `rounds.pot`; null/undefined leaves it alone. */
  roundPot?: number | null;
  /** Hide Chucky by clearing `rounds.chucky_active`. */
  clearChuckyActive?: boolean;
  /**
   * Terminal branches only: reset transient player gameplay state
   * (status/current_decision/decision_locked/ante_decision) inside the same
   * transaction. Never revives 'left' / 'observer' rows.
   */
  resetPlayerStates?: boolean;
}

export interface HolmSettleHandResult {
  status: "settled" | "already_settled";
  resultId: string | null;
  handNumber: number;
  dealerGameEnded: boolean;
  /**
   * Server-chosen terminal disposition for a dealer-game-ending settlement:
   * 'game_over' (ordinary) | 'session_ended' (LAST HAND) | null (non-terminal).
   */
  terminalDisposition: 'game_over' | 'session_ended' | null;
}

export async function settleHolmHand(
  params: HolmSettleHandParams,
): Promise<HolmSettleHandResult> {
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const { data, error } = await supabase.rpc("holm_settle_hand", {
    p_game_id: params.gameId,
    p_dealer_game_id: params.dealerGameId,
    p_hand_number: params.handNumber,
    p_event_kind: params.eventKind,
    p_pot_final: params.potFinal,
    p_awaiting_next_round: params.awaitingNextRound,
    p_last_round_result: params.lastRoundResult,
    p_chip_deltas: params.chipDeltas,
    p_winning_hand_description: params.winningHandDescription,
    p_winner_player_id: params.winnerPlayerId,
    p_winner_username: params.winnerUsername,
    p_is_chopped: params.isChopped,
    p_pot_won: params.potWon,
    p_mark_round_completed: params.markRoundCompleted ?? true,
    p_round_pot: params.roundPot ?? null,
    p_clear_chucky_active: params.clearChuckyActive ?? false,
    p_reset_player_states: params.resetPlayerStates ?? false,
  });

  const dur =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

  if (error) {
    console.error("[HOLM SETTLE] RPC error", {
      eventKind: params.eventKind,
      handNumber: params.handNumber,
      dealerGameId: params.dealerGameId,
      durationMs: Math.round(dur),
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const result: HolmSettleHandResult = {
    status: (payload.status as HolmSettleHandResult["status"]) ?? "settled",
    resultId: (payload.result_id as string | null) ?? null,
    handNumber:
      (payload.hand_number as number | undefined) ?? params.handNumber,
    dealerGameEnded: Boolean(payload.dealer_game_ended),
    terminalDisposition:
      (payload.terminal_disposition as HolmSettleHandResult['terminalDisposition']) ??
      null,
  };

  console.log("[HOLM SETTLE] RPC ok", {
    eventKind: params.eventKind,
    handNumber: params.handNumber,
    dealerGameId: params.dealerGameId,
    durationMs: Math.round(dur),
    ...result,
  });

  return result;
}
