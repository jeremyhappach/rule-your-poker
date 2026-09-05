import { supabase } from "@/integrations/supabase/client";

export type SessionPlayerOption = "auto_ante" | "auto_ante_runback" | "sit_out_next_hand" | "stand_up_next_hand" | "rejoin" | "cancel_exit";
export type SessionIntentPlayer = {
  id: string;
  auto_ante: boolean;
  auto_ante_runback: boolean;
  sit_out_next_hand: boolean;
  stand_up_next_hand: boolean;
  waiting: boolean;
};

const pending = new Map<string, Promise<unknown>>();

// Serialize this client's gestures; the database version rejects competing clients.
export function setSessionPlayerIntent(playerId: string, option: SessionPlayerOption, value = true): Promise<SessionIntentPlayer> {
  const request = (pending.get(playerId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const { data, error } = await supabase.from("players")
      .select("game_id,intent_version,games!inner(current_game_uuid)" as any).eq("id", playerId).single();
    if (error) throw error;
    const identity = data as unknown as { game_id: string; intent_version: number; games: { current_game_uuid: string | null } };
    const response = await supabase.rpc("set_session_player_intent" as any, {
      p_game_id: identity.game_id, p_player_id: playerId, p_expected_version: identity.intent_version,
      p_expected_dealer_game_id: identity.games.current_game_uuid, p_option: option, p_value: value,
    } as any);
    if (response.error) throw response.error;
    const result = response.data as unknown as { outcome: string; player: SessionIntentPlayer };
    if (result?.outcome !== "accepted") throw new Error("Your table participation changed. Please try again.");
    return result.player;
  });
  pending.set(playerId, request);
  void request.finally(() => { if (pending.get(playerId) === request) pending.delete(playerId); }).catch(() => {});
  return request;
}

export async function transferSessionHost(gameId: string, targetPlayerId: string): Promise<void> {
  const { data, error } = await supabase.from("games").select("host_version" as any).eq("id", gameId).single();
  if (error) throw error;
  const response = await supabase.rpc("transfer_session_host" as any, {
    p_game_id: gameId, p_target_player_id: targetPlayerId,
    p_expected_version: (data as unknown as { host_version: number }).host_version,
  } as any);
  if (response.error) throw response.error;
  if ((response.data as unknown as { outcome?: string })?.outcome !== "accepted") {
    throw new Error("The host changed. Refresh the table and try again.");
  }
}

export async function declineSessionSetup(gameId: string, dealerPosition: number, deadline: string | null | undefined): Promise<void> {
  if (!deadline) throw new Error("The dealer setup has changed. Refresh the table.");
  const { data, error } = await supabase.rpc("decline_session_setup" as any, {
    p_game_id: gameId, p_expected_dealer_position: dealerPosition, p_expected_config_deadline: deadline,
  } as any);
  if (error) throw error;
  if (!["declined", "already_declined"].includes((data as unknown as { outcome?: string })?.outcome ?? "")) {
    throw new Error("The dealer setup has changed. Please try again.");
  }
}
