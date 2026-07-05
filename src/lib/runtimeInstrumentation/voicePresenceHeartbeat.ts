/**
 * voicePresenceHeartbeat — server-visible presence for every connected tab.
 *
 * Writes a heartbeat row into public.voice_presence_heartbeats every ~4s
 * (and on visibility changes / pagehide). Includes the currently active
 * voice_operation_id when one is open, so the server-side finalizer can
 * detect "sender presence went stale during an open voice operation".
 *
 * Peers reading heartbeats for the same game_id become the witness source
 * for the sender's incident.
 */

import { supabase } from "@/integrations/supabase/client";
import { getActiveVoiceOperationId } from "@/lib/runtimeInstrumentation/voiceOperation";

const TAB_ID_KEY = "voice-op:tab-id-v1";
const HEARTBEAT_MS = 4000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let currentGameId: string | null = null;
let currentSessionId: string | null = null;

function getTabId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-tab";
  }
}

async function beat(status: "active" | "hidden" | "leaving"): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user_id = data.user?.id;
    if (!user_id) return;
    const payload = {
      user_id,
      tab_id: getTabId(),
      game_id: currentGameId,
      session_id: currentSessionId,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      active_voice_operation_id: getActiveVoiceOperationId(),
      last_heartbeat_at: new Date().toISOString(),
      status,
    };
    await supabase
      .from("voice_presence_heartbeats")
      .upsert([payload], { onConflict: "user_id,tab_id" });
  } catch { /* best-effort */ }
}

export function startVoicePresenceHeartbeat(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void beat("active");
  timer = setInterval(() => { void beat(document.hidden ? "hidden" : "active"); }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    void beat(document.hidden ? "hidden" : "active");
  });
  window.addEventListener("pagehide", () => { void beat("leaving"); });
}

/** Called by app-level route/game observers so heartbeats carry context. */
export function setVoicePresenceContext(ctx: {
  game_id?: string | null;
  session_id?: string | null;
}): void {
  if (ctx.game_id !== undefined) currentGameId = ctx.game_id;
  if (ctx.session_id !== undefined) currentSessionId = ctx.session_id;
}
