/**
 * Wave 5D — CribCutGroup Migration.
 *
 * Wave4CribCutGroupSlot positions the crib pile + cut card row using the
 * anchored `cribbage.cribCutGroup` placement from
 * CribbageGameplayGeometryProvider.
 *
 * Contract:
 *   center(crib).y == center(cut).y == anchorY * availableGameplayViewport.height
 *
 * The slot is a `display: flex; align-items: center; justify-content: center`
 * container occupying the assigned rect. Children render at intrinsic size
 * and are vertically centered, so their visual centers all align to the
 * rect's vertical center — which (with anchorOrigin: "center") equals
 * anchorY * viewport.height.
 *
 * Pure consumer: never calls resolveLayout. Falls back to the previous
 * CSS percentage wrapper before the first measurement.
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

const CRIB_CUT_GROUP_ID = "cribbage.cribCutGroup";

export interface Wave4CribCutGroupSlotProps {
  children: ReactNode;
}

export function Wave4CribCutGroupSlot({ children }: Wave4CribCutGroupSlotProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById } =
    useCribbageGameplayGeometry();
  const ref = useRef<HTMLDivElement | null>(null);

  const current = placementsById.get(CRIB_CUT_GROUP_ID);
  const lastValid = lastValidPlacementsById.get(CRIB_CUT_GROUP_ID);
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

  useDomBoundsContract(ref, {
    artifactId: CRIB_CUT_GROUP_ID,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled: !!placement && !!placement.visible && vminInPx > 0,
  });

  if (!placement || !placement.visible || vminInPx <= 0) {
    // Legacy CSS fallback — preserves prior visual position pre-measurement.
    return (
      <div
        ref={ref}
        data-wave4-cribcut-slot="fallback"
        className="absolute top-[17%] left-1/2 -translate-x-1/2 z-30 flex items-center justify-center gap-4"
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
      data-wave4-cribcut-slot="resolved"
      data-artifact-id="cribbage.cribCutGroup"
      data-placement-mode="anchored"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      style={{
        position: "absolute",
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
      }}
    >
      {children}
    </div>
  );
}

export default Wave4CribCutGroupSlot;
