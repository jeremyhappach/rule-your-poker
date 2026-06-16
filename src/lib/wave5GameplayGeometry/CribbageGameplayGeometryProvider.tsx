/**
 * Wave 5C — Phase 3
 * CribbageGameplayGeometryProvider
 *
 * Builds the cribbage gameplay-column descriptors ONCE, resolves them ONCE
 * against the live geometry, and exposes:
 *   - placementsById           current frame placements keyed by slot id
 *   - lastValidPlacementsById  last frame whose group resolve had no faults
 *   - faults                   current frame faults
 *
 * Telemetry is emitted on every fault frame via `emitLayoutFault`.
 *
 * IMPORTANT — Phase 3 scope:
 *   - No slot consumes this context yet.
 *   - No UI changes.
 *   - Pegboard / PeggingRow / Counting / Crib / Cut remain on their current paths.
 *
 * Phase 4–6 wire individual slots through `useCribbageGameplayGeometry()`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  resolveLayoutWithGroups,
  type ArtifactDescriptor,
  type GroupDescriptor,
  type LayoutFault,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import {
  emitLayoutFault,
  hashLayout,
  orientationFor,
  viewportBucketFor,
} from "@/lib/wave4LayoutResolver/telemetry";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { vmin } from "@/lib/wave4LayoutResolver/units";

export interface CribbageGameplayGeometryContextValue {
  placementsById: ReadonlyMap<string, ResolvedPlacement>;
  lastValidPlacementsById: ReadonlyMap<string, ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  ready: boolean;
}

const EMPTY_MAP: ReadonlyMap<string, ResolvedPlacement> = new Map();

const CribbageGameplayGeometryContext =
  createContext<CribbageGameplayGeometryContextValue>({
    placementsById: EMPTY_MAP,
    lastValidPlacementsById: EMPTY_MAP,
    faults: [],
    ready: false,
  });

// ---------------------------------------------------------------------------
// Static descriptor set — built ONCE. These are intentional placeholder
// preferreds derived from the column spec. Phases 4–6 will fold in the live
// preferred sizes published by each slot.
// ---------------------------------------------------------------------------

function leaf(
  id: string,
  preferred: { w: number; h: number },
  minimum: { w: number; h: number },
  priority = 80,
): ArtifactDescriptor {
  return {
    id,
    owner: "cribbage",
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(preferred.w), height: vmin(preferred.h) },
    minimumSize: { width: vmin(minimum.w), height: vmin(minimum.h) },
    priority,
    collapsePriority: "mid",
  };
}

const CRIBBAGE_LEAVES: ReadonlyArray<ArtifactDescriptor> = [
  leaf("cribbage.pegboard", { w: 60, h: 20 }, { w: 50, h: 15 }, 90),
  leaf("cribbage.crib", { w: 20, h: 10 }, { w: 15, h: 8 }, 70),
  leaf("cribbage.cutCard", { w: 10, h: 14 }, { w: 8, h: 10 }, 75),
  leaf("cribbage.peggingRow", { w: 70, h: 12 }, { w: 50, h: 10 }, 95),
];

const CRIB_CUT_GROUP: GroupDescriptor = {
  id: "cribbage.cribCutGroup",
  owner: "cribbage",
  band: "play",
  composeMode: "group",
  axis: "x",
  children: [
    { id: "crib", kind: "leaf", leafRef: "cribbage.crib", shrinkOrder: 2, collapseOrder: 2 },
    { id: "innerGap", kind: "gap", weight: 1, shrinkOrder: 1, collapseOrder: 1 },
    { id: "cutCard", kind: "leaf", leafRef: "cribbage.cutCard", shrinkOrder: 3, collapseOrder: 3 },
  ],
};

const GAMEPLAY_COLUMN: GroupDescriptor = {
  id: "cribbage.gameplayColumn",
  owner: "cribbage",
  band: "play",
  composeMode: "group",
  axis: "y",
  clampToBand: true,
  children: [
    { id: "pegboard", kind: "leaf", leafRef: "cribbage.pegboard", shrinkOrder: 4, collapseOrder: 4 },
    { id: "gapA", kind: "gap", weight: 1, shrinkOrder: 1, collapseOrder: 1 },
    { id: "cribCutGroup", kind: "group", group: CRIB_CUT_GROUP, shrinkOrder: 2, collapseOrder: 2 },
    { id: "gapB", kind: "gap", weight: 1, shrinkOrder: 1, collapseOrder: 1 },
    { id: "peggingRow", kind: "leaf", leafRef: "cribbage.peggingRow", shrinkOrder: 5, collapseOrder: "never" },
  ],
};

const GROUPS: ReadonlyArray<GroupDescriptor> = [GAMEPLAY_COLUMN];

export interface CribbageGameplayGeometryProviderProps {
  children: ReactNode;
}

export function CribbageGameplayGeometryProvider({
  children,
}: CribbageGameplayGeometryProviderProps) {
  const { geometry } = useLiveGeometryConstraints();
  const lastValidRef = useRef<ReadonlyMap<string, ResolvedPlacement>>(EMPTY_MAP);
  const lastHashRef = useRef<string | null>(null);

  const value = useMemo<CribbageGameplayGeometryContextValue>(() => {
    if (!geometry) {
      return {
        placementsById: EMPTY_MAP,
        lastValidPlacementsById: lastValidRef.current,
        faults: [],
        ready: false,
      };
    }

    const layout = resolveLayoutWithGroups(CRIBBAGE_LEAVES, GROUPS, geometry);
    const byId = new Map<string, ResolvedPlacement>();
    for (const p of layout.placements) byId.set(p.id, p);

    if (layout.faults.length === 0) {
      lastValidRef.current = byId;
    }

    return {
      placementsById: byId,
      lastValidPlacementsById: lastValidRef.current,
      faults: layout.faults,
      ready: true,
    };
  }, [geometry]);

  useEffect(() => {
    if (!value.ready) return;
    if (value.faults.length === 0) return;
    const placementsArr = Array.from(value.placementsById.values()).map((p) => ({
      id: p.id,
      visible: p.visible,
    }));
    const layoutHash = hashLayout(placementsArr);
    if (layoutHash === lastHashRef.current) return;
    lastHashRef.current = layoutHash;
    const w =
      typeof window !== "undefined" ? window.innerWidth : 0;
    const h = typeof window !== "undefined" ? window.innerHeight : 0;
    emitLayoutFault({
      layoutHash,
      game: "cribbage",
      orientation: orientationFor(w, h),
      viewportBucket: viewportBucketFor(w, h),
      faults: value.faults,
      timestamp: Date.now(),
    });
  }, [value]);

  return (
    <CribbageGameplayGeometryContext.Provider value={value}>
      {children}
    </CribbageGameplayGeometryContext.Provider>
  );
}

export function useCribbageGameplayGeometry(): CribbageGameplayGeometryContextValue {
  return useContext(CribbageGameplayGeometryContext);
}
