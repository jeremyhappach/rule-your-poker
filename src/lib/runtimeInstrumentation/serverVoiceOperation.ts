/**
 * serverVoiceOperation — server-first incident lifecycle.
 *
 * The moment a voice attempt begins the client writes a row into
 * public.voice_operation_incidents. From that point onward, diagnosis
 * does not depend on this browser tab surviving. The Edge Function
 * writes durable server-side events, peers write witness events, and
 * a server watchdog produces the final report.
 *
 * This module is deliberately small and side-effect free besides
 * network writes. It never touches microphone or transcription logic.
 */

import { supabase } from "@/integrations/supabase/client";

const TAB_ID_KEY = "voice-op:tab-id-v1";

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

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface OpenIncidentInput {
  voice_operation_id: string;
  game_id?: string | null;
  session_id?: string | null;
  dealer_game_id?: string | null;
  sender_player_id?: string | null;
  surface?: string | null;
  route?: string | null;
  origin_instance_id?: string | null;
}

/**
 * Open the durable server-side incident row. Best-effort: if the write
 * fails (offline), the Edge Function will still create edge events for
 * the same voice_operation_id and the finalizer will later stitch the
 * report using whatever evidence exists.
 */
export async function openServerVoiceIncident(input: OpenIncidentInput): Promise<void> {
  const user_id = await getUserId();
  const tab_id = getTabId();
  const nowIso = new Date().toISOString();
  try {
    await supabase.from("voice_operation_incidents").insert([{
      voice_operation_id: input.voice_operation_id,
      sender_user_id: user_id,
      sender_player_id: input.sender_player_id ?? null,
      game_id: input.game_id ?? null,
      dealer_game_id: input.dealer_game_id ?? null,
      session_id: input.session_id ?? null,
      origin_instance_id: input.origin_instance_id ?? tab_id,
      origin_tab_id: tab_id,
      origin_route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      origin_surface: input.surface ?? null,
      client_last_phase: "OPENED",
      client_last_phase_at: nowIso,
    }]);
  } catch { /* best-effort */ }
}

export type ClientEventPhase =
  | "OPENED"
  | "CAPTURE_STARTED"
  | "CAPTURE_STOP_REQUESTED"
  | "BLOB_READY"
  | "ENCODE_COMPLETE"
  | "FN_INVOKE_START"
  | "FN_INVOKE_RESPONSE"
  | "FN_INVOKE_ERROR"
  | "SEND_COMPLETE"
  | "SEND_FAILED"
  | "CANCELLED"
  // Recording-start path boundaries (part B). These are persisted with the
  // same voice_operation_id and canonical game context so the finalizer can
  // deterministically distinguish CAPTURE_STARTED-with-no-subsequent-boundary
  // failures from later-stage failures.
  | "VOICE_START_HANDLER_ENTERED"
  | "VOICE_GET_USER_MEDIA_BEGIN"
  | "VOICE_GET_USER_MEDIA_RESOLVED"
  | "VOICE_AUDIO_TRACK_ACQUIRED"
  | "VOICE_MEDIARECORDER_CONSTRUCT_BEGIN"
  | "VOICE_MEDIARECORDER_CONSTRUCTED"
  | "VOICE_MEDIARECORDER_START_BEGIN"
  | "VOICE_MEDIARECORDER_START_RETURNED"
  | "VOICE_RECORDING_STATE_COMMITTED"
  | "VOICE_START_HANDLER_EXITED";

export async function writeClientVoiceEvent(
  voice_operation_id: string,
  phase: ClientEventPhase,
  extras: Partial<{
    status_code: number;
    duration_ms: number;
    byte_count: number;
    error_category: string;
    error_message: string;
    metadata: Record<string, unknown>;
  }> = {},
): Promise<void> {
  const user_id = await getUserId();
  try {
    await supabase.from("voice_operation_events").insert([{
      voice_operation_id,
      origin: "client",
      phase,
      actor_user_id: user_id,
      status_code: extras.status_code ?? null,
      duration_ms: extras.duration_ms ?? null,
      byte_count: extras.byte_count ?? null,
      error_category: extras.error_category ?? null,
      error_message: extras.error_message ?? null,
      metadata: (extras.metadata ?? {}) as never,
    }]);
    await supabase
      .from("voice_operation_incidents")
      .update({
        client_last_phase: phase,
        client_last_phase_at: new Date().toISOString(),
      })
      .eq("voice_operation_id", voice_operation_id);
  } catch { /* best-effort */ }
}

/** Fire-and-forget invoker of the server-side finalizer watchdog. */
export function triggerServerFinalizer(): void {
  try {
    supabase.functions.invoke("finalize-voice-operations", { body: {} }).catch(() => {});
  } catch { /* noop */ }
}

