import { supabase } from "@/integrations/supabase/client";

type Draft = { requestId: string; name: string; realMoney: boolean };
type CreatedSession = { outcome: string; game_id: string; player_id: string };

// Keep the exact request across a lost response or reload. SQL errors are definite
// rejections; transport failures retain the draft for an idempotent retry.
export async function createSession(userId: string, name: string, realMoney: boolean): Promise<CreatedSession> {
  const key = "ptown:create-session:" + userId;
  const saved = localStorage.getItem(key);
  const draft: Draft = saved ? JSON.parse(saved) : { requestId: crypto.randomUUID(), name, realMoney };
  localStorage.setItem(key, JSON.stringify(draft));
  const { data, error } = await supabase.rpc("create_session" as any, {
    p_request_id: draft.requestId, p_name: draft.name, p_real_money: draft.realMoney,
  } as any);
  if (error) {
    if (/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST")) localStorage.removeItem(key);
    throw new Error(error.message || "The connection was interrupted. Try again to recover your table.");
  }
  const result = data as unknown as CreatedSession;
  if (result?.outcome === "already_deleted") {
    localStorage.removeItem(key);
    throw new Error("Your previous table has closed. Create a new table to continue.");
  }
  if (!["created", "already_created"].includes(result?.outcome) || !result.game_id) {
    throw new Error("Could not confirm table creation. Please try again.");
  }
  localStorage.removeItem(key);
  return result;
}
