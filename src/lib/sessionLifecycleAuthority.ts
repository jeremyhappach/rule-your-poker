import { supabase } from "@/integrations/supabase/client";

export async function requestSessionEnd(gameId: string): Promise<string> {
  const { data, error } = await supabase.from("games")
    .select("current_game_uuid,timer_generation" as any).eq("id", gameId).maybeSingle();
  if (error) throw error;
  if (!data) return "deleted";
  const identity = data as unknown as { current_game_uuid: string | null; timer_generation: number };
  const response = await supabase.rpc("request_session_end" as any, {
    p_game_id: gameId, p_expected_dealer_game_id: identity.current_game_uuid,
    p_expected_timer_generation: identity.timer_generation,
  } as any);
  if (response.error) throw response.error;
  const result = response.data as unknown as { request_recorded?: boolean; terminal_disposition: string };
  if (!result?.request_recorded) throw new Error("The table changed. Please try ending the session again.");
  return result.terminal_disposition;
}
