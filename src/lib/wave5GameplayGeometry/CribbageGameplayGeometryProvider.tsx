/**
 * Wave 5C — Phase 4B.0
 * CribbageGameplayGeometryProvider — descriptor unification.
 *
 * The provider no longer fabricates synthetic placeholder leaves. Instead it
 * consumes the canonical Cribbage gameplay descriptors emitted by
 *   getCribbageArtifactDescriptors(...)
 * and wraps the gameplay-column subset in:
 *
 *     cribbage.gameplayColumn (axis=y, clampToBand)
 *       ├─ cribbage.pegboard
 *       ├─ gapA
 *       ├─ cribbage.cribCutGroup (axis=x)
 *       │   ├─ cribbage.crib
 *       │   ├─ innerGap
 *       │   └─ cribbage.cutCard
 *       ├─ gapB
 *       └─ cribbage.peggingRow OR cribbage.countingRow
 *
 * Invariant: leaves referenced by the column are passed to
 * resolveLayoutWithGroups, which excludes them from any standalone top-level
 * band solve. There is exactly one descriptor set, one solve, one placement
 * hash, many consumers.
 *
 * Phase 4B.0 scope:
 *   - Pegboard already consumes this provider (Phase 4A).
 *   - PeggingRow / Counting / Crib / Cut remain on their current paths.
 *   - This change corrects the rects the provider emits to canonical values.
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
  type GroupChildSlot,
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
import {
  getCribbageArtifactDescriptors,
  type CribbagePhase,
} from "@/lib/cribbage/cribbageArtifactDescriptors";


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
// Gameplay-column leaf ids consumed from the canonical descriptor factory.
// ---------------------------------------------------------------------------

const PEGBOARD_ID = "cribbage.pegboard";
const CRIB_ID = "cribbage.crib";
const CUT_CARD_ID = "cribbage.cutCard";
const PEGGING_ROW_ID = "cribbage.peggingRow";
const COUNTING_ROW_ID = "cribbage.countingRow";
const CRIB_CUT_GROUP_ID = "cribbage.cribCutGroup";
const GAMEPLAY_COLUMN_ID = "cribbage.gameplayColumn";

const GAMEPLAY_COLUMN_LEAF_IDS = new Set<string>([
  PEGBOARD_ID,
  CRIB_CUT_GROUP_ID,
  PEGGING_ROW_ID,
  COUNTING_ROW_ID,
]);

// Wave 5D — PeggingRow graduated to anchored. It remains in the leaf set so
// the resolver solves its standalone anchored descriptor, but it is excluded
// from the column group below (no flow participation, no XOR with counting).
const COLUMN_GROUP_EXCLUDED_IDS = new Set<string>([
  PEGBOARD_ID,
  CRIB_CUT_GROUP_ID,
  PEGGING_ROW_ID,
]);

function buildColumnGroup(
  leavesById: ReadonlyMap<string, ArtifactDescriptor>,
  opts: { includePegboard: boolean },
): GroupDescriptor {
  // Wave 5D — CribCutGroup graduated to an anchored leaf. The inner
  // crib/cut group no longer participates in the column negotiation.

  // Outer column (axis=y). Children are declared in fixed visual order;
  // priority NEVER reorders.
  const columnChildren: GroupChildSlot[] = [];

  if (opts.includePegboard && leavesById.has(PEGBOARD_ID)) {
    columnChildren.push({
      id: PEGBOARD_ID,
      kind: "leaf",
      leafRef: PEGBOARD_ID,
      shrinkOrder: 4,
      collapseOrder: 4,
    });
  }

  columnChildren.push({
    id: "gapA",
    kind: "gap",
    weight: 1,
    shrinkOrder: 1,
    collapseOrder: 1,
  });

  columnChildren.push({
    id: "gapB",
    kind: "gap",
    weight: 1,
    shrinkOrder: 1,
    collapseOrder: 1,
  });

  // Wave 5D — PeggingRow graduated to anchored. Only countingRow
  // participates in the column flow now.
  if (leavesById.has(COUNTING_ROW_ID)) {
    columnChildren.push({
      id: COUNTING_ROW_ID,
      kind: "leaf",
      leafRef: COUNTING_ROW_ID,
      shrinkOrder: 5,
      collapseOrder: "never",
    });
  }

  return {
    id: GAMEPLAY_COLUMN_ID,
    owner: "cribbage",
    band: "play",
    composeMode: "group",
    axis: "y",
    clampToBand: true,
    children: columnChildren,
  };
}

export interface CribbageGameplayGeometryProviderProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  children: ReactNode;
}

export function CribbageGameplayGeometryProvider({
  phase,
  viewerSeatPosition,
  opponentSeatPositions,
  cutCardRevealed,
  cribVisible,
  children,
}: CribbageGameplayGeometryProviderProps) {
  const { geometry } = useLiveGeometryConstraints();
  const lastValidRef = useRef<ReadonlyMap<string, ResolvedPlacement>>(EMPTY_MAP);
  const lastHashRef = useRef<string | null>(null);

  // Canonical descriptors — single source of truth.
  const canonicalDescriptors = useMemo(
    () =>
      getCribbageArtifactDescriptors({
        phase,
        viewerSeatPosition,
        opponentSeatPositions,
        cutCardRevealed,
        cribVisible,
      }),
    [
      phase,
      viewerSeatPosition,
      opponentSeatPositions,
      cutCardRevealed,
      cribVisible,
    ],
  );

  // Filter to gameplay-column leaves only. Other descriptors (topHud, tabs,
  // myHand, seat-projected, etc.) are owned by their own pipelines and must
  // NOT be solved by this provider.
  //
  // Wave 5D — Pegboard Graduation: the pegboard is now ALWAYS anchored, so
  // it is included in `columnLeaves` (resolveLayoutWithGroups solves it as
  // a standalone anchored descriptor) but excluded from the column group's
  // children — the column negotiates without it.
  const columnLeaves = useMemo(
    () =>
      canonicalDescriptors.filter((d) => GAMEPLAY_COLUMN_LEAF_IDS.has(d.id)),
    [canonicalDescriptors],
  );

  const leavesById = useMemo(() => {
    const m = new Map<string, ArtifactDescriptor>();
    for (const d of columnLeaves) m.set(d.id, d);
    return m;
  }, [columnLeaves]);

  const groups = useMemo<GroupDescriptor[]>(
    () => [buildColumnGroup(leavesById, { includePegboard: false })],
    [leavesById],
  );

  const value = useMemo<CribbageGameplayGeometryContextValue>(() => {
    if (!geometry) {
      return {
        placementsById: EMPTY_MAP,
        lastValidPlacementsById: lastValidRef.current,
        faults: [],
        ready: false,
      };
    }

    // resolveLayoutWithGroups excludes group-referenced leaves from the
    // standalone solve. Pass the column leaves so the resolver can look them
    // up — they will NOT be solved as independent top-level flow items.
    const layout = resolveLayoutWithGroups(columnLeaves, groups, geometry);
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
  }, [geometry, columnLeaves, groups]);

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
    const w = typeof window !== "undefined" ? window.innerWidth : 0;
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
