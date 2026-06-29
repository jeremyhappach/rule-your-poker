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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAVE 5 INVARIANT — anchored artifacts MUST NOT mount beneath
 * transformed ancestors.
 *
 * Anchored geometry is contractual: the resolver's assigned rect (in
 * felt-local vmin) MUST equal the rendered DOM rect (in felt-local vmin).
 * Any ancestor with a non-identity CSS `transform` silently shifts the
 * DOM rect out of the coordinate system the resolver computed against,
 * breaking the contract without producing a `wave4:layout_fault`
 * (only a `wave5d:center-drift` warning, which is post-hoc).
 *
 * Discovered: Pegboard Graduation (Phase 4A.1) — fixed by mounting
 *   Wave4PegboardSlot as a sibling of the `translateY(6%)` felt-content
 *   wrapper in CribbageMobileGameTable.
 * Confirmed: CribCutGroup Graduation — same root cause, same fix.
 *
 * Rule for ALL future anchored migrations
 * (PeggingRow, CountingRow, Holm pot, Gin discard, dice ledgers, etc.):
 *
 *   1. The anchored slot DOM root must be a sibling of (or higher than)
 *      any ancestor that applies a CSS `transform`, `filter`, or
 *      `perspective`. Use the canonical felt-frame relative box
 *      (the container that owns `[data-canonical-felt-surface]`).
 *   2. The slot itself may apply transforms ONLY for cosmetic effects
 *      that do not displace its bounding rect (rotations of inner
 *      content, scale on hover, etc. — never translateX/Y on the slot
 *      root).
 *   3. Every anchored slot installs the `useDomBoundsContract` hook
 *      AND a `wave5d:center-drift` assertion (see below) so any
 *      regression is loud, not silent.
 *
 * If you find yourself wanting to mount an anchored slot inside an
 * existing transformed wrapper because "it's easier" — stop. Lift the
 * mount. The Pegboard and CribCutGroup migrations both spent a round
 * trip chasing a phantom resolver bug that was actually one parent div
 * with `transform: translateY(6%)`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { useCanonicalFeltCoordFrameElement } from "@/lib/canonicalShell/useCanonicalFeltCoordFrameElement";

const CRIB_CUT_GROUP_ID = "cribbage.cribCutGroup";

export interface Wave4CribCutGroupSlotProps {
  children: ReactNode;
  /** Inline CSS-variable overrides applied to the slot root (e.g. `--cribcut-gap`). */
  styleVars?: React.CSSProperties;
}

export function Wave4CribCutGroupSlot({ children, styleVars }: Wave4CribCutGroupSlotProps) {

  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById } =
    useCribbageGameplayGeometry();
  const coordFrame = useCanonicalFeltCoordFrameElement(true);
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

  // Wave 5D — center-drift assertion (mirrors Wave4PegboardSlot).
  // Anchored placements MUST equal their rendered DOM rect — no ancestor
  // transform may shift them. Compares assignedRect.centerY to
  // renderedBounds.centerY in felt-local vmin and warns once per session
  // when they diverge by more than 0.5 vmin, dumping the ancestor
  // transform chain for the offending DOM root. See WAVE 5 INVARIANT.
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
        console.warn("[wave5d:cribCutGroup center-drift]", {
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
        gap: "var(--cribcut-gap, 1rem)",
        ...(styleVars ?? {}),
      }}


    >
      {children}
    </div>
  );
}

export default Wave4CribCutGroupSlot;
