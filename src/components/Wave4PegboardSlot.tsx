/**
 * Wave 4 — Phase 5C
 * Wave4PegboardSlot — first live gameplay artifact owned by the layout engine.
 *
 * Responsibilities:
 *   - Build the same Cribbage descriptor set the chrome host uses.
 *   - Resolve layout against live shell geometry.
 *   - Position `children` (the legacy <CribbagePegBoard/>) inside the
 *     resolver-chosen rect for `cribbage.pegboard`.
 *   - Emit `wave4:layout_fault` if the play band cannot accommodate the
 *     descriptor — but never special-case Cribbage to recover.
 *
 * Discipline:
 *   - This file ONLY positions. Visual rendering of the pegboard stays in
 *     <CribbagePegBoard/>. The slot does not measure, mutate descriptors,
 *     or read other artifacts.
 *   - When geometry is not yet ready (very first paint, before the shell
 *     DOM measures) the slot transparently falls back to legacy
 *     positioning so the pegboard never disappears mid-game.
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

export interface Wave4PegboardSlotProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  children: ReactNode;
}

export function Wave4PegboardSlot({
  phase,
  viewerSeatPosition,
  opponentSeatPositions,
  cutCardRevealed,
  cribVisible,
  children,
}: Wave4PegboardSlotProps) {
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
    return layout.placements.find((p) => p.id === "cribbage.pegboard") ?? null;
  }, [layout]);

  const lastFaultHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layout) return;
    const pegFaults = layout.faults.filter((f) =>
      f.artifactIds.includes("cribbage.pegboard"),
    );
    if (pegFaults.length === 0) return;
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
      faults: pegFaults,
      timestamp: Date.now(),
    });
  }, [layout]);

  // Fallback: until live geometry resolves OR resolver collapses the
  // pegboard (which is illegal — collapsePriority: 'last'), preserve the
  // legacy positioning so the pegboard remains visible. The fallback uses
  // the exact pre-Wave4 wrapper classes.
  if (!placement || !placement.visible || vminInPx <= 0) {
    return (
      <div
        data-wave4-pegboard-slot="fallback"
        className="absolute top-[52%] left-6 right-6 -translate-y-1/2 z-10"
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
      data-wave4-pegboard-slot="resolved"
      data-artifact-id="cribbage.pegboard"
      style={{
        position: "absolute",
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "stretch",
      }}
    >
      <div style={{ width: "100%" }}>{children}</div>
    </div>
  );
}

export default Wave4PegboardSlot;
