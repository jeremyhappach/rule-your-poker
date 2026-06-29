/**
 * Wave 5D — Gin anchored slot (generic).
 *
 * Pure consumer of a single anchored placement from
 * GinRummyGameplayGeometryProvider. Renders children inside an
 * absolutely-positioned div whose rect is the assigned anchored rect
 * in felt-local vmin. Installs the standard center-drift assertion
 * and DOM-bounds contract — same pattern as Wave4PegboardSlot /
 * Wave4CribCutGroupSlot / Wave4PeggingRowSlot.
 *
 * WAVE 5 INVARIANT applies: this slot must mount as a sibling of (or
 * higher than) any transformed ancestor inside the canonical felt
 * frame. Gin's felt has no `translateY(6%)` wrapper so a direct mount
 * inside the felt container is safe.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useGinRummyGameplayGeometry } from "@/lib/wave5GameplayGeometry/GinRummyGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { useCanonicalFeltCoordFrameElement } from "@/lib/canonicalShell/useCanonicalFeltCoordFrameElement";

export interface GinAnchoredSlotProps {
  artifactId: string;
  /** z-index for the rendered slot. Defaults to 20. */
  zIndex?: number;
  /** Optional inline style extensions (display/flex/etc.). */
  innerStyle?: CSSProperties;
  /** Renders nothing when no placement is available (no legacy fallback). */
  children: ReactNode;
}

export function GinAnchoredSlot({
  artifactId,
  zIndex = 20,
  innerStyle,
  children,
}: GinAnchoredSlotProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useGinRummyGameplayGeometry();
  const ref = useRef<HTMLDivElement | null>(null);

  const current = placementsById.get(artifactId);
  const lastValid = lastValidPlacementsById.get(artifactId);
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
    artifactId,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled: !!placement && !!placement.visible && vminInPx > 0,
  });

  // Center-drift assertion (mirrors the Cribbage anchored slots).
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
              tag:
                p.tagName.toLowerCase() +
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
        console.warn(`[wave5d:${artifactId} center-drift]`, {
          assignedRect,
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
    artifactId,
    placement,
    vminInPx,
    assignedRect.x,
    assignedRect.y,
    assignedRect.width,
    assignedRect.height,
  ]);

  if (!placement || !placement.visible || vminInPx <= 0) return null;

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vminInPx);

  return (
    <div
      ref={ref}
      data-wave5-gin-slot={artifactId}
      data-artifact-id={artifactId}
      data-placement-mode="anchored"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-gin-slot-fault-count={String(faults.length)}
      style={{
        position: "absolute",
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        zIndex,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...innerStyle,
      }}
    >
      {children}
    </div>
  );
}

export default GinAnchoredSlot;
