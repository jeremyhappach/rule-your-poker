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
  AvailableGameplayViewport,
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
// Wave 5D — Phase 1: availableGameplayViewport derivation
//
// Compute the largest axis-aligned interior rect inside `feltBounds` that
// contains no structural reserve. Implementation: edge-pushing — for each
// reserve, push whichever viewport edge it overlaps most cheaply. Reserves
// that don't touch any edge are ignored (they cannot be excluded from a
// single rect anyway). This matches every real shell layout we ship today,
// where reserves are HUD bands / rails / seat ring that hug felt edges.
//
// Spec: .lovable/wave5-gameplay-geometry/wave5D-anchored-composeMode-spec.md §2
// ---------------------------------------------------------------------------

function emptyRect(): FlatRect {
  return { x: 0, y: 0, width: 0, height: 0 };
}

function seatRingBoundingRect(geometry: GeometryConstraints): FlatRect {
  const sr = geometry.seatRing;
  const cx = sr.center.x.value;
  const cy = sr.center.y.value;
  const rx = sr.radiusX.value;
  const ry = sr.radiusY.value;
  return {
    x: cx - rx,
    y: cy - ry,
    width: rx * 2,
    height: ry * 2,
  };
}

function pushViewportEdge(viewport: FlatRect, reserve: FlatRect): FlatRect {
  if (reserve.width <= 0 || reserve.height <= 0) return viewport;
  if (!rectsIntersect(viewport, reserve)) return viewport;

  const rTop = reserve.y;
  const rBottom = reserve.y + reserve.height;
  const rLeft = reserve.x;
  const rRight = reserve.x + reserve.width;
  const vTop = viewport.y;
  const vBottom = viewport.y + viewport.height;
  const vLeft = viewport.x;
  const vRight = viewport.x + viewport.width;

  // Push amounts to fully exclude `reserve` from `viewport` by collapsing
  // one edge inward. Infinity = that edge can't resolve the overlap alone.
  const pushTop = rBottom > vTop ? rBottom - vTop : Infinity;
  const pushBottom = rTop < vBottom ? vBottom - rTop : Infinity;
  const pushLeft = rRight > vLeft ? rRight - vLeft : Infinity;
  const pushRight = rLeft < vRight ? vRight - rLeft : Infinity;

  const candidates: Array<{ side: "top" | "bottom" | "left" | "right"; cost: number }> = [
    { side: "top", cost: pushTop },
    { side: "bottom", cost: pushBottom },
    { side: "left", cost: pushLeft },
    { side: "right", cost: pushRight },
  ];
  candidates.sort((a, b) => a.cost - b.cost);
  const pick = candidates[0];
  if (!isFinite(pick.cost)) return viewport;

  switch (pick.side) {
    case "top":
      return { x: viewport.x, y: rBottom, width: viewport.width, height: Math.max(0, vBottom - rBottom) };
    case "bottom":
      return { x: viewport.x, y: viewport.y, width: viewport.width, height: Math.max(0, rTop - viewport.y) };
    case "left":
      return { x: rRight, y: viewport.y, width: Math.max(0, vRight - rRight), height: viewport.height };
    case "right":
      return { x: viewport.x, y: viewport.y, width: Math.max(0, rLeft - viewport.x), height: viewport.height };
  }
}

export function deriveAvailableGameplayViewport(
  geometry: GeometryConstraints,
): { viewport: AvailableGameplayViewport; fault: LayoutFault | null } {
  const felt = rectToFlat(geometry.feltBounds);
  const announcement = rectToFlat(geometry.announcementBand);
  const topHud = rectToFlat(geometry.topHudReserve);
  const bottomHud = rectToFlat(geometry.bottomHudReserve);
  const outerRail = rectToFlat(geometry.outerRailReserve);
  const seatRingRect = seatRingBoundingRect(geometry);

  // Order: edge-aligned reserves first (HUD/announcement/bottom), then rails,
  // then seat ring last so it only pulls edges in if nothing else did.
  const reserves: FlatRect[] = [topHud, announcement, bottomHud, outerRail, seatRingRect];

  let v: FlatRect = { ...felt };
  for (const r of reserves) {
    v = pushViewportEdge(v, r);
    if (v.width <= EPSILON_VMIN || v.height <= EPSILON_VMIN) break;
  }

  const collapsed = v.width <= EPSILON_VMIN || v.height <= EPSILON_VMIN;
  const rect = collapsed ? emptyRect() : v;

  const viewport: AvailableGameplayViewport = {
    rect: flatToRect(rect),
    derivedFrom: {
      feltBounds: geometry.feltBounds,
      subtracted: {
        announcementBand: geometry.announcementBand,
        topHudReserve: geometry.topHudReserve,
        bottomHudReserve: geometry.bottomHudReserve,
        outerRailReserve: geometry.outerRailReserve,
        seatRingReserve: flatToRect(seatRingRect),
        shellSafeAreas: [],
      },
    },
  };

  const fault: LayoutFault | null = collapsed
    ? {
        code: "wave5:viewport_collapsed",
        artifactIds: [],
        message:
          "availableGameplayViewport collapsed to empty after subtracting structural reserves from feltBounds.",
      }
    : null;

  return { viewport, fault };
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

  // Wave 5D Phase 1 — derive gameplay viewport (read-only echo, no consumer yet).
  const { viewport, fault: viewportFault } = deriveAvailableGameplayViewport(geometry);
  if (viewportFault) faults.push(viewportFault);

  return { placements, faults, geometry, availableGameplayViewport: viewport };
}

export { COLLAPSE_RANK };

// ===========================================================================
// Wave 5C — group primitive
// ===========================================================================

function leafPreferred(d: ArtifactDescriptor, axis: GroupAxis): number {
  return axis === "x" ? d.preferredSize.width.value : d.preferredSize.height.value;
}
function leafMin(d: ArtifactDescriptor, axis: GroupAxis): number {
  return axis === "x" ? d.minimumSize.width.value : d.minimumSize.height.value;
}

function groupPreferredAlong(
  g: GroupDescriptor,
  axis: GroupAxis,
  leafById: Map<string, ArtifactDescriptor>,
): number {
  if (g.axis === axis) {
    let s = 0;
    for (const c of g.children) s += childPreferredAlong(c, axis, leafById);
    return s;
  }
  let m = 0;
  for (const c of g.children) {
    const v = childPreferredAlong(c, axis, leafById);
    if (v > m) m = v;
  }
  return m;
}

function groupMinAlong(
  g: GroupDescriptor,
  axis: GroupAxis,
  leafById: Map<string, ArtifactDescriptor>,
): number {
  if (g.axis === axis) {
    let s = 0;
    for (const c of g.children) s += childMinAlong(c, axis, leafById);
    return s;
  }
  // Cross axis: take the MIN of non-gap children so the group can shrink
  // when its parent demands it. Individual children may be squeezed below
  // their preferred cross extent (still bounded by their own min along the
  // group's primary axis, which is the dimension that actually matters).
  let m = Infinity;
  for (const c of g.children) {
    if (c.kind === "gap") continue;
    const v = childMinAlong(c, axis, leafById);
    if (v < m) m = v;
  }
  return Number.isFinite(m) ? m : 0;
}

function childPreferredAlong(
  c: GroupChildSlot,
  axis: GroupAxis,
  leafById: Map<string, ArtifactDescriptor>,
): number {
  if (c.kind === "gap") return 0;
  if (c.kind === "leaf") {
    const d = c.leafRef ? leafById.get(c.leafRef) : undefined;
    return d ? leafPreferred(d, axis) : 0;
  }
  if (c.kind === "group" && c.group) {
    return groupPreferredAlong(c.group, axis, leafById);
  }
  return 0;
}

function childMinAlong(
  c: GroupChildSlot,
  axis: GroupAxis,
  leafById: Map<string, ArtifactDescriptor>,
): number {
  if (c.kind === "gap") return 0;
  if (c.kind === "leaf") {
    const d = c.leafRef ? leafById.get(c.leafRef) : undefined;
    return d ? leafMin(d, axis) : 0;
  }
  if (c.kind === "group" && c.group) {
    return groupMinAlong(c.group, axis, leafById);
  }
  return 0;
}

function collectLeafIds(c: GroupChildSlot): string[] {
  if (c.kind === "leaf") return c.leafRef ? [c.leafRef] : [];
  if (c.kind === "group" && c.group) {
    const out: string[] = [];
    for (const inner of c.group.children) out.push(...collectLeafIds(inner));
    return out;
  }
  return [];
}

interface FlatRectMut {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveGroup(
  g: GroupDescriptor,
  rect: FlatRectMut,
  leafById: Map<string, ArtifactDescriptor>,
  placements: ResolvedPlacement[],
  faults: LayoutFault[],
): void {
  const primaryAxis = g.axis;
  const primaryExtent = primaryAxis === "x" ? rect.width : rect.height;

  type Slot = {
    child: GroupChildSlot;
    preferred: number;
    minimum: number;
    weight: number;
    shrinkOrder: number;
    collapseOrder: number | "never";
    allocated: number;
    visible: boolean;
  };

  const slots: Slot[] = g.children.map((c) => {
    const pref = childPreferredAlong(c, primaryAxis, leafById);
    const min = childMinAlong(c, primaryAxis, leafById);
    return {
      child: c,
      preferred: pref,
      minimum: min,
      weight: c.weight ?? 1,
      shrinkOrder: c.shrinkOrder ?? Number.POSITIVE_INFINITY,
      collapseOrder: c.collapseOrder ?? Number.POSITIVE_INFINITY,
      allocated: pref,
      visible: true,
    };
  });

  const totalPreferred = slots.reduce((s, x) => s + x.preferred, 0);

  if (totalPreferred <= primaryExtent + EPSILON_VMIN) {
    // Distribute slack to gaps proportional to weight.
    const slack = primaryExtent - totalPreferred;
    const gapSlots = slots.filter((s) => s.child.kind === "gap");
    const totalW = gapSlots.reduce((a, s) => a + Math.max(0, s.weight), 0);
    if (slack > EPSILON_VMIN && totalW > 0) {
      for (const s of gapSlots) {
        s.allocated = s.preferred + (slack * Math.max(0, s.weight)) / totalW;
      }
    }
  } else {
    // Over: shrink in shrinkOrder asc down to min.
    let need = totalPreferred - primaryExtent;
    const shrinkSorted = [...slots].sort((a, b) => {
      if (a.shrinkOrder !== b.shrinkOrder) return a.shrinkOrder - b.shrinkOrder;
      return a.child.id < b.child.id ? -1 : 1;
    });
    for (const s of shrinkSorted) {
      if (need <= EPSILON_VMIN) break;
      const slack = Math.max(0, s.preferred - s.minimum);
      const take = Math.min(slack, need);
      s.allocated = s.preferred - take;
      need -= take;
    }

    if (need > EPSILON_VMIN) {
      // Collapse in collapseOrder asc (never = skip).
      const collapseSorted = [...slots]
        .filter((s) => s.visible)
        .sort((a, b) => {
          const av = a.collapseOrder === "never" ? Infinity : a.collapseOrder;
          const bv = b.collapseOrder === "never" ? Infinity : b.collapseOrder;
          if (av !== bv) return av - bv;
          return a.child.id < b.child.id ? -1 : 1;
        });
      for (const s of collapseSorted) {
        if (need <= EPSILON_VMIN) break;
        if (s.collapseOrder === "never") break;
        s.visible = false;
        need -= s.allocated;
        s.allocated = 0;
      }
    }

    if (need > EPSILON_VMIN) {
      const offenderLeafIds: string[] = [];
      for (const s of slots) {
        if (s.collapseOrder === "never") {
          offenderLeafIds.push(...collectLeafIds(s.child));
        }
        if (!s.visible) offenderLeafIds.push(...collectLeafIds(s.child));
      }
      faults.push({
        code: "never_min_exceeds_band",
        artifactIds: Array.from(new Set(offenderLeafIds)),
        band: g.band,
        message: `Group ${g.id} cannot fit 'never' children within extent (axis=${g.axis}).`,
      });
    } else {
      // Some collapsed but the group fit: still surface as a fault so the
      // collapsed leaves are visible to telemetry/consumers.
      const collapsedLeafIds: string[] = [];
      for (const s of slots) {
        if (!s.visible) collapsedLeafIds.push(...collectLeafIds(s.child));
      }
      if (collapsedLeafIds.length > 0) {
        faults.push({
          code: "last_min_exceeds_band",
          artifactIds: Array.from(new Set(collapsedLeafIds)),
          band: g.band,
          message: `Group ${g.id} collapsed children to fit extent.`,
        });
      }
    }
  }

  // Place children along primary axis in DECLARED order.
  let cursor = primaryAxis === "x" ? rect.x : rect.y;
  for (const s of slots) {
    const childRect: FlatRectMut =
      primaryAxis === "x"
        ? { x: cursor, y: rect.y, width: s.allocated, height: rect.height }
        : { x: rect.x, y: cursor, width: rect.width, height: s.allocated };
    cursor += s.allocated;

    if (!s.visible) {
      placements.push({
        id: s.child.id,
        rect: { x: vmin(0), y: vmin(0), width: vmin(0), height: vmin(0) },
        visible: false,
        collapsedReason: "pressure",
        appliedAspectRatio: false,
        parentId: g.id,
      });
      continue;
    }

    placements.push({
      id: s.child.id,
      rect: {
        x: vmin(childRect.x),
        y: vmin(childRect.y),
        width: vmin(childRect.width),
        height: vmin(childRect.height),
      },
      visible: true,
      appliedAspectRatio: false,
      parentId: g.id,
    });

    if (s.child.kind === "group" && s.child.group) {
      resolveGroup(s.child.group, childRect, leafById, placements, faults);
    }
  }
}

/**
 * Wave 5C — public entry point that resolves grouped descriptors alongside
 * standalone leaves. Standalone leaves go through `resolveLayout` as before;
 * groups produce their own placements with `parentId` set on descendants.
 *
 * Leaf ids referenced by any group are EXCLUDED from the standalone flow
 * solve to avoid double-placement.
 */
export function resolveLayoutWithGroups(
  descriptors: ReadonlyArray<ArtifactDescriptor>,
  groups: ReadonlyArray<GroupDescriptor>,
  geometry: GeometryConstraints,
): ResolvedLayout {
  const leafById = new Map<string, ArtifactDescriptor>();
  for (const d of descriptors) leafById.set(d.id, d);

  const referenced = new Set<string>();
  const visitGroup = (g: GroupDescriptor) => {
    for (const c of g.children) {
      if (c.kind === "leaf" && c.leafRef) referenced.add(c.leafRef);
      if (c.kind === "group" && c.group) visitGroup(c.group);
    }
  };
  for (const g of groups) visitGroup(g);

  const standalone = descriptors.filter((d) => !referenced.has(d.id));
  const base = resolveLayout(standalone, geometry);

  const placements: ResolvedPlacement[] = [...base.placements];
  const faults: LayoutFault[] = [...base.faults];

  for (const g of groups) {
    const bandRect = bandRectFor(g.band, geometry);
    if (!bandRect) {
      faults.push({
        code: "missing_safe_area_dependency",
        artifactIds: [g.id],
        band: g.band,
        message: `Group ${g.id} targets missing band '${g.band}'.`,
      });
      continue;
    }
    const flat: FlatRectMut = {
      x: bandRect.x.value,
      y: bandRect.y.value,
      width: bandRect.width.value,
      height: bandRect.height.value,
    };
    // Emit the group's own placement (top-level: no parentId).
    placements.push({
      id: g.id,
      rect: {
        x: vmin(flat.x),
        y: vmin(flat.y),
        width: vmin(flat.width),
        height: vmin(flat.height),
      },
      visible: true,
      appliedAspectRatio: false,
    });
    resolveGroup(g, flat, leafById, placements, faults);
  }

  // Reuse the base viewport — geometry input is identical for both passes.
  return {
    placements,
    faults,
    geometry,
    availableGameplayViewport: base.availableGameplayViewport,
  };
}
