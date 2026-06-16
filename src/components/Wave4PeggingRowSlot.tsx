/**
 * Wave 5C — Phase 4B
 * Wave4PeggingRowSlot is now a pure consumer of
 *   CribbageGameplayGeometryProvider.
 *
 * Per the gameplay-column spec invariant:
 *   "Gameplay slots may NEVER call resolveLayout()."
 *
 * This slot positions the count badge + played-card row inside the
 * `cribbage.peggingRow` child placement produced by the provider's
 * `cribbage.gameplayColumn` group. Resolution + telemetry live in
 * the provider — this slot reads only.
 *
 * Fallback policy:
 *   1. current placement (provider, this frame)
 *   2. lastValid placement (provider, last fault-free frame)
 *   3. legacy CSS percentage wrapper (cold-start / pre-measurement)
 *      → Phase 7 removes the legacy fallback.
 *
 * Props are preserved for caller compatibility but are no longer used
 * for descriptor construction — the provider owns descriptors.
 */

import { type ReactNode } from "react";
import { toVmin, type ResolvedPlacement } from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import type { CribbagePhase } from "@/lib/cribbage/cribbageArtifactDescriptors";

export interface Wave4PeggingRowSlotProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  children: ReactNode;
}

const PEGGING_ROW_ID = "cribbage.peggingRow";

export function Wave4PeggingRowSlot({ children }: Wave4PeggingRowSlotProps) {
  const { vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useCribbageGameplayGeometry();

  const current = placementsById.get(PEGGING_ROW_ID);
  const lastValid = lastValidPlacementsById.get(PEGGING_ROW_ID);
  const placement: ResolvedPlacement | undefined =
    current && current.visible ? current : lastValid;

  const usingFallback = !placement || !placement.visible || vminInPx <= 0;

  if (usingFallback) {
    return (
      <div
        data-wave4-pegging-row-slot="fallback"
        data-pegging-row-fallback-used="true"
        data-pegging-row-parent-id={placement?.parentId ?? ""}
        data-pegging-row-fault-count={String(faults.length)}
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
      data-gameplay-column-child="peggingRow"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-pegging-row-parent-id={placement.parentId ?? ""}
      data-pegging-row-rect={`${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`}
      data-pegging-row-fault-count={String(faults.length)}
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
