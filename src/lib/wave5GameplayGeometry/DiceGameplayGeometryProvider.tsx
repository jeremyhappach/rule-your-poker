/**
 * Wave 5D — DiceGameplayGeometryProvider (Horses + SCC).
 *
 * Mirrors YahtzeeGameplayGeometryProvider. Wraps the dice-game felt
 * subtree (MobileGameTable's Horses/SCC felt area), resolves anchored
 * descriptors once per (descriptors, geometry) frame, exposes
 * placements to consumers via context.
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
  getDiceArtifactDescriptors,
  type DiceDescriptorOptions,
} from "@/lib/dice/diceArtifactDescriptors";

export interface DiceGameplayGeometryContextValue {
  placementsById: ReadonlyMap<string, ResolvedPlacement>;
  lastValidPlacementsById: ReadonlyMap<string, ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  ready: boolean;
}

const EMPTY_MAP: ReadonlyMap<string, ResolvedPlacement> = new Map();

const DiceGameplayGeometryContext =
  createContext<DiceGameplayGeometryContextValue>({
    placementsById: EMPTY_MAP,
    lastValidPlacementsById: EMPTY_MAP,
    faults: [],
    ready: false,
  });

export interface DiceGameplayGeometryProviderProps
  extends DiceDescriptorOptions {
  children: ReactNode;
}

export function DiceGameplayGeometryProvider({
  gameType,
  opponentDiceVisible,
  beatBadgeVisible,
  children,
}: DiceGameplayGeometryProviderProps) {
  const { geometry } = useLiveGeometryConstraints();
  const lastValidRef = useRef<ReadonlyMap<string, ResolvedPlacement>>(EMPTY_MAP);
  const lastHashRef = useRef<string | null>(null);

  const descriptors = useMemo(
    () =>
      getDiceArtifactDescriptors({
        gameType,
        opponentDiceVisible,
        beatBadgeVisible,
      }),
    [gameType, opponentDiceVisible, beatBadgeVisible],
  );

  const value = useMemo<DiceGameplayGeometryContextValue>(() => {
    if (!geometry) {
      return {
        placementsById: EMPTY_MAP,
        lastValidPlacementsById: lastValidRef.current,
        faults: [],
        ready: false,
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
      game: gameType,
      orientation: orientationFor(w, h),
      viewportBucket: viewportBucketFor(w, h),
      faults: value.faults,
      timestamp: Date.now(),
    });
  }, [value, gameType]);

  return (
    <DiceGameplayGeometryContext.Provider value={value}>
      {children}
    </DiceGameplayGeometryContext.Provider>
  );
}

export function useDiceGameplayGeometry(): DiceGameplayGeometryContextValue {
  return useContext(DiceGameplayGeometryContext);
}
