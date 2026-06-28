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
let committedVersion = 0;

function emit() {
  committedVersion++;
  invalidateMerged();
  for (const l of listeners) l();
  for (const l of draftedListeners) l();
}

export function setGeometryOverrides(next: GeometryOverridesMap) {
  snapshot = next;
  emit();
}

/**
 * Optimistically merge a single committed override into the local snapshot
 * so admin UI re-seeds immediately after Apply without waiting for the
 * realtime echo. The realtime refresh that follows is idempotent (same
 * row contents → same snapshot value).
 */
export function setOverrideOptimistic(id: string, value: GeometryOverride) {
  const next = new Map(snapshot);
  next.set(id, value);
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

// ---------------------------------------------------------------------------
// Drafted overrides — local, in-memory, NOT broadcast. Populated by
// Geometry Lab while the admin is editing an artifact draft, consumed by
// `useDraftedGeometryOverrides()` for live preview in the editing client.
// Drafts win per artifact id; cleared on Cancel / modal close / Apply.
// ---------------------------------------------------------------------------

let draftedSnapshot: Map<string, GeometryOverride> = new Map();
const draftedListeners = new Set<() => void>();
let draftedVersion = 0;

export function setDraftedOverride(
  id: string,
  value: GeometryOverride | null,
) {
  const cur = draftedSnapshot.get(id);
  if (value == null) {
    if (cur === undefined) return;
    const next = new Map(draftedSnapshot);
    next.delete(id);
    draftedSnapshot = next;
  } else {
    if (cur && JSON.stringify(cur) === JSON.stringify(value)) return;
    const next = new Map(draftedSnapshot);
    next.set(id, value);
    draftedSnapshot = next;
  }
  draftedVersion++;
  invalidateMerged();
  for (const l of draftedListeners) l();
}

export function clearAllDraftedOverrides() {
  if (draftedSnapshot.size === 0) return;
  draftedSnapshot = new Map();
  draftedVersion++;
  invalidateMerged();
  for (const l of draftedListeners) l();
}

let mergedCacheKey = -1;
let mergedCacheValue: GeometryOverridesMap = EMPTY;
function invalidateMerged() {
  mergedCacheKey = -1;
}
function getMergedOverridesSnapshot(): GeometryOverridesMap {
  const key = committedVersion * 1_000_003 + draftedVersion;
  if (key === mergedCacheKey) return mergedCacheValue;
  if (draftedSnapshot.size === 0) {
    mergedCacheValue = snapshot;
  } else {
    const m = new Map(snapshot);
    for (const [k, v] of draftedSnapshot) m.set(k, v);
    mergedCacheValue = m;
  }
  mergedCacheKey = key;
  return mergedCacheValue;
}

function subscribeMerged(l: () => void) {
  listeners.add(l);
  draftedListeners.add(l);
  return () => {
    listeners.delete(l);
    draftedListeners.delete(l);
  };
}

/**
 * Merged committed-∪-drafted overrides for live preview. Drafts win per
 * artifact id. Drafts are LOCAL to the editing client and disappear on
 * Cancel / modal close / Apply. All runtime gameplay-geometry providers
 * should consume this hook so Lab edits move the live table immediately.
 */
export function useDraftedGeometryOverrides(): GeometryOverridesMap {
  return useSyncExternalStore(
    subscribeMerged,
    getMergedOverridesSnapshot,
    getMergedOverridesSnapshot,
  );
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
