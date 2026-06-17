/**
 * Wave 4 — Phase 3
 * Artifact Layout Engine type definitions.
 *
 * Spec: .lovable/wave4-artifact-layout-engine/phase2-resolver-spec.md
 *
 * These types form the public contract of the resolver. They are pure data:
 * no DOM, no React, no game imports.
 */

export type Unit = "vmin" | "px";

export interface Length {
  value: number;
  unit: Unit;
}

export interface Rect {
  x: Length;
  y: Length;
  width: Length;
  height: Length;
}

export interface Size {
  width: Length;
  height: Length;
}

// ---------------------------------------------------------------------------
// Structural geometry — NOT descriptors. Produced by the canonical shell.
// ---------------------------------------------------------------------------

export interface SeatAnchor {
  position: number;
  anchor: { x: Length; y: Length };
  chipCenter: { x: Length; y: Length };
  namePlate: Rect;
  facing: "top" | "bottom" | "left" | "right";
}

export interface SeatRingGeometry {
  center: { x: Length; y: Length };
  radiusX: Length;
  radiusY: Length;
  seatCount: number;
  seatAnchors: ReadonlyArray<SeatAnchor>;
}

export interface GeometryConstraints {
  feltBounds: Rect;
  outerRailReserve: Rect;
  seatRing: SeatRingGeometry;
  announcementBand: Rect;
  playBand: Rect;
  bottomHudReserve: Rect;
  topHudReserve: Rect;
  viewerSeatPosition: number | null;
}

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export type BandId =
  | "outerRail"
  | "topHud"
  | "announcement"
  | "play"
  | "bottomHud"
  | "seatProjected";

export type ComposeMode =
  | "flow"
  | "overlay"
  | "seatBound"
  | "chipBound"
  | "centerpiece";

export type CollapsePriority =
  | "never"
  | "last"
  | "late"
  | "mid"
  | "early"
  | "first";

export interface ArtifactDescriptor {
  id: string;
  owner: string;
  band: BandId;
  composeMode: ComposeMode;

  preferredSize: Size;
  minimumSize: Size;
  aspectRatio?: number;

  priority: number;
  collapsePriority: CollapsePriority;

  seatPosition?: number;
  chipAnchorRef?: "self" | number;

  protectedArea?: Rect;
  safeAreaDependencies?: ReadonlyArray<BandId>;
}

// ---------------------------------------------------------------------------
// Resolved output
// ---------------------------------------------------------------------------

export type CollapsedReason =
  | "pressure"
  | "dependencyMissing"
  | "overlayDemoted";

export interface ResolvedPlacement {
  id: string;
  rect: Rect;
  visible: boolean;
  collapsedReason?: CollapsedReason;
  appliedAspectRatio: boolean;
  /**
   * Wave 5C — when this placement is a child of a group descriptor, the
   * descriptor id of the containing group. Top-level placements omit it.
   */
  parentId?: string;
}

// ---------------------------------------------------------------------------
// Wave 5C — group primitive
// ---------------------------------------------------------------------------

export type GroupAxis = "x" | "y";

export interface GroupChildSlot {
  /** Stable id for this slot. Becomes the emitted placement id. */
  id: string;
  kind: "leaf" | "gap" | "group";
  /** Gap weight in remaining-slack distribution. Default 1. */
  weight?: number;
  /** Nested group descriptor (kind === 'group'). */
  group?: GroupDescriptor;
  /** Leaf ArtifactDescriptor id (kind === 'leaf'). */
  leafRef?: string;
  /** Shrink preservation: lower number = shrinks first. */
  shrinkOrder?: number;
  /** Collapse preservation: lower number = collapses first. */
  collapseOrder?: number | "never";
}

export interface GroupDescriptor {
  id: string;
  owner: string;
  band: "play" | "topHud" | "bottomHud" | "announcement";
  composeMode: "group";
  axis: GroupAxis;
  /** Children render in declared order. Priority never reorders. */
  children: ReadonlyArray<GroupChildSlot>;
  /** Clamp group rect to targeted band rect. */
  clampToBand?: boolean;
}

export type LayoutFaultCode =
  | "never_min_exceeds_band"
  | "last_min_exceeds_band"
  | "aspect_unhonorable"
  | "protected_area_overlap"
  | "protected_area_outside_band"
  | "safe_area_collision"
  | "descriptor_targets_structural_band"
  | "missing_safe_area_dependency"
  | "wave5:viewport_collapsed";

export interface LayoutFault {
  code: LayoutFaultCode;
  artifactIds: string[];
  band?: BandId;
  message: string;
}

// ---------------------------------------------------------------------------
// Wave 5D — availableGameplayViewport
//
// The coordinate space gameplay artifacts live in. Derived once per resolve
// pass from canonical shell geometry by subtracting structural reserves
// (HUDs, announcement, outer rail, seat ring, shell safe areas) from
// feltBounds. Owned by the canonical shell; consumed read-only by gameplay
// descriptors. See:
//   .lovable/wave5-gameplay-geometry/wave5D-anchored-composeMode-spec.md §2
//
// Phase 1: derived and exposed on every ResolvedLayout. No descriptor
// consumes it yet — anchored composeMode lands in Phase 2.
// ---------------------------------------------------------------------------

export interface AvailableGameplayViewport {
  /** In felt-local vmin. Non-empty in every valid layout. */
  rect: Rect;
  /** Echo of inputs used to derive `rect`, for diagnostics and tests. */
  derivedFrom: {
    feltBounds: Rect;
    subtracted: {
      announcementBand: Rect;
      topHudReserve: Rect;
      bottomHudReserve: Rect;
      outerRailReserve: Rect;
      seatRingReserve: Rect;
      shellSafeAreas: ReadonlyArray<Rect>;
    };
  };
}

export interface ResolvedLayout {
  placements: ReadonlyArray<ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  geometry: GeometryConstraints;
  /**
   * Wave 5D — gameplay canvas. Derived every resolve pass from `geometry`.
   * If empty, a `wave5:viewport_collapsed` fault is emitted and the rect
   * is set to zero extents.
   */
  availableGameplayViewport: AvailableGameplayViewport;
}
