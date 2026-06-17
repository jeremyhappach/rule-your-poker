/**
 * Wave 6 — Geometry Lab override store (MVP).
 *
 * Module-level reactive store that holds geometry overrides for anchored
 * artifact descriptors, populated from the `geometry_overrides` table via
 * <GeometryOverridesLoader/>. Providers read the snapshot with the
 * `useGeometryOverrides()` hook and merge it into their descriptor list
 * via `applyGeometryOverrides()` before resolving layout.
 *
 * No game logic changes — only descriptor pre-processing.
 */

import { useSyncExternalStore } from "react";
import type { ArtifactDescriptor, AnchorOrigin } from "@/lib/wave4LayoutResolver/types";

export type SizeMode = "widthDriven" | "heightDriven" | "rect";

export interface GeometryOverride {
  artifact_id: string;
  game: string;
  anchor_x: number | null;
  anchor_y: number | null;
  anchor_origin: AnchorOrigin | null;
  size_mode: SizeMode;
  width_pct: number | null;
  height_pct: number | null;
  aspect_ratio: number | null;
}

export type GeometryOverridesMap = ReadonlyMap<string, GeometryOverride>;

const EMPTY: GeometryOverridesMap = new Map();

let snapshot: GeometryOverridesMap = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setGeometryOverrides(next: GeometryOverridesMap) {
  snapshot = next;
  emit();
}

export function getGeometryOverridesSnapshot(): GeometryOverridesMap {
  return snapshot;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useGeometryOverrides(): GeometryOverridesMap {
  return useSyncExternalStore(subscribe, getGeometryOverridesSnapshot, getGeometryOverridesSnapshot);
}

/**
 * Merge overrides into the descriptor list. Only `anchored` descriptors are
 * touched. Returns a new array; descriptors without overrides pass through
 * by reference.
 */
export function applyGeometryOverrides(
  descriptors: ReadonlyArray<ArtifactDescriptor>,
  overrides: GeometryOverridesMap,
): ArtifactDescriptor[] {
  if (overrides.size === 0) return descriptors.slice();
  return descriptors.map((d) => {
    if (d.composeMode !== "anchored") return d;
    const o = overrides.get(d.id);
    if (!o) return d;
    const next: ArtifactDescriptor = { ...d };
    if (o.anchor_x != null) next.anchorX = o.anchor_x;
    if (o.anchor_y != null) next.anchorY = o.anchor_y;
    if (o.anchor_origin) next.anchorOrigin = o.anchor_origin;
    // sizeMode drives which fields apply.
    if (o.size_mode === "widthDriven") {
      if (o.width_pct != null) next.widthPct = o.width_pct;
      if (o.aspect_ratio != null) next.aspectRatio = o.aspect_ratio;
      // heightPct intentionally cleared so widthPct + aspectRatio drives.
      if (o.aspect_ratio != null) next.heightPct = undefined;
    } else if (o.size_mode === "heightDriven") {
      if (o.height_pct != null) next.heightPct = o.height_pct;
      if (o.aspect_ratio != null) next.aspectRatio = o.aspect_ratio;
      if (o.aspect_ratio != null) next.widthPct = undefined;
    } else {
      // rect — both pcts, no aspect
      if (o.width_pct != null) next.widthPct = o.width_pct;
      if (o.height_pct != null) next.heightPct = o.height_pct;
      next.aspectRatio = undefined;
    }
    return next;
  });
}
