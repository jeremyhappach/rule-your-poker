/**
 * Wave 4 — Phase 5
 * ArtifactHost — the only consumer of the resolver in render space.
 *
 * Responsibilities:
 *   1. Run the pure LayoutResolver against the supplied descriptors
 *      and structural GeometryConstraints.
 *   2. Convert each ResolvedPlacement.rect into a positioned CSS box
 *      (in vmin units — px inputs are normalized via feltVminInPx).
 *   3. Hand the artifact author a render prop with `(descriptor, resolved)`.
 *      Authors receive ONLY their own rect + visibility + per-artifact
 *      fault state. They never see viewport, other artifacts, safe areas,
 *      seat ring geometry, the constraints object, or the resolver itself.
 *   4. Surface unresolved layout faults via an optional callback so the
 *      shell HUD can emit `wave4:layout_fault` diagnostics.
 *
 * Discipline:
 *   - This file is the ONLY place layout flows from descriptors → rects
 *     → DOM. Artifacts do not negotiate. Artifacts do not measure.
 *   - The host does not own geometry. It consumes GeometryConstraints
 *     produced by the canonical shell (Wave 3) and forwards them to the
 *     resolver, unmodified.
 *   - The host does not mutate descriptors. It is a pure projection.
 *   - No `if (game === 'x')` branches. The host is game-agnostic.
 *
 * Spec: .lovable/wave4-artifact-layout-engine/phase2-resolver-spec.md
 */

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { resolveLayout } from "./resolver";
import { toVmin } from "./units";
import type {
  ArtifactDescriptor,
  GeometryConstraints,
  LayoutFault,
  Rect,
  ResolvedLayout,
  ResolvedPlacement,
} from "./types";

/**
 * Per-artifact slice handed to the render prop. Intentionally narrow.
 * Authors get only what is needed to render themselves.
 */
export interface RenderedArtifact {
  /** Final rect, normalized to vmin. */
  rect: Rect;
  /** False when the resolver collapsed this artifact (pressure / overlay / dependency). */
  visible: boolean;
  /** Reason for collapse, if any. */
  collapsedReason?: ResolvedPlacement["collapsedReason"];
  /** True when the resolver honored the descriptor's aspectRatio. */
  appliedAspectRatio: boolean;
  /** Faults referencing this artifact (subset of ResolvedLayout.faults). */
  faults: ReadonlyArray<LayoutFault>;
  /**
   * Inline style positioning the artifact inside the felt. The host
   * computes this once so artifact authors do not touch geometry.
   * Position is `absolute`; size uses vmin. Hidden artifacts get
   * `display: none` so they neither render nor take pointer events.
   */
  style: CSSProperties;
}

export interface ArtifactHostProps {
  descriptors: ReadonlyArray<ArtifactDescriptor>;
  constraints: GeometryConstraints;
  /**
   * Size of 1 vmin in CSS pixels for the current felt. Used ONLY to
   * normalize any `px`-unit lengths supplied by descriptors or geometry
   * into vmin. The host never reads the viewport itself; the caller
   * (felt shell) supplies this from Wave 3 geometry.
   *
   * Defaults to 1 — safe when every descriptor/geometry value is vmin.
   */
  feltVminInPx?: number;
  /**
   * Render prop. Called once per descriptor, in input order.
   * Returning `null` is allowed (e.g. when `resolved.visible` is false
   * and the author opts out).
   */
  renderArtifact: (
    descriptor: ArtifactDescriptor,
    resolved: RenderedArtifact,
  ) => ReactNode;
  /**
   * Called whenever the resolver emits faults. The host does not log;
   * the shell HUD does. This keeps the host free of console writes.
   */
  onFaults?: (faults: ReadonlyArray<LayoutFault>, layout: ResolvedLayout) => void;
  /** Optional class applied to the host wrapper. */
  className?: string;
  /** Optional inline style merged into the host wrapper. */
  style?: CSSProperties;
}

/**
 * Build the absolute-positioned style for a placement. Length values
 * normalize to vmin; px inputs are converted using `feltVminInPx`.
 */
function placementToStyle(
  placement: ResolvedPlacement,
  feltVminInPx: number,
): CSSProperties {
  const x = toVmin(placement.rect.x, feltVminInPx);
  const y = toVmin(placement.rect.y, feltVminInPx);
  const w = toVmin(placement.rect.width, feltVminInPx);
  const h = toVmin(placement.rect.height, feltVminInPx);

  if (!placement.visible) {
    return { display: "none" };
  }

  return {
    position: "absolute",
    left: `${x}vmin`,
    top: `${y}vmin`,
    width: `${w}vmin`,
    height: `${h}vmin`,
  };
}

/**
 * ArtifactHost — pure projection of (descriptors, constraints) into
 * positioned render-prop calls.
 */
export function ArtifactHost({
  descriptors,
  constraints,
  feltVminInPx = 1,
  renderArtifact,
  onFaults,
  className,
  style,
}: ArtifactHostProps) {
  const layout = useMemo<ResolvedLayout>(
    () => resolveLayout(descriptors, constraints),
    [descriptors, constraints],
  );

  // Index placements + faults by artifact id for O(1) lookup during the
  // render-prop walk. We do NOT mutate the resolver output.
  const placementsById = useMemo(() => {
    const map = new Map<string, ResolvedPlacement>();
    for (const p of layout.placements) map.set(p.id, p);
    return map;
  }, [layout]);

  const faultsById = useMemo(() => {
    const map = new Map<string, LayoutFault[]>();
    for (const f of layout.faults) {
      for (const id of f.artifactIds) {
        const list = map.get(id);
        if (list) list.push(f);
        else map.set(id, [f]);
      }
    }
    return map;
  }, [layout]);

  // Surface faults to the shell. Effect-free callback — the host does
  // not log on its own.
  useMemo(() => {
    if (onFaults && layout.faults.length > 0) {
      onFaults(layout.faults, layout);
    }
    // Intentionally derived in useMemo so the callback fires once per
    // resolved layout, not once per render. We don't need a return value.
    return null;
  }, [layout, onFaults]);

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, ...style }}
      data-wave4-artifact-host=""
    >
      {descriptors.map((descriptor) => {
        const placement = placementsById.get(descriptor.id);
        const faults = faultsById.get(descriptor.id) ?? [];

        // Descriptor was rejected at validation (Stage A). Surface as a
        // hidden artifact with the fault attached so the author can opt
        // to render a fallback.
        if (!placement) {
          const rendered: RenderedArtifact = {
            rect: descriptor.preferredSize
              ? {
                  x: { value: 0, unit: "vmin" },
                  y: { value: 0, unit: "vmin" },
                  width: descriptor.preferredSize.width,
                  height: descriptor.preferredSize.height,
                }
              : {
                  x: { value: 0, unit: "vmin" },
                  y: { value: 0, unit: "vmin" },
                  width: { value: 0, unit: "vmin" },
                  height: { value: 0, unit: "vmin" },
                },
            visible: false,
            collapsedReason: "dependencyMissing",
            appliedAspectRatio: false,
            faults,
            style: { display: "none" },
          };
          return (
            <ArtifactSlot key={descriptor.id} id={descriptor.id}>
              {renderArtifact(descriptor, rendered)}
            </ArtifactSlot>
          );
        }

        const rendered: RenderedArtifact = {
          rect: placement.rect,
          visible: placement.visible,
          collapsedReason: placement.collapsedReason,
          appliedAspectRatio: placement.appliedAspectRatio,
          faults,
          style: placementToStyle(placement, feltVminInPx),
        };

        return (
          <ArtifactSlot key={descriptor.id} id={descriptor.id}>
            {renderArtifact(descriptor, rendered)}
          </ArtifactSlot>
        );
      })}
    </div>
  );
}

/**
 * Thin wrapper that tags every artifact for diagnostics without
 * imposing its own layout. The author's returned node controls its
 * own DOM; the host's positioning style is delivered via
 * `rendered.style` and applied by the author on the artifact's root.
 *
 * Using a Fragment here would prevent stable keying for React's
 * reconciliation when descriptors reorder, so we keep a minimal
 * `<div data-artifact-id>` shell.
 */
function ArtifactSlot({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <div data-artifact-id={id} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

export default ArtifactHost;
