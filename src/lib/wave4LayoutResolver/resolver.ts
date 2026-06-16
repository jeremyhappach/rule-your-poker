/**
 * Wave 4 — Phase 3
 * LayoutResolver — pure function.
 *
 * Inputs:   ArtifactDescriptor[] + GeometryConstraints
 * Output:   ResolvedLayout (placements + faults + echoed geometry)
 *
 * Discipline:
 *   - No DOM measurement.
 *   - No React hooks.
 *   - No game imports.
 *   - No viewport reads.
 *   - No side effects.
 *   - No iteration / feedback loops. Single forward pass.
 *   - No game-specific branches.
 *
 * Spec: .lovable/wave4-artifact-layout-engine/phase2-resolver-spec.md
 */

import type {
  ArtifactDescriptor,
  BandId,
  CollapsePriority,
  GeometryConstraints,
  GroupAxis,
  GroupChildSlot,
  GroupDescriptor,
  LayoutFault,
  Rect,
  ResolvedLayout,
  ResolvedPlacement,
} from "./types";
import { EPSILON_VMIN, rectContains, rectsIntersect, vmin } from "./units";

const COLLAPSE_ORDER: CollapsePriority[] = [
  "first",
  "early",
  "mid",
  "late",
  "last",
  "never",
];

const COLLAPSE_RANK: Record<CollapsePriority, number> =
  COLLAPSE_ORDER.reduce(
    (acc, p, i) => {
      acc[p] = i;
      return acc;
    },
    {} as Record<CollapsePriority, number>,
  );

// Internal flat-vmin geometry used during solve.
interface FlatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectToFlat(r: Rect): FlatRect {
  // The resolver assumes all geometry has already been normalized to vmin
  // by the caller (Phase 4 felt host). `px` inputs at this layer are
  // treated as opaque numbers in their own unit.
  return {
    x: r.x.value,
    y: r.y.value,
    width: r.width.value,
    height: r.height.value,
  };
}

function flatToRect(f: FlatRect): Rect {
  return {
    x: vmin(f.x),
    y: vmin(f.y),
    width: vmin(f.width),
    height: vmin(f.height),
  };
}

function bandIsXDominant(band: FlatRect): boolean {
  return band.width >= band.height;
}

function tieSortById(a: ArtifactDescriptor, b: ArtifactDescriptor): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Validate a single descriptor against structural rules. Returns a fault
 * if the descriptor must be excluded from later stages.
 */
function validateDescriptor(
  d: ArtifactDescriptor,
  geometry: GeometryConstraints,
): LayoutFault | null {
  if (d.band === "outerRail") {
    return {
      code: "descriptor_targets_structural_band",
      artifactIds: [d.id],
      band: d.band,
      message: `Descriptor ${d.id} targets structural band 'outerRail'.`,
    };
  }

  if (d.safeAreaDependencies) {
    for (const dep of d.safeAreaDependencies) {
      const present = bandRectFor(dep, geometry);
      if (!present) {
        return {
          code: "missing_safe_area_dependency",
          artifactIds: [d.id],
          band: dep,
          message: `Descriptor ${d.id} depends on missing safe area '${dep}'.`,
        };
      }
    }
  }

  if (d.protectedArea && d.composeMode === "flow") {
    const bandRect = bandRectFor(d.band, geometry);
    if (bandRect) {
      const band = rectToFlat(bandRect);
      const prot = rectToFlat(d.protectedArea);
      if (!rectContains(band, prot)) {
        return {
          code: "protected_area_outside_band",
          artifactIds: [d.id],
          band: d.band,
          message: `Descriptor ${d.id} protectedArea lies outside band '${d.band}'.`,
        };
      }
    }
  }

  return null;
}

function bandRectFor(
  band: BandId,
  geometry: GeometryConstraints,
): Rect | null {
  switch (band) {
    case "topHud":
      return geometry.topHudReserve;
    case "announcement":
      return geometry.announcementBand;
    case "play":
      return geometry.playBand;
    case "bottomHud":
      return geometry.bottomHudReserve;
    default:
      return null;
  }
}

interface BandSolveResult {
  placements: ResolvedPlacement[];
  faults: LayoutFault[];
}

function solveBand(
  band: BandId,
  bandRect: FlatRect,
  descriptors: ArtifactDescriptor[],
  extraReservedRects: FlatRect[] = [],
): BandSolveResult {
  const placements: ResolvedPlacement[] = [];
  const faults: LayoutFault[] = [];
  if (descriptors.length === 0 && extraReservedRects.length === 0)
    return { placements, faults };

  const xDominant = bandIsXDominant(bandRect);
  const primaryExtent = xDominant ? bandRect.width : bandRect.height;
  const crossExtent = xDominant ? bandRect.height : bandRect.width;

  // Reserve protected areas first: subtract from available extent along primary.
  let reservedPrimary = 0;
  const reservedRects: FlatRect[] = [];
  // Centerpiece-injected reservations (already in felt-vmin coords).
  for (const extra of extraReservedRects) {
    reservedRects.push(extra);
    reservedPrimary += xDominant ? extra.width : extra.height;
  }
  for (const d of descriptors) {
    if (!d.protectedArea) continue;
    const prot = rectToFlat(d.protectedArea);
    // overlap check between reserved rects
    for (const existing of reservedRects) {
      if (rectsIntersect(existing, prot)) {
        faults.push({
          code: "protected_area_overlap",
          artifactIds: [d.id],
          band,
          message: `Protected area for ${d.id} overlaps another in band '${band}'.`,
        });
      }
    }
    reservedRects.push(prot);
    reservedPrimary += xDominant ? prot.width : prot.height;
  }

  const availablePrimary = Math.max(0, primaryExtent - reservedPrimary);

  // Sort by priority desc; tie-break by id asc.
  const sorted = [...descriptors].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return tieSortById(a, b);
  });

  // Per-descriptor working sizes along primary axis.
  type Slot = {
    d: ArtifactDescriptor;
    preferred: number;
    minimum: number;
    crossPreferred: number;
    crossMinimum: number;
    allocated: number;
    visible: boolean;
    collapsedReason?: "pressure";
  };

  const slots: Slot[] = sorted.map((d) => {
    const prefP = xDominant ? d.preferredSize.width.value : d.preferredSize.height.value;
    const minP = xDominant ? d.minimumSize.width.value : d.minimumSize.height.value;
    const prefC = xDominant ? d.preferredSize.height.value : d.preferredSize.width.value;
    const minC = xDominant ? d.minimumSize.height.value : d.minimumSize.width.value;
    return {
      d,
      preferred: prefP,
      minimum: minP,
      crossPreferred: prefC,
      crossMinimum: minC,
      allocated: prefP,
      visible: true,
    };
  });

  let totalPreferred = slots.reduce((s, x) => s + x.preferred, 0);

  if (totalPreferred <= availablePrimary + EPSILON_VMIN) {
    // Fits. Distribute slack proportionally to (100 - priority).
    const slack = availablePrimary - totalPreferred;
    const weights = slots.map((s) => Math.max(0, 100 - s.d.priority));
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (slack > 0 && totalW > 0) {
      slots.forEach((s, i) => {
        s.allocated = s.preferred + (slack * weights[i]) / totalW;
      });
    }
  } else {
    // Over capacity. Shrink in inverse-priority order down to minimum.
    let need = totalPreferred - availablePrimary;
    const shrinkOrder = [...slots].sort((a, b) => {
      if (a.d.priority !== b.d.priority) return a.d.priority - b.d.priority;
      return tieSortById(a.d, b.d);
    });
    for (const s of shrinkOrder) {
      if (need <= EPSILON_VMIN) break;
      const slack = s.preferred - s.minimum;
      const take = Math.min(slack, need);
      s.allocated = s.preferred - take;
      need -= take;
    }

    if (need > EPSILON_VMIN) {
      // Still over: collapse in collapsePriority order (first → last).
      const collapseOrder = [...slots]
        .filter((s) => s.visible)
        .sort((a, b) => {
          const rA = COLLAPSE_RANK[a.d.collapsePriority];
          const rB = COLLAPSE_RANK[b.d.collapsePriority];
          if (rA !== rB) return rA - rB;
          if (a.d.priority !== b.d.priority) return a.d.priority - b.d.priority;
          return tieSortById(a.d, b.d);
        });
      for (const s of collapseOrder) {
        if (need <= EPSILON_VMIN) break;
        if (s.d.collapsePriority === "never") break; // stop before 'never'
        s.visible = false;
        s.collapsedReason = "pressure";
        need -= s.allocated;
        s.allocated = 0;
      }
    }

    // Re-evaluate. Check faults for never/last classes.
    if (need > EPSILON_VMIN) {
      const neverMinSum = slots
        .filter((s) => s.visible && s.d.collapsePriority === "never")
        .reduce((a, b) => a + b.minimum, 0);
      const lastMinSum = slots
        .filter((s) => s.visible && s.d.collapsePriority === "last")
        .reduce((a, b) => a + b.minimum, 0);
      if (neverMinSum > availablePrimary + EPSILON_VMIN) {
        faults.push({
          code: "never_min_exceeds_band",
          artifactIds: slots
            .filter((s) => s.d.collapsePriority === "never")
            .map((s) => s.d.id),
          band,
          message: `'never' minimums exceed band '${band}'.`,
        });
      } else if (lastMinSum + neverMinSum > availablePrimary + EPSILON_VMIN) {
        faults.push({
          code: "last_min_exceeds_band",
          artifactIds: slots
            .filter((s) => s.d.collapsePriority === "last")
            .map((s) => s.d.id),
          band,
          message: `'last' minimums exceed band '${band}'.`,
        });
      }
    }
  }

  // Lay out along primary axis in original priority-sorted order.
  // Place protected areas first (they occupy fixed slots in band-local space);
  // remaining slots flow into leftover primary extent.
  // For Phase 3 we use simple sequential packing starting from band origin,
  // skipping any reserved rects' primary intervals.

  // Build forbidden primary intervals from reserved rects (relative to band origin).
  const forbidden: Array<{ start: number; end: number }> = reservedRects
    .map((r) => {
      const start = xDominant ? r.x - bandRect.x : r.y - bandRect.y;
      const end = start + (xDominant ? r.width : r.height);
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  const advanceCursor = (need: number): number => {
    // Move cursor forward, skipping forbidden intervals, returning start pos.
    while (true) {
      const f = forbidden.find(
        (iv) => cursor < iv.end && cursor + need > iv.start,
      );
      if (!f) return cursor;
      cursor = f.end;
    }
  };

  for (const s of slots) {
    if (!s.visible) {
      placements.push({
        id: s.d.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: s.collapsedReason ?? "pressure",
        appliedAspectRatio: false,
      });
      continue;
    }

    // Honor aspect ratio if present.
    let cross = Math.min(s.crossPreferred || crossExtent, crossExtent);
    let appliedAspect = false;
    if (s.d.aspectRatio && s.d.aspectRatio > 0) {
      const desiredCross = xDominant
        ? s.allocated / s.d.aspectRatio
        : s.allocated * s.d.aspectRatio;
      if (desiredCross > crossExtent + EPSILON_VMIN) {
        // Try shrinking primary to honor aspect within cross.
        const maxPrimary = xDominant
          ? crossExtent * s.d.aspectRatio
          : crossExtent / s.d.aspectRatio;
        if (maxPrimary + EPSILON_VMIN < s.minimum) {
          faults.push({
            code: "aspect_unhonorable",
            artifactIds: [s.d.id],
            band,
            message: `Aspect ratio for ${s.d.id} cannot be honored within band '${band}'.`,
          });
          s.allocated = s.minimum;
          cross = Math.min(s.crossPreferred, crossExtent);
        } else {
          s.allocated = Math.max(s.minimum, maxPrimary);
          cross = xDominant
            ? s.allocated / s.d.aspectRatio
            : s.allocated * s.d.aspectRatio;
          appliedAspect = true;
        }
      } else {
        cross = desiredCross;
        appliedAspect = true;
      }
    }

    const start = advanceCursor(s.allocated);
    cursor = start + s.allocated;

    const rect: FlatRect = xDominant
      ? {
          x: bandRect.x + start,
          y: bandRect.y + (bandRect.height - cross) / 2,
          width: s.allocated,
          height: cross,
        }
      : {
          x: bandRect.x + (bandRect.width - cross) / 2,
          y: bandRect.y + start,
          width: cross,
          height: s.allocated,
        };

    placements.push({
      id: s.d.id,
      rect: flatToRect(rect),
      visible: true,
      appliedAspectRatio: appliedAspect,
    });
  }

  return { placements, faults };
}

function solveSeatBound(
  descriptors: ArtifactDescriptor[],
  geometry: GeometryConstraints,
): BandSolveResult {
  const placements: ResolvedPlacement[] = [];
  const faults: LayoutFault[] = [];

  const safeAreas: Array<{ id: BandId; rect: FlatRect }> = [
    { id: "announcement", rect: rectToFlat(geometry.announcementBand) },
    { id: "topHud", rect: rectToFlat(geometry.topHudReserve) },
    { id: "bottomHud", rect: rectToFlat(geometry.bottomHudReserve) },
  ];

  for (const d of descriptors) {
    if (d.seatPosition === undefined && d.chipAnchorRef === undefined) {
      // Underspecified seatBound/chipBound descriptor — skip silently is wrong,
      // but Phase 3 keeps the contract: missing anchor = no placement.
      placements.push({
        id: d.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: "dependencyMissing",
        appliedAspectRatio: false,
      });
      continue;
    }

    const anchorSeat =
      d.composeMode === "chipBound"
        ? geometry.seatRing.seatAnchors.find(
            (s) =>
              s.position ===
              (d.chipAnchorRef === "self"
                ? geometry.viewerSeatPosition
                : d.chipAnchorRef),
          )
        : geometry.seatRing.seatAnchors.find(
            (s) => s.position === d.seatPosition,
          );

    if (!anchorSeat) {
      placements.push({
        id: d.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: "dependencyMissing",
        appliedAspectRatio: false,
      });
      continue;
    }

    const anchor =
      d.composeMode === "chipBound" ? anchorSeat.chipCenter : anchorSeat.anchor;

    const w = d.preferredSize.width.value;
    const h = d.preferredSize.height.value;
    const rect: FlatRect = {
      x: anchor.x.value - w / 2,
      y: anchor.y.value - h / 2,
      width: w,
      height: h,
    };

    let collided = false;
    for (const sa of safeAreas) {
      if (rectsIntersect(sa.rect, rect)) {
        faults.push({
          code: "safe_area_collision",
          artifactIds: [d.id],
          band: sa.id,
          message: `Seat-projected ${d.id} collides with safe area '${sa.id}'.`,
        });
        collided = true;
      }
    }

    placements.push({
      id: d.id,
      rect: flatToRect(rect),
      visible: !collided,
      collapsedReason: collided ? "dependencyMissing" : undefined,
      appliedAspectRatio: false,
    });
  }

  return { placements, faults };
}

function solveOverlay(
  descriptors: ArtifactDescriptor[],
  flowPlacements: ResolvedPlacement[],
  flowById: Map<string, ArtifactDescriptor>,
  geometry: GeometryConstraints,
): BandSolveResult {
  const placements: ResolvedPlacement[] = [];
  const faults: LayoutFault[] = [];

  for (const d of descriptors) {
    // Place at preferred rect anchored to band origin (band-relative preferred).
    const bandRect = bandRectFor(d.band, geometry);
    if (!bandRect) {
      placements.push({
        id: d.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: "dependencyMissing",
        appliedAspectRatio: false,
      });
      continue;
    }
    const band = rectToFlat(bandRect);
    const w = d.preferredSize.width.value;
    const h = d.preferredSize.height.value;
    const rect: FlatRect = {
      x: band.x + (band.width - w) / 2,
      y: band.y + (band.height - h) / 2,
      width: w,
      height: h,
    };

    let demoted = false;
    for (const p of flowPlacements) {
      if (!p.visible) continue;
      const owner = flowById.get(p.id);
      if (!owner || owner.priority < 95) continue;
      if (rectsIntersect(rect, rectToFlat(p.rect))) {
        demoted = true;
        break;
      }
    }

    placements.push({
      id: d.id,
      rect: demoted
        ? { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) }
        : flatToRect(rect),
      visible: !demoted,
      collapsedReason: demoted ? "overlayDemoted" : undefined,
      appliedAspectRatio: false,
    });
  }

  return { placements, faults };
}

// ---------------------------------------------------------------------------
// Centerpiece — felt-anchored, fixed-aspect, reserves space BEFORE flow solve.
// Zone = feltBounds minus structural reserves (outerRail / topHud /
// announcement / bottomHud). If a centerpiece cannot honor its aspect within
// the zone at minimum size, emit `aspect_unhonorable` and skip placement —
// never silently distort.
// ---------------------------------------------------------------------------

function solveCenterpiece(
  descriptors: ArtifactDescriptor[],
  geometry: GeometryConstraints,
): {
  placements: ResolvedPlacement[];
  faults: LayoutFault[];
  bandRects: Map<BandId, FlatRect[]>;
} {
  const placements: ResolvedPlacement[] = [];
  const faults: LayoutFault[] = [];
  const bandRects = new Map<BandId, FlatRect[]>();

  if (descriptors.length === 0) return { placements, faults, bandRects };

  const felt = rectToFlat(geometry.feltBounds);
  const rail = rectToFlat(geometry.outerRailReserve);
  const top = rectToFlat(geometry.topHudReserve);
  const ann = rectToFlat(geometry.announcementBand);
  const bot = rectToFlat(geometry.bottomHudReserve);

  const zoneTop = Math.max(
    felt.y + rail.height,
    top.y + top.height,
    ann.y + ann.height,
  );
  const zoneBottom = bot.y;
  const zoneX = felt.x + 2;
  const zoneRight = felt.x + felt.width - 2;
  const zoneW = Math.max(0, zoneRight - zoneX);
  const zoneH = Math.max(0, zoneBottom - zoneTop);

  // Highest priority first (stable on id).
  const sorted = [...descriptors].sort((a, b) =>
    b.priority !== a.priority ? b.priority - a.priority : tieSortById(a, b),
  );

  const occupied: FlatRect[] = [];

  for (const d of sorted) {
    let w = d.preferredSize.width.value;
    let h = d.preferredSize.height.value;
    let appliedAspect = false;

    if (d.aspectRatio && d.aspectRatio > 0) {
      // Aspect = width / height. Try preferred h, then shrink preserving aspect.
      if (h * d.aspectRatio <= zoneW + EPSILON_VMIN && h <= zoneH + EPSILON_VMIN) {
        w = h * d.aspectRatio;
        appliedAspect = true;
      } else {
        const candH = Math.min(zoneH, zoneW / d.aspectRatio);
        const candW = candH * d.aspectRatio;
        if (
          candH + EPSILON_VMIN < d.minimumSize.height.value ||
          candW + EPSILON_VMIN < d.minimumSize.width.value
        ) {
          faults.push({
            code: "aspect_unhonorable",
            artifactIds: [d.id],
            band: d.band,
            message: `Centerpiece ${d.id} cannot honor aspect ratio within structural safe areas.`,
          });
          placements.push({
            id: d.id,
            rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
            visible: false,
            collapsedReason: "dependencyMissing",
            appliedAspectRatio: false,
          });
          continue;
        }
        w = candW;
        h = candH;
        appliedAspect = true;
      }
    } else {
      w = Math.min(w, zoneW);
      h = Math.min(h, zoneH);
    }

    // Center horizontally; vertically center, then shift below any occupied
    // centerpiece rect (deterministic top-down stack on collisions).
    const x = zoneX + (zoneW - w) / 2;
    let y = zoneTop + (zoneH - h) / 2;
    for (const o of occupied) {
      const candidate: FlatRect = { x, y, width: w, height: h };
      if (rectsIntersect(o, candidate)) {
        y = o.y + o.height + 1;
      }
    }

    if (y + h > zoneBottom + EPSILON_VMIN) {
      faults.push({
        code: "aspect_unhonorable",
        artifactIds: [d.id],
        band: d.band,
        message: `Centerpiece ${d.id} cannot fit within structural safe areas after stacking.`,
      });
      placements.push({
        id: d.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: "dependencyMissing",
        appliedAspectRatio: false,
      });
      continue;
    }

    const rect: FlatRect = { x, y, width: w, height: h };
    occupied.push(rect);
    placements.push({
      id: d.id,
      rect: flatToRect(rect),
      visible: true,
      appliedAspectRatio: appliedAspect,
    });
    const arr = bandRects.get(d.band) ?? [];
    arr.push(rect);
    bandRects.set(d.band, arr);
  }

  return { placements, faults, bandRects };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function resolveLayout(
  descriptors: ReadonlyArray<ArtifactDescriptor>,
  geometry: GeometryConstraints,
): ResolvedLayout {
  const faults: LayoutFault[] = [];
  const valid: ArtifactDescriptor[] = [];

  // Stage A — Validate.
  for (const d of descriptors) {
    const f = validateDescriptor(d, geometry);
    if (f) {
      faults.push(f);
      continue;
    }
    valid.push(d);
  }

  // Stage B — Partition.
  const flowByBand = new Map<BandId, ArtifactDescriptor[]>();
  const overlays: ArtifactDescriptor[] = [];
  const seatProjected: ArtifactDescriptor[] = [];
  const centerpieces: ArtifactDescriptor[] = [];

  for (const d of valid) {
    if (d.composeMode === "flow") {
      const arr = flowByBand.get(d.band) ?? [];
      arr.push(d);
      flowByBand.set(d.band, arr);
    } else if (d.composeMode === "overlay") {
      overlays.push(d);
    } else if (d.composeMode === "centerpiece") {
      centerpieces.push(d);
    } else {
      seatProjected.push(d);
    }
  }

  // Stage B.5 — Centerpiece solve. Reserves felt-anchored rects BEFORE flow.
  const centerpieceResult = solveCenterpiece(centerpieces, geometry);
  faults.push(...centerpieceResult.faults);

  // Stage C/D — Band solve (includes protected-area reservation and any
  // centerpiece rects that landed in the same band as a flow descriptor).
  const allFlow: ResolvedPlacement[] = [];
  const flowById = new Map<string, ArtifactDescriptor>();
  for (const [band, ds] of flowByBand) {
    const bandRect = bandRectFor(band, geometry);
    if (!bandRect) {
      for (const d of ds) {
        faults.push({
          code: "missing_safe_area_dependency",
          artifactIds: [d.id],
          band,
          message: `Flow descriptor ${d.id} targets missing band '${band}'.`,
        });
      }
      continue;
    }
    const extra = centerpieceResult.bandRects.get(band) ?? [];
    const result = solveBand(band, rectToFlat(bandRect), ds, extra);
    allFlow.push(...result.placements);
    faults.push(...result.faults);
    for (const d of ds) flowById.set(d.id, d);
  }

  // Stage E — Overlays.
  const overlayResult = solveOverlay(overlays, allFlow, flowById, geometry);

  // Stage F — Seat projection.
  const seatResult = solveSeatBound(seatProjected, geometry);

  faults.push(...overlayResult.faults, ...seatResult.faults);

  // Stage G — Emit. Stable order: by descriptor id.
  const placements: ResolvedPlacement[] = [
    ...centerpieceResult.placements,
    ...allFlow,
    ...overlayResult.placements,
    ...seatResult.placements,
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { placements, faults, geometry };
}

export { COLLAPSE_RANK };
