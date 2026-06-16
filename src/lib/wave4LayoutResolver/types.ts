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
}

export type LayoutFaultCode =
  | "never_min_exceeds_band"
  | "last_min_exceeds_band"
  | "aspect_unhonorable"
  | "protected_area_overlap"
  | "protected_area_outside_band"
  | "safe_area_collision"
  | "descriptor_targets_structural_band"
  | "missing_safe_area_dependency";

export interface LayoutFault {
  code: LayoutFaultCode;
  artifactIds: string[];
  band?: BandId;
  message: string;
}

export interface ResolvedLayout {
  placements: ReadonlyArray<ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  geometry: GeometryConstraints;
}
