/**
 * useVoicePeerWitness — surviving peers write automatic witness rows
 * against any voice operation opened by another user at the same game
 * table. No user interaction required. Subscribes to
 * public.voice_operation_incidents (realtime) filtered by the current
 * game_id, and to public.voice_presence_heartbeats to detect the
 * sender's presence going stale from another tab's perspective.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  game_id: string | null | undefined;
  self_user_id: string | null | undefined;
  self_player_id?: string | null;
}

async function writeWitness(
  voice_operation_id: string,
  peer_user_id: string,
  game_id: string | null,
  event_type: string,
  metadata: Record<string, unknown> = {},
  self_player_id?: string | null,
): Promise<void> {
  try {
    await supabase.from("voice_peer_witness_events").insert([{
      voice_operation_id,
      peer_user_id,
      peer_player_id: self_player_id ?? null,
      game_id,
      event_type,
      metadata: metadata as never,
    }]);
  } catch { /* noop */ }
}

export function useVoicePeerWitness({ game_id, self_user_id, self_player_id }: Options): void {
  useEffect(() => {
    if (!game_id || !self_user_id) return;
    const activeOps = new Map<string, { sender_user_id: string | null }>();

    const emit = (op_id: string, event_type: string, metadata: Record<string, unknown> = {}) => {
      void writeWitness(op_id, self_user_id, game_id, event_type, metadata, self_player_id);
    };

    // Subscribe to new/updated voice incidents at this table.
    const incCh = supabase
      .channel(`voice-witness-inc-${game_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_operation_incidents", filter: `game_id=eq.${game_id}` },
        (payload) => {
          const row = payload.new as { voice_operation_id?: string; sender_user_id?: string };
          if (!row?.voice_operation_id || row.sender_user_id === self_user_id) return;
          activeOps.set(row.voice_operation_id, { sender_user_id: row.sender_user_id ?? null });
          emit(row.voice_operation_id, "PEER_PRESENCE_CONFIRMED", { by: self_user_id });
          emit(row.voice_operation_id, "PEER_SESSION_STILL_ACTIVE");
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "voice_operation_incidents", filter: `game_id=eq.${game_id}` },
        (payload) => {
          const row = payload.new as { voice_operation_id?: string; terminal_status?: string | null };
          if (!row?.voice_operation_id) return;
          if (row.terminal_status) activeOps.delete(row.voice_operation_id);
        },
      )
      .subscribe();

    // Subscribe to sender heartbeat updates at the same table — detect stale.
    const hbCh = supabase
      .channel(`voice-witness-hb-${game_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_presence_heartbeats", filter: `game_id=eq.${game_id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            user_id?: string;
            active_voice_operation_id?: string | null;
            status?: string;
          };
          if (!row || row.user_id === self_user_id) return;
          if (row.status === "leaving" && row.active_voice_operation_id) {
            emit(row.active_voice_operation_id, "PEER_SENDER_PRESENCE_LOST", { reason: "pagehide" });
          }
        },
      )
      .subscribe();

    // Periodic stale sweep: any active op whose sender heartbeat is >10s old.
    const sweep = setInterval(async () => {
      if (activeOps.size === 0) return;
      for (const [op_id, meta] of activeOps.entries()) {
        if (!meta.sender_user_id) continue;
        const { data } = await supabase
          .from("voice_presence_heartbeats")
          .select("last_heartbeat_at")
          .eq("user_id", meta.sender_user_id)
          .order("last_heartbeat_at", { ascending: false })
          .limit(1);
        const last = data?.[0]?.last_heartbeat_at;
        const ageMs = last ? Date.now() - new Date(last).getTime() : Infinity;
        if (ageMs > 10000) {
          emit(op_id, "PEER_SENDER_PRESENCE_LOST", { reason: "heartbeat-stale", ageMs });
          activeOps.delete(op_id);
        }
      }
    }, 5000);

    return () => {
      supabase.removeChannel(incCh);
      supabase.removeChannel(hbCh);
      clearInterval(sweep);
    };
  }, [game_id, self_user_id, self_player_id]);
}
