import { supabase } from "@/integrations/supabase/client";

function requireAccepted(data: unknown): void {
  const outcome = (data as { outcome?: string } | null)?.outcome;
  if (!outcome || outcome === "stale-participation" || outcome === "not-authorized") {
    throw new Error("Your table participation changed. Please try again.");
  }
}

export async function leaveSession(gameId: string, playerId: string, version: number): Promise<void> {
  const { data, error } = await supabase.rpc("session_leave" as any, {
    p_game_id: gameId,
    p_player_id: playerId,
    p_expected_version: version,
  } as any);
  if (error) throw error;
  requireAccepted(data);
}

export async function takeSessionSeat(gameId: string, userId: string, position: number): Promise<void> {
  // Identity/version only: balances never round-trip through a seat request.
  const { data: player, error: readError } = await supabase.from("players")
    .select("id, participation_version" as any).eq("game_id", gameId).eq("user_id", userId).maybeSingle();
  if (readError) throw readError;
  const identity = player as unknown as { id: string; participation_version: number } | null;
  const { data, error } = await supabase.rpc("session_take_seat" as any, {
    p_game_id: gameId,
    p_position: position,
    p_player_id: identity?.id ?? null,
    p_expected_version: identity?.participation_version ?? null,
  } as any);
  if (error) throw error;
  requireAccepted(data);
  if ((data as { outcome?: string } | null)?.outcome !== "seated") {
    throw new Error("This table is no longer accepting seats.");
  }
}
