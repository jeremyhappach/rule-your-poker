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
  type GeometryOverride,
  type GeometryOverridesMap,
  type SizeMode,
} from "./store";
import type { AnchorOrigin } from "@/lib/wave4LayoutResolver/types";

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
  try {
    window.dispatchEvent(new Event("geometry_override_changed"));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("geometrylab:overrides_event_dispatch_failed", {
      message: (err as Error)?.message ?? String(err),
    });
  }
}

export function GeometryOverridesLoader() {
  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("geometry_overrides")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "geometry_overrides" },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.info("geometrylab:subscription_status", { status });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  return null;
}
