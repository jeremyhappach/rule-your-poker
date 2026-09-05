/**
 * Instant-357 detection & settlement extracted from `startRound`.
 *
 * Used by:
 *   1. `startRound` — after the initial-hand R1 bootstrap deal (legacy path).
 *   2. `advance357RoundAtomic` — after the atomic R1 seam RPC commits a
 *      new-hand R1 round (server-authored deck; possibly harness-forced).
 *
 * Idempotency: the atomic status guard on `games.status = 'in_progress'`
 * → `game_over` is the single-writer transition. Callers may invoke this
 * helper multiple times safely; only the first winner-detection commits.
 */

import { supabase } from "@/integrations/supabase/client";
import { type Card, has357Hand } from "../cardUtils";
import { getBotAlias } from "../botAlias";
import { emit357InstantWinTerminal } from "./instantWinLifecycle";
import { recordGameResult } from "../gameLogic";
import { potToPlayer, settleGameplayChipTransfers } from "../gameplayChipTransfers";

export type InstantWinDetectionResult =
  | { kind: "none" }
  | { kind: "already_terminal" }
  | { kind: "settled"; winnerPlayerId: string; totalPrize: number; sweepMessage: string }
  | { kind: "failed"; reason: string };

async function traceInstantWin(
  eventType: string,
  gameId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("debug_events").insert({
      event_type: `357.instant_win.${eventType}`,
      game_id: gameId,
      round_id: (payload.roundId as string | undefined) ?? null,
      payload: payload as any,
    });
  } catch { /* diagnostic-only */ }
}

export async function detectAndSettleInstantWin357(args: {
  gameId: string;
  roundId: string;
  handNumber: number;
  dealerGameId: string | null;
}): Promise<InstantWinDetectionResult> {
  const { gameId, roundId, handNumber, dealerGameId } = args;

  const { data: dealtCards } = await supabase
    .from("player_cards")
    .select("*, players!inner(id, position, legs, user_id, is_bot, profiles(username), created_at)")
    .eq("round_id", roundId);

  const { data: allPlayersForAlias } = await supabase
    .from("players")
    .select("user_id, is_bot, created_at")
    .eq("game_id", gameId);

  if (!dealtCards || dealtCards.length === 0) return { kind: "none" };

  for (const pc of dealtCards) {
    const cards = pc.cards as unknown as Card[];
    if (!has357Hand(cards)) continue;

    const player = pc.players as any;
    const username = player?.is_bot && allPlayersForAlias
      ? getBotAlias(allPlayersForAlias, player.user_id)
      : (player?.profiles?.username || `Player ${player?.position}`);

    // Pre-guard prize snapshot
    const { data: prePot } = await supabase
      .from("games")
      .select("pot, leg_value")
      .eq("id", gameId)
      .single();
    const preGuardPot = (prePot as any)?.pot || 0;
    const preGuardLegValue = (prePot as any)?.leg_value || 1;
    const { data: prePlayers } = await supabase
      .from("players")
      .select("id, chips, legs")
      .eq("game_id", gameId);
    const preGuardTotalLegValue = (prePlayers || []).reduce(
      (s: number, p: any) => s + ((p.legs || 0) * preGuardLegValue), 0,
    );
    const preGuardTotalPrize = preGuardPot + preGuardTotalLegValue;
    const sweepMessage = `357_SWEEP:${username}:${preGuardTotalPrize}`;

    emit357InstantWinTerminal("detected", {
      gameId, roundId, handNumber, dealerGameId,
      winnerPlayerId: player?.id ?? null, winnerUsername: username, sweepMessage,
    });

    try {
      // Mark round completed.
      await supabase.from("rounds").update({ status: "completed" }).eq("id", roundId);

      // Atomic transition: in_progress → game_over. Only one caller wins.
      const { data: guardResult, error: guardErr } = await supabase
        .from("games")
        .update({
          status: "game_over",
          game_over_at: null,
          current_round: null,
          awaiting_next_round: false,
          all_decisions_in: false,
          all_decisions_in_round_id: null,
          last_round_result: sweepMessage,
        })
        .eq("id", gameId)
        .eq("status", "in_progress")
        .select("pot, total_hands, dealer_position, leg_value, pending_session_end")
        .single();

      if (guardErr || !guardResult) {
        await traceInstantWin("commit.guard_lost", gameId, {
          roundId, handNumber, error: guardErr?.message ?? null,
        });
        emit357InstantWinTerminal("failed", {
          gameId, roundId, handNumber,
          eventKind: "guard_lost",
          error: guardErr ?? new Error("guard_lost"),
        });
        return { kind: "already_terminal" };
      }

      const currentPot = guardResult.pot || 0;
      const legValue = guardResult.leg_value || 1;
      const commitHandNumber = Math.max(guardResult.total_hands || 0, handNumber);

      const { data: allPlayers } = await supabase
        .from("players")
        .select("id, chips, legs")
        .eq("game_id", gameId);
      const players = allPlayers || [];
      const totalLegValue = players.reduce((s: number, p: any) => s + (p.legs * legValue), 0);
      const totalPrize = currentPot + totalLegValue;

      if (player?.id) {
        if (currentPot > 0) {
          await settleGameplayChipTransfers(gameId, [potToPlayer(player.id, currentPot)], 'sweep');
        }
        if (totalLegValue > 0) {
          await supabase.rpc("increment_player_chips", {
            p_player_id: player.id, p_amount: totalLegValue,
          });
        }
      }

      const playerChipChanges: Record<string, number> = {};
      for (const p of players) {
        playerChipChanges[p.id] = p.id === player?.id ? totalPrize : 0;
      }

      try {
        await recordGameResult(
          gameId, commitHandNumber, player?.id ?? null,
          username, "3-5-7 Sweep", totalPrize,
          playerChipChanges, false, "357", dealerGameId ?? null,
        );
      } catch (e) {
        await traceInstantWin("commit.record_result_failed", gameId, {
          roundId, handNumber: commitHandNumber, error: (e as Error)?.message ?? String(e),
        });
      }

      await supabase.from("players")
        .update({ legs: 0, current_decision: null, decision_locked: false })
        .eq("game_id", gameId);

      await supabase.from("players")
        .update({ ante_decision: null })
        .eq("game_id", gameId)
        .neq("status", "observer");

      await supabase.from("games")
        .update({ pot: 0, total_hands: commitHandNumber })
        .eq("id", gameId);

      if (guardResult.pending_session_end) {
        await supabase.from("games").update({
          status: "session_ended",
          session_ended_at: new Date().toISOString(),
          game_over_at: new Date().toISOString(),
          pending_session_end: false,
        }).eq("id", gameId);
      }

      emit357InstantWinTerminal("settlement_completed", {
        gameId, roundId, handNumber: commitHandNumber, dealerGameId,
        winnerPlayerId: player?.id ?? null, winnerUsername: username,
        totalPrize, currentPot, totalLegValue, sweepMessage,
        sessionEnded: !!guardResult.pending_session_end,
      });

      await traceInstantWin("commit.game_over", gameId, {
        roundId, handNumber: commitHandNumber, dealerGameId,
        winnerPlayerId: player?.id ?? null, winnerUsername: username,
        currentPot, totalLegValue, totalPrize, sweepMessage,
      });

      return { kind: "settled", winnerPlayerId: player?.id, totalPrize, sweepMessage };
    } catch (e) {
      emit357InstantWinTerminal("failed", {
        gameId, roundId, handNumber,
        eventKind: "settle_exception", error: e,
      });
      return { kind: "failed", reason: (e as Error)?.message ?? String(e) };
    }
  }

  return { kind: "none" };
}
