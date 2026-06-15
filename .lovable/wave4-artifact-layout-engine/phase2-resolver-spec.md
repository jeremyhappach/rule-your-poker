# Wave 4 — Phase 2: Resolver Specification

Status: architecture only. No code movement, no per-game branches, no DOM measurement.

The resolver is the heart of Wave 4. It is a **pure function** that consumes structural geometry and artifact descriptors and produces a fully resolved layout. It does not measure DOM, does not iterate, does not feed back, does not apply magic offsets, and does not contain a single `if (game === 'x')` branch.

```
Descriptors[] + GeometryConstraints
            │
            ▼
       LayoutResolver  (pure)
            │
            ▼
       ResolvedLayout
```

Deterministic. Testable. Boring.

------------------------------------------------

## 1. Final Interfaces

### 1.1 Structural geometry (NOT descriptors)

Seat ring, chip anchors, spotlight projection, outer rail reserve, and safe-area bands are **structural**. They are inputs to the resolver, not negotiable artifacts. Artifacts negotiate **around** them; they are never collapsed, shrunk, or reordered.

```ts
// Units: 'vmin' is preferred (felt is aspect-locked). 'px' allowed at the shell boundary only.
type Unit = 'vmin' | 'px';
type Length = { value: number; unit: Unit };

interface Rect {
  // Origin at felt top-left, in the same units as Length.
  x: Length;
  y: Length;
  width: Length;
  height: Length;
}

interface SeatRingGeometry {
  // Pure projection — produced by Wave 3 canonical shell, consumed read-only here.
  center: { x: Length; y: Length };
  radiusX: Length;
  radiusY: Length;
  seatCount: number;
  // Per-seat anchor in felt coordinates. Index is canonical seat position.
  seatAnchors: ReadonlyArray<{
    position: number;
    anchor: { x: Length; y: Length };
    chipCenter: { x: Length; y: Length };   // data-chip-center, immutable (Wave 3)
    namePlate: Rect;
    facing: 'top' | 'bottom' | 'left' | 'right';
  }>;
}

interface GeometryConstraints {
  feltBounds: Rect;                 // The ellipse-clipped felt surface
  outerRailReserve: Rect;           // Structural rail band (~3 vmin)
  seatRing: SeatRingGeometry;       // Structural — never negotiated
  announcementBand: Rect;           // Protected safe area (§7)
  playBand: Rect;                   // Protected safe area (§7)
  bottomHudReserve: Rect;           // Protected safe area (§7)
  topHudReserve: Rect;              // Protected safe area (§7)
  viewerSeatPosition: number | null; // null = observer
}
```

### 1.2 Artifact descriptors

```ts
type BandId =
  | 'outerRail'        // structural — descriptors may not target
  | 'topHud'
  | 'announcement'
  | 'play'
  | 'bottomHud'
  | 'seatProjected';   // resolver places via seat anchor, not band flow

type ComposeMode =
  | 'flow'             // participates in band 1-D solve
  | 'overlay'          // floats above flow; must not violate priority ≥95
  | 'seatBound'        // anchored to a seat (read seatAnchors[position])
  | 'chipBound';       // anchored to data-chip-center

type CollapsePriority =
  | 'never' | 'last' | 'late' | 'mid' | 'early' | 'first';

interface Size {
  width: Length;
  height: Length;
}

interface ArtifactDescriptor {
  id: string;                       // stable, unique within frame
  owner: string;                    // component/system that publishes it
  band: BandId;
  composeMode: ComposeMode;

  preferredSize: Size;
  minimumSize: Size;
  aspectRatio?: number;             // width / height; locked if present

  priority: number;                 // 0–100: shrink-resistance within band
  collapsePriority: CollapsePriority; // disappearance order under pressure

  // Optional anchoring
  seatPosition?: number;            // required when composeMode === 'seatBound'
  chipAnchorRef?: 'self' | number;  // required when composeMode === 'chipBound'

  // Optional reserved sub-rect inside band (in band-local coords).
  protectedArea?: Rect;

  // Safe-area dependencies — resolver fault if any are missing.
  safeAreaDependencies?: ReadonlyArray<BandId>;
}
```

### 1.3 Resolved layout

```ts
interface ResolvedPlacement {
  id: string;
  rect: Rect;                       // final felt-coord rect
  visible: boolean;                 // false = collapsed under pressure
  collapsedReason?: 'pressure' | 'dependencyMissing' | 'overlayDemoted';
  appliedAspectRatio: boolean;
}

interface LayoutFault {
  code:
    | 'never_min_exceeds_band'
    | 'last_min_exceeds_band'
    | 'aspect_unhonorable'
    | 'protected_area_overlap'
    | 'protected_area_outside_band'
    | 'safe_area_collision'
    | 'descriptor_targets_structural_band'
    | 'missing_safe_area_dependency';
  artifactIds: string[];
  band?: BandId;
  message: string;
}

interface ResolvedLayout {
  placements: ReadonlyArray<ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;   // emitted as `wave4:layout_fault`
  geometry: GeometryConstraints;        // echoed for downstream consumers
}
```

### 1.4 Resolver signature

```ts
function resolveLayout(
  descriptors: ReadonlyArray<ArtifactDescriptor>,
  geometry: GeometryConstraints,
): ResolvedLayout;
```

Pure. Same inputs → same outputs. No `Date.now()`, no `Math.random()`, no DOM, no refs.

------------------------------------------------

## 2. Resolver Algorithm

Single forward pass. No iteration, no feedback.

### Stage A — Validate

1. Reject any descriptor with `band === 'outerRail'` → fault `descriptor_targets_structural_band`.
2. For each descriptor with `safeAreaDependencies`, confirm the referenced band exists in `geometry` → fault `missing_safe_area_dependency`.
3. For each descriptor with `protectedArea`, confirm it lies inside its band rect → fault `protected_area_outside_band`.

Faulted descriptors are excluded from later stages; the fault is recorded.

### Stage B — Partition

Group surviving descriptors by `composeMode`:

- `flow` → grouped further by `band`
- `overlay` → held for Stage E
- `seatBound` → held for Stage F
- `chipBound` → held for Stage F

### Stage C — Band solve (per band, 1-D)

For each flow band (`topHud`, `announcement`, `play`, `bottomHud`):

1. Determine the band's primary axis from its rect (wider than tall → x-axis; taller than wide → y-axis). Cribbage's play band is y-dominant; HUD bands are x-dominant.
2. Sort by `priority` descending (shrink-resistance).
3. Sum preferred extents along the primary axis.
4. If sum ≤ band extent: allocate preferred sizes, distribute slack proportionally to `(100 − priority)`.
5. If sum > band extent:
   a. Shrink in inverse-priority order down to each descriptor's `minimumSize`.
   b. If still over, collapse descriptors by `collapsePriority` in order `first → early → mid → late → last`. Each collapsed descriptor becomes `{ visible: false, collapsedReason: 'pressure' }`.
   c. If `never`-collapse minimums still exceed band → fault `never_min_exceeds_band`. If `last`-collapse minimums still exceed band → fault `last_min_exceeds_band`. Resolver returns faults; it does not silently overlap, squash, or clip.
6. Honor `aspectRatio` after primary-axis allocation. If aspect cannot be honored within the cross-axis extent of the band, fault `aspect_unhonorable`. Never silently squash.
7. Mark `appliedAspectRatio: true` when a descriptor declared one and it was honored.

### Stage D — Protected-area reservation

Within each band, subtract `protectedArea` rects from the available band region **before** allocation. Overlap between two protected areas in the same band → fault `protected_area_overlap`.

### Stage E — Overlay pass

For each `overlay` descriptor:

1. Place at its preferred rect (resolved against `geometry`).
2. Check intersection with every `flow` placement of `priority ≥ 95`. If intersected, the overlay is demoted: `visible: false`, `collapsedReason: 'overlayDemoted'`. Flow artifacts at priority ≥95 are never moved or shrunk to accommodate overlays.
3. Overlays may freely overlap flow artifacts of priority < 95; that is the contract of overlay.

### Stage F — Seat projection

For each `seatBound` / `chipBound` descriptor:

1. Resolve the anchor from `geometry.seatRing.seatAnchors[seatPosition]` (or `chipCenter` for `chipBound`).
2. Place the descriptor centered on the anchor at its preferred size.
3. Check intersection with `geometry.announcementBand`, `geometry.topHudReserve`, `geometry.bottomHudReserve`. Any intersection → fault `safe_area_collision`. Seat projections do not push safe areas; safe areas are structural.

Seat ring itself is never modified.

### Stage G — Emit

Return `{ placements, faults, geometry }`. Consumer (the felt host) maps each placement to a CSS rect via a thin projection layer. The resolver does not write to the DOM.

------------------------------------------------

## 3. Determinism Rules

- Inputs fully determine outputs. No timestamps, no randomness, no environment reads.
- Sort orders are total: ties broken by `id` ascending.
- Units normalize to `vmin` internally; `px` inputs are converted using `geometry.feltBounds` at the boundary.
- No floating-point comparisons without an explicit epsilon (`1e-4 vmin`).

------------------------------------------------

## 4. What the resolver does NOT do

- Does not measure DOM (no `getBoundingClientRect`, no `ResizeObserver`).
- Does not iterate to fit ("try, shrink, retry"). One pass only.
- Does not know about game types. No `cribbage`, `holm`, `scc`, `yahtzee` branches.
- Does not own structural geometry. Seat ring, chip anchors, spotlight, outer rail, safe-area bands are produced by the canonical shell (Wave 3) and consumed read-only.
- Does not apply magic offsets ("nudge 12px so it looks right"). If a layout requires a nudge, that nudge belongs in a descriptor's `protectedArea` or in geometry — never in the resolver.
- Does not silently overlap, squash, or clip. Impossible layouts produce explicit `wave4:layout_fault` records.

------------------------------------------------

## 5. Testability

Because the resolver is pure, every test is a fixture:

```ts
test('cribbage pegging+counting share play band under pressure', () => {
  const out = resolveLayout(cribbageDescriptors, narrowPhoneGeometry);
  expect(out.faults).toEqual([]);
  expect(byId(out, 'cribbage.peggingRow').visible).toBe(true);
  expect(byId(out, 'cribbage.countingRow').visible).toBe(true);
  expect(byId(out, 'cribbage.gameTitle').visible).toBe(false); // collapsePriority: 'first'
});

test('announcement is never collapsed', () => {
  const out = resolveLayout(overloadedDescriptors, tinyGeometry);
  const announcement = byId(out, 'cribbage.announcement');
  expect(announcement.visible).toBe(true);
  expect(out.faults.some(f => f.code === 'never_min_exceeds_band')).toBe(true);
});

test('seat-bound name plate cannot collide with announcement band', () => {
  const out = resolveLayout([namePlateOverlappingAnnouncement], geom);
  expect(out.faults).toContainEqual(
    expect.objectContaining({ code: 'safe_area_collision' })
  );
});

test('overlay demoted rather than pushing priority-95 hand cards', () => {
  const out = resolveLayout([handCards95, overlayCoveringHand], geom);
  expect(byId(out, 'handCards').visible).toBe(true);
  expect(byId(out, 'overlay').visible).toBe(false);
  expect(byId(out, 'overlay').collapsedReason).toBe('overlayDemoted');
});
```

No mocks. No renderers. No timers. Fixtures in → snapshots out.

------------------------------------------------

## 6. Integration boundary (Phase 3 preview, not built here)

The felt host owns:

- Producing `GeometryConstraints` from the canonical shell (Wave 3 outputs).
- Collecting `ArtifactDescriptor[]` published by game modules via a `useArtifact(descriptor)` hook.
- Calling `resolveLayout(descriptors, geometry)` on every layout-relevant change.
- Projecting `ResolvedPlacement[]` to CSS via a thin, dumb mapper.
- Surfacing `faults` as `wave4:layout_fault` diagnostics (HUD + console under the active-surface flag).

Games own:

- Publishing descriptors. Nothing else. No layout code. No geometry. No measurements.

------------------------------------------------

## 7. Success criteria for Phase 2

- All interfaces above compile in isolation.
- Resolver is a pure function with the signature in §1.4.
- Cribbage's 18 descriptors (Phase 1 inventory) can be expressed without modification to the interface.
- Every conflict in the Phase 1 conflict matrix has a resolution path expressible in §2 (band solve, protected area, overlay demotion, or seat projection).
- No interface field exists solely for one game.

When all seven hold, Phase 2 is done and Phase 3 (felt host wiring + cribbage descriptor publication) begins.
