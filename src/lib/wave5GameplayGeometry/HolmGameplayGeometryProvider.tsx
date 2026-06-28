/**
 * Wave 5D — HolmGameplayGeometryProvider.
 *
 * Wraps the Holm felt subtree, resolves anchored descriptors once per
 * (descriptors, geometry) frame, exposes placements + the assigned
 * height (vmin) for each stage so children can derive card sizes from
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
  getHolmArtifactDescriptors,
  type HolmDescriptorOptions,
} from "@/lib/holm/holmArtifactDescriptors";
import { useDraftedGeometryOverrides, applyGeometryOverrides } from "@/lib/geometryLab/store";
import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";

export interface HolmGameplayGeometryContextValue {
  placementsById: ReadonlyMap<string, ResolvedPlacement>;
  lastValidPlacementsById: ReadonlyMap<string, ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  ready: boolean;
  /** Assigned height in vmin for an artifact, or null if not placed. */
  getAssignedHeightVmin: (artifactId: string) => number | null;
}

const EMPTY_MAP: ReadonlyMap<string, ResolvedPlacement> = new Map();

const HolmGameplayGeometryContext =
  createContext<HolmGameplayGeometryContextValue>({
    placementsById: EMPTY_MAP,
    lastValidPlacementsById: EMPTY_MAP,
    faults: [],
    ready: false,
    getAssignedHeightVmin: () => null,
  });

export interface HolmGameplayGeometryProviderProps
  extends HolmDescriptorOptions {
  children: ReactNode;
}

export function HolmGameplayGeometryProvider({
  communityCardsVisible,
  lonePlayerTabledCardsVisible,
  chuckyVisible,
  children,
}: HolmGameplayGeometryProviderProps) {
  useLifecycleMount('HolmGameplayGeometryProvider', {
    communityCardsVisible,
    lonePlayerTabledCardsVisible,
    chuckyVisible,
  });
  const { geometry } = useLiveGeometryConstraints();
  const lastValidRef = useRef<ReadonlyMap<string, ResolvedPlacement>>(EMPTY_MAP);
  const lastHashRef = useRef<string | null>(null);

  const overrides = useDraftedGeometryOverrides();
  const descriptors = useMemo(
    () =>
      applyGeometryOverrides(
        getHolmArtifactDescriptors({
          communityCardsVisible,
          lonePlayerTabledCardsVisible,
          chuckyVisible,
        }),
        overrides,
      ),
    [communityCardsVisible, lonePlayerTabledCardsVisible, chuckyVisible, overrides],
  );

  const value = useMemo<HolmGameplayGeometryContextValue>(() => {
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
      game: "holm",
      orientation: orientationFor(w, h),
      viewportBucket: viewportBucketFor(w, h),
      faults: value.faults,
      timestamp: Date.now(),
    });
  }, [value]);

  return (
    <HolmGameplayGeometryContext.Provider value={value}>
      {children}
    </HolmGameplayGeometryContext.Provider>
  );
}

export function useHolmGameplayGeometry(): HolmGameplayGeometryContextValue {
  return useContext(HolmGameplayGeometryContext);
}
