/**
 * Wave 6 — Geometry Lab override loader (MVP).
 *
 * Mounted near the app root. Fetches all rows from `geometry_overrides`,
 * subscribes to realtime postgres_changes, and pushes the result into
 * the module-level override store. Providers read the snapshot through
 * `useGeometryOverrides()`.
 *
 * The "geometry_override_changed" custom DOM event is also dispatched on
 * every refresh so non-React consumers (debug overlays, etc.) can react.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  setGeometryOverrides,
  setOverrideOptimistic,
  type GeometryOverride,
  type GeometryOverridesMap,
  type SizeMode,
} from "./store";
import type { AnchorOrigin } from "@/lib/wave4LayoutResolver/types";

const GEOMETRY_OVERRIDE_BROADCAST_CHANNEL = "geometry-overrides-live";
const GEOMETRY_OVERRIDE_APPLIED_EVENT = "geometry_override_applied";
const GEOMETRY_OVERRIDE_LOCAL_CHANNEL = "geometry-overrides-local-apply";

function dispatchOverrideChanged() {
  try {
    window.dispatchEvent(new Event("geometry_override_changed"));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("geometrylab:overrides_event_dispatch_failed", {
      message: (err as Error)?.message ?? String(err),
    });
  }
}

function applyOverrideLive(raw: Record<string, unknown>, source: string) {
  const override = rowToOverride(raw);
  setOverrideOptimistic(override.artifact_id, override);
  // eslint-disable-next-line no-console
  console.info("geometrylab:overrides_live_applied", {
    artifactId: override.artifact_id,
    source,
  });
  dispatchOverrideChanged();
}

function rowToOverride(r: Record<string, unknown>): GeometryOverride {
  return {
    artifact_id: String(r.artifact_id),
    game: String(r.game ?? ""),
    anchor_x: r.anchor_x == null ? null : Number(r.anchor_x),
    anchor_y: r.anchor_y == null ? null : Number(r.anchor_y),
    anchor_origin: (r.anchor_origin ?? null) as AnchorOrigin | null,
    size_mode: ((r.size_mode as string) ?? "widthDriven") as SizeMode,
    width_pct: r.width_pct == null ? null : Number(r.width_pct),
    height_pct: r.height_pct == null ? null : Number(r.height_pct),
    aspect_ratio: r.aspect_ratio == null ? null : Number(r.aspect_ratio),
  };
}

async function refresh() {
  const { data, error } = await supabase
    .from("geometry_overrides" as any)
    .select("*");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("geometrylab:overrides_fetch_failed", {
      message: error.message,
      code: (error as { code?: string }).code,
    });
    return;
  }
  const m = new Map<string, GeometryOverride>();
  for (const row of ((data ?? []) as unknown) as Record<string, unknown>[]) {
    const o = rowToOverride(row);
    m.set(o.artifact_id, o);
  }
  const next: GeometryOverridesMap = m;
  setGeometryOverrides(next);
  // eslint-disable-next-line no-console
  console.info("geometrylab:overrides_hot_reloaded", { count: next.size });
  dispatchOverrideChanged();
}

export async function broadcastGeometryOverrideApplied(
  override: GeometryOverride,
): Promise<void> {
  try {
    const localChannel = new BroadcastChannel(GEOMETRY_OVERRIDE_LOCAL_CHANNEL);
    localChannel.postMessage({ type: GEOMETRY_OVERRIDE_APPLIED_EVENT, override });
    localChannel.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("geometrylab:overrides_local_broadcast_failed", {
      artifactId: override.artifact_id,
      message: (err as Error)?.message ?? String(err),
    });
  }

  const channel = supabase.channel(GEOMETRY_OVERRIDE_BROADCAST_CHANNEL, {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timeout = window.setTimeout(finish, 1500);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.send({
            type: "broadcast",
            event: GEOMETRY_OVERRIDE_APPLIED_EVENT,
            payload: { override },
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("geometrylab:overrides_broadcast_failed", {
            artifactId: override.artifact_id,
            message: (err as Error)?.message ?? String(err),
          });
        } finally {
          window.clearTimeout(timeout);
          finish();
        }
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        window.clearTimeout(timeout);
        finish();
      }
    });
  });

  supabase.removeChannel(channel);
}

export function GeometryOverridesLoader() {
  useEffect(() => {
    void refresh();
    const postgresChannel = supabase
      .channel("geometry_overrides")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "geometry_overrides" },
        (payload) => {
          const raw = (payload.new ?? payload.old) as
            | Record<string, unknown>
            | undefined;
          if (raw?.artifact_id && payload.eventType !== "DELETE") {
            applyOverrideLive(raw, "postgres_changes");
            return;
          }
          void refresh();
        },
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.info("geometrylab:subscription_status", {
          channel: "postgres",
          status,
        });
      });

    const broadcastChannel = supabase
      .channel(GEOMETRY_OVERRIDE_BROADCAST_CHANNEL, {
        config: { broadcast: { self: false } },
      })
      .on(
        "broadcast",
        { event: GEOMETRY_OVERRIDE_APPLIED_EVENT },
        (payload) => {
          const raw = (payload.payload as { override?: Record<string, unknown> } | undefined)
            ?.override;
          if (!raw) return;
          applyOverrideLive(raw, "supabase_broadcast");
        },
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.info("geometrylab:subscription_status", {
          channel: "broadcast",
          status,
        });
      });
    let localChannel: BroadcastChannel | null = null;
    try {
      localChannel = new BroadcastChannel(GEOMETRY_OVERRIDE_LOCAL_CHANNEL);
      localChannel.onmessage = (event) => {
        const data = event.data as
          | { type?: string; override?: Record<string, unknown> }
          | undefined;
        if (data?.type !== GEOMETRY_OVERRIDE_APPLIED_EVENT || !data.override) {
          return;
        }
        applyOverrideLive(data.override, "local_broadcast_channel");
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("geometrylab:overrides_local_broadcast_bind_failed", {
        message: (err as Error)?.message ?? String(err),
      });
    }

    return () => {
      localChannel?.close();
      supabase.removeChannel(postgresChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, []);
  return null;
}
