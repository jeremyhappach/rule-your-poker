/**
 * Wave 5D — 3-5-7 anchored slot.
 *
 * Pure consumer of a single anchored placement from
 * ThreeFiveSevenGameplayGeometryProvider. Mirrors the
 * Yahtzee/Dice/Gin/Holm slot pattern, installs the standard
 * DOM-bounds contract + center-drift assertion.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useThreeFiveSevenGameplayGeometry } from "@/lib/wave5GameplayGeometry/ThreeFiveSevenGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { useCanonicalFeltCoordFrameElement } from "@/lib/canonicalShell/useCanonicalFeltCoordFrameElement";

export interface ThreeFiveSevenAnchoredSlotProps {
  artifactId: string;
  zIndex?: number;
  innerStyle?: CSSProperties;
  children: ReactNode;
}

export const ThreeFiveSevenAnchoredSlot = forwardRef<
  HTMLDivElement,
  ThreeFiveSevenAnchoredSlotProps
>(function ThreeFiveSevenAnchoredSlot(
  { artifactId, zIndex = 20, innerStyle, children },
  forwardedRef,
) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useThreeFiveSevenGameplayGeometry();
  const coordFrame = useCanonicalFeltCoordFrameElement(true);
  const ref = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

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
        // eslint-disable-next-line no-console
        console.warn(`[wave5d:${artifactId} center-drift]`, {
          assignedRect,
          assignedCenterY,
          renderedCenterY,
          deltaVmin: delta,
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
  if (!coordFrame) return null;

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vmin​InPx);

  return createPortal(
    <div
      ref={ref}
      data-wave5-three-five-seven-slot={artifactId}
      data-artifact-id={artifactId}
      data-placement-mode="anchored"
      data-placement-frame="felt-coord-frame"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-three-five-seven-slot-fault-count={String(faults.length)}
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
        pointerEvents: "auto",
        ...innerStyle,
      }}
    >
      {children}
    </div>,
    coordFrame,
  );
});

export default ThreeFiveSevenAnchoredSlot;
