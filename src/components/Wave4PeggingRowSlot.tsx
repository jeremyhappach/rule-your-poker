/**
 * Wave 5B — Pegging Row Contract Migration
 *
 * First gameplay artifact (after the pegboard) routed through the
 * Wave 4 Artifact Layout Engine. The `cribbage.peggingRow` descriptor
 * is now authoritative for position/size; the previous
 * `absolute top-[68%] left-1/2 -translate-x-1/2` CSS percentage no
 * longer owns geometry.
 *
 * Discipline (mirrors Wave4PegboardSlot):
 *   - Positions only. Visual content (count + played-card row,
 *     overlap, sizes, animations) is untouched and lives in the
 *     existing CribbageFeltContent JSX passed as `children`.
 *   - Emits `wave4:layout_fault` for peggingRow faults but never
 *     special-cases recovery — the resolver is the source of truth.
 *   - Until live geometry resolves OR the resolver collapses the row,
 *     a transparent legacy fallback preserves the previous absolute
 *     placement so the pegging row never disappears mid-hand.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  resolveLayout,
  toVmin,
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

export interface Wave4PeggingRowSlotProps {
  /** Cribbage phase. Pass `'pegging'` whenever the pegging row should
   *  be present (including pegging-win freeze-frame). The descriptor
   *  factory only emits `cribbage.peggingRow` when phase === 'pegging'. */
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  children: ReactNode;
}

export function Wave4PeggingRowSlot({
  phase,
  viewerSeatPosition,
  opponentSeatPositions,
  cutCardRevealed,
  cribVisible,
  children,
}: Wave4PeggingRowSlotProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();

  const descriptors = useMemo(
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

  const layout = useMemo(() => {
    if (!geometry) return null;
    return resolveLayout(descriptors, geometry);
  }, [descriptors, geometry]);

  const placement: ResolvedPlacement | null = useMemo(() => {
    if (!layout) return null;
    return (
      layout.placements.find((p) => p.id === "cribbage.peggingRow") ?? null
    );
  }, [layout]);

  const lastFaultHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layout) return;
    const faults = layout.faults.filter((f) =>
      f.artifactIds.includes("cribbage.peggingRow"),
    );
    if (faults.length === 0) return;
    const hash = hashLayout(layout.placements);
    if (hash === lastFaultHashRef.current) return;
    lastFaultHashRef.current = hash;
    emitLayoutFault({
      layoutHash: hash,
      game: "cribbage",
      orientation:
        typeof window !== "undefined"
          ? orientationFor(window.innerWidth, window.innerHeight)
          : "unknown",
      viewportBucket:
        typeof window !== "undefined"
          ? viewportBucketFor(window.innerWidth, window.innerHeight)
          : "unknown",
      faults,
      timestamp: Date.now(),
    });
  }, [layout]);

  // Fallback: until live geometry resolves OR resolver collapses the
  // pegging row, preserve the legacy positioning so it never
  // disappears mid-hand. The fallback uses the exact pre-Wave 5B
  // wrapper classes.
  if (!placement || !placement.visible || vminInPx <= 0) {
    return (
      <div
        data-wave4-pegging-row-slot="fallback"
        className="absolute top-[68%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3"
      >
        {children}
      </div>
    );
  }

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vminInPx);

  return (
    <div
      data-wave4-pegging-row-slot="resolved"
      data-artifact-id="cribbage.peggingRow"
      style={{
        position: "absolute",
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

export default Wave4PeggingRowSlot;
