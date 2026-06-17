/**
 * Wave 5D — ThreeFiveSevenGameplayGeometryProvider.
 *
 * Mirrors the Holm/Yahtzee/Dice/Gin pattern. Wraps the 3-5-7 felt
 * subtree, resolves anchored descriptors once per (descriptors,
 * geometry) frame, exposes placements + the assigned height (vmin)
 * for each stage so children can derive card sizes from
 * `assignedRect.height` (per Wave 5D spec).
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
  resolveLayout,
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
  getThreeFiveSevenArtifactDescriptors,
  type ThreeFiveSevenDescriptorOptions,
} from "@/lib/threeFiveSeven/threeFiveSevenArtifactDescriptors";

export interface ThreeFiveSevenGameplayGeometryContextValue {
  placementsById: ReadonlyMap<string, ResolvedPlacement>;
  lastValidPlacementsById: ReadonlyMap<string, ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  ready: boolean;
  /** Assigned height in vmin for an artifact, or null if not placed. */
  getAssignedHeightVmin: (artifactId: string) => number | null;
}

const EMPTY_MAP: ReadonlyMap<string, ResolvedPlacement> = new Map();

const ThreeFiveSevenGameplayGeometryContext =
  createContext<ThreeFiveSevenGameplayGeometryContextValue>({
    placementsById: EMPTY_MAP,
    lastValidPlacementsById: EMPTY_MAP,
    faults: [],
    ready: false,
    getAssignedHeightVmin: () => null,
  });

export interface ThreeFiveSevenGameplayGeometryProviderProps
  extends ThreeFiveSevenDescriptorOptions {
  children: ReactNode;
}

export function ThreeFiveSevenGameplayGeometryProvider({
  winnerTabledCardsVisible,
  children,
}: ThreeFiveSevenGameplayGeometryProviderProps) {
  const { geometry } = useLiveGeometryConstraints();
  const lastValidRef = useRef<ReadonlyMap<string, ResolvedPlacement>>(EMPTY_MAP);
  const lastHashRef = useRef<string | null>(null);

  const descriptors = useMemo(
    () =>
      getThreeFiveSevenArtifactDescriptors({
        winnerTabledCardsVisible,
      }),
    [winnerTabledCardsVisible],
  );

  const value = useMemo<ThreeFiveSevenGameplayGeometryContextValue>(() => {
    if (!geometry) {
      return {
        placementsById: EMPTY_MAP,
        lastValidPlacementsById: lastValidRef.current,
        faults: [],
        ready: false,
        getAssignedHeightVmin: (id) => {
          const p = lastValidRef.current.get(id);
          return p ? p.rect.height.value : null;
        },
      };
    }
    const layout = resolveLayout(descriptors, geometry);
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
      getAssignedHeightVmin: (id) => {
        const cur = byId.get(id);
        if (cur && cur.visible) return cur.rect.height.value;
        const lv = lastValidRef.current.get(id);
        return lv ? lv.rect.height.value : null;
      },
    };
  }, [geometry, descriptors]);

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
      game: "three-five-seven",
      orientation: orientationFor(w, h),
      viewportBucket: viewportBucketFor(w, h),
      faults: value.faults,
      timestamp: Date.now(),
    });
  }, [value]);

  return (
    <ThreeFiveSevenGameplayGeometryContext.Provider value={value}>
      {children}
    </ThreeFiveSevenGameplayGeometryContext.Provider>
  );
}

export function useThreeFiveSevenGameplayGeometry(): ThreeFiveSevenGameplayGeometryContextValue {
  return useContext(ThreeFiveSevenGameplayGeometryContext);
}
