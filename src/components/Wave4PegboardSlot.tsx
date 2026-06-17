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

import { useEffect, useRef, type ReactNode } from "react";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";

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

  // Wave 5D — Pegboard Graduation. The pegboard is always anchored; the
  // DOM-bounds contract is enforced whenever a placement is available.
  useDomBoundsContract(ref, {
    artifactId: PEGBOARD_SLOT_ID,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled:
      !!placement &&
      !!placement.visible &&
      vminInPx > 0,
  });

  // Wave 5D Phase 4A.1 — center-drift diagnostic.
  // Anchored placements MUST equal their rendered DOM rect — no ancestor
  // transform may shift them. Compares assignedRect.centerY to
  // renderedBounds.centerY in felt-local vmin and warns once per session
  // when they diverge by more than 0.5vmin, dumping the ancestor transform
  // chain for the offending DOM root.
  const driftWarnedRef = useRef(false);
  useEffect(() => {
    if (!placement || !placement.visible || vminInPx <= 0) return;
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node) return;
    const raf = requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>(
        "[data-canonical-felt-surface]",
      );
      if (!surface) return;
      const surfRect = surface.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const renderedCenterY = (r.top + r.height / 2 - surfRect.top) / vminInPx;
      const assignedCenterY = assignedRect.y + assignedRect.height / 2;
      const delta = renderedCenterY - assignedCenterY;
      if (Math.abs(delta) > 0.5 && !driftWarnedRef.current) {
        driftWarnedRef.current = true;
        const chain: Array<{ tag: string; transform: string }> = [];
        let p: HTMLElement | null = node.parentElement;
        let hops = 0;
        while (p && hops < 16 && p !== surface) {
          const t = getComputedStyle(p).transform;
          if (t && t !== "none") {
            chain.push({
              tag: p.tagName.toLowerCase() +
                (p.dataset && Object.keys(p.dataset).length
                  ? "[" + Object.keys(p.dataset).slice(0, 2).join(",") + "]"
                  : ""),
              transform: t,
            });
          }
          p = p.parentElement;
          hops += 1;
        }
        // eslint-disable-next-line no-console
        console.warn("[wave5d:pegboard center-drift]", {
          assignedRect,
          renderedBounds: {
            x: (r.left - surfRect.left) / vminInPx,
            y: (r.top - surfRect.top) / vminInPx,
            width: r.width / vminInPx,
            height: r.height / vminInPx,
          },
          assignedCenterY,
          renderedCenterY,
          deltaVmin: delta,
          ancestorTransforms: chain,
        });
      } else if (Math.abs(delta) <= 0.5) {
        driftWarnedRef.current = false;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [
    placement,
    vminInPx,
    assignedRect.x,
    assignedRect.y,
    assignedRect.width,
    assignedRect.height,
  ]);


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
