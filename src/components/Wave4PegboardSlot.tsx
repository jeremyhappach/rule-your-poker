/**
 * Wave 5C — Phase 4A
 * Wave4PegboardSlot now consumes CribbageGameplayGeometryProvider.
 *
 * Per the gameplay-column spec invariant:
 *   "Gameplay slots may NEVER call resolveLayout()."
 *
 * This slot positions <CribbagePegBoard/> using the `pegboard` child
 * placement produced by the provider's `cribbage.gameplayColumn` group.
 * Resolution + telemetry now live in the provider; this slot is a pure
 * consumer.
 *
 * Fallback policy (per spec):
 *   1. current placement (provider, this frame)
 *   2. lastValid placement (provider, last fault-free frame)
 *   3. legacy CSS percentage wrapper (cold-start / pre-measurement)
 *
 * Props are preserved for caller compatibility but are no longer used
 * for descriptor construction — the provider owns descriptors.
 */

import { useRef, type ReactNode } from "react";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { useCribbageAnchoredPegboardFlag } from "@/lib/wave5d/cribbageAnchoredPegboardFlag";
import type { CribbagePhase } from "@/lib/cribbage/cribbageArtifactDescriptors";

export interface Wave4PegboardSlotProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  children: ReactNode;
}

const PEGBOARD_SLOT_ID = "cribbage.pegboard";

export function Wave4PegboardSlot({ children }: Wave4PegboardSlotProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById } =
    useCribbageGameplayGeometry();
  const anchoredPegboardOn = useCribbageAnchoredPegboardFlag();
  const ref = useRef<HTMLDivElement | null>(null);

  const current = placementsById.get(PEGBOARD_SLOT_ID);
  const lastValid = lastValidPlacementsById.get(PEGBOARD_SLOT_ID);
  const placement: ResolvedPlacement | undefined =
    current && current.visible ? current : lastValid;

  const viewport = geometry
    ? deriveAvailableGameplayViewport(geometry).viewport
    : null;

  const assignedRect = placement
    ? {
        x: placement.rect.x.value,
        y: placement.rect.y.value,
        width: placement.rect.width.value,
        height: placement.rect.height.value,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  const viewportRect = viewport
    ? {
        x: viewport.rect.x.value,
        y: viewport.rect.y.value,
        width: viewport.rect.width.value,
        height: viewport.rect.height.value,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  // Wave 5D Phase 3 contract enforcement — only active for the anchored
  // pegboard. The legacy column-resolved pegboard already negotiates inside
  // the play band and is not subject to the anchored viewport contract.
  useDomBoundsContract(ref, {
    artifactId: PEGBOARD_SLOT_ID,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled:
      anchoredPegboardOn &&
      !!placement &&
      !!placement.visible &&
      vminInPx > 0,
  });

  if (!placement || !placement.visible || vminInPx <= 0) {
    return (
      <div
        ref={ref}
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
      ref={ref}
      data-wave4-pegboard-slot="resolved"
      data-artifact-id="cribbage.pegboard"
      data-gameplay-column-child="pegboard"
      data-placement-mode={anchoredPegboardOn ? "anchored" : "column"}
      data-placement-source={current && current.visible ? "current" : "lastValid"}
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
