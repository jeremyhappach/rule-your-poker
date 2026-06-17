# Wave 5D — Anchored Compose Mode (Spec)

Status: spec only. No code, no descriptor edits, no UI changes.

This document defines the end-state positioning model for **gameplay
artifacts**. It does not replace the existing constraint solver — the solver
remains correct and useful for HUD/chrome bands where artifacts genuinely
compete for a strip. It introduces a parallel placement mode for the gameplay
viewport, where position and size are **declared**, not emergent.

------------------------------------------------------------------------------

## 1. Why a new mode

The current solver expresses every artifact as:

```
preferred + minimum + shrinkOrder + collapseOrder
```

This is correct for HUD chrome (chips, tabs, badges packed into a 1-D strip).
It is **structurally wrong** for gameplay artifacts (pegboard, crib, cut,
pegging row, counting row), for three reasons:

1. **Position is emergent, not declared.** To move Pegboard up, you must
   shrink a sibling above it or reorder shrink. The designer cannot say
   "Pegboard sits at 35% down the gameplay viewport."
2. **Size and position are entangled.** Changing `preferred.height` to move
   an artifact has size side effects, and vice versa.
3. **Overlap is treated as a negotiation, not a contract violation.** Under
   pressure the solver shrinks and collapses; under no pressure it distributes
   slack. Neither mode lets the designer say "these two artifacts never
   overlap, by construction."

Wave 5D fixes this by introducing **`composeMode: "anchored"`**, where each
gameplay artifact declares:

```
where it lives  (anchorX, anchorY)
how big it is   (widthPct, heightPct, aspectRatio)
```

…both expressed as proportions of a **single shared coordinate space**, the
`availableGameplayViewport`.

------------------------------------------------------------------------------

## 2. availableGameplayViewport

The coordinate space gameplay artifacts live in. Derived **once per resolve
pass** from canonical shell geometry by subtracting all structural reserves
from the felt bounds.

### 2.1 Definition

```ts
interface AvailableGameplayViewport {
  rect: Rect;            // in vmin, felt-local coordinates
  // Echo of the inputs used to derive `rect`, for diagnostics and tests.
  derivedFrom: {
    feltBounds: Rect;
    subtracted: {
      announcementBand: Rect;
      topHudReserve: Rect;
      bottomHudReserve: Rect;     // includes tab rail / HUD stack
      outerRailReserve: Rect;     // structural seat ring + rail
      seatRingReserve: Rect;      // inner reserve around seat ring
      shellSafeAreas: ReadonlyArray<Rect>;
    };
  };
}
```

### 2.2 Derivation rule

```
availableGameplayViewport.rect =
  feltBounds
    minus topHudReserve
    minus announcementBand
    minus seatRingReserve          // ring + chip anchors + nameplates
    minus bottomHudReserve         // tabs, hand, chrome
    minus outerRailReserve
    minus shellSafeAreas[*]
```

The subtraction is **rectangular intersection**, not flow packing. The
resulting rect is the **largest axis-aligned interior rectangle** that
contains no structural reserve.

### 2.3 Invariants

- `availableGameplayViewport.rect` is **non-empty** in every valid layout.
  Empty → fault `wave5:viewport_collapsed`.
- It is **stable across phases** (idle / discard / cut / pegging / counting).
  Phase changes affect which artifacts are emitted, not the viewport itself.
- It is **owned by the canonical shell**, not by any game. Games consume it
  read-only.
- It is **echoed in `ResolvedLayout.geometry`** so consumers (and tests) can
  assert against the exact rect that anchors were resolved against.

### 2.4 What it is not

- Not the `play` band. The `play` band is a solver band. The viewport may
  match it in trivial cases but is a separate concept.
- Not the `gameplayColumn` group. The column was a transitional construct
  for the solver model and is **superseded** for gameplay artifacts by this
  viewport.
- Not negotiable. Gameplay artifacts cannot expand it; HUD/chrome cannot
  shrink it without changing their own reserve.

------------------------------------------------------------------------------

## 3. composeMode: "anchored"

### 3.1 Descriptor extension

```ts
type ComposeMode =
  | 'flow'           // existing — band 1-D solve
  | 'overlay'        // existing
  | 'seatBound'      // existing
  | 'chipBound'      // existing
  | 'centerpiece'    // existing
  | 'anchored';      // NEW — gameplay viewport, declared position + size

type AnchorOrigin =
  | 'center'         // default
  | 'topLeft'
  | 'topCenter'
  | 'bottomCenter'
  | 'leftCenter'
  | 'rightCenter';

interface AnchoredDescriptor extends BaseDescriptor {
  composeMode: 'anchored';

  anchorX: number;          // 0..1, fraction of viewport width
  anchorY: number;          // 0..1, fraction of viewport height
  anchorOrigin?: AnchorOrigin; // default 'center'

  widthPct?: number;        // 0..1, fraction of viewport width
  heightPct?: number;       // 0..1, fraction of viewport height
  aspectRatio?: number;     // width / height

  // Anchored artifacts do not participate in band negotiation. They have
  // no preferred/minimum/shrinkOrder/collapsePriority. Attempting to
  // declare those fields on an anchored descriptor is a validation fault.

  // Optional: bind to a synthetic group rect (see §4.2) instead of
  // availableGameplayViewport. The group rect is itself anchored.
  anchorParent?: string;    // descriptor id of an anchored group
}
```

### 3.2 Size resolution

Exactly one of the following combinations must be declared:

| widthPct | heightPct | aspectRatio | Resolution                                  |
| -------- | --------- | ----------- | ------------------------------------------- |
| ✓        | ✓         | —           | Both honored verbatim                       |
| ✓        | —         | ✓           | `height = width / aspectRatio`              |
| —        | ✓         | ✓           | `width  = height * aspectRatio`             |
| ✓        | —         | —           | Fault `anchored_size_underspecified`        |
| —        | ✓         | —           | Fault `anchored_size_underspecified`        |
| —        | —         | ✓           | Fault `anchored_size_underspecified`        |
| —        | —         | —           | Fault `anchored_size_underspecified`        |
| ✓        | ✓         | ✓           | Fault `anchored_size_overspecified`         |

All sizes are computed against `availableGameplayViewport.rect` (or the
parent group rect when `anchorParent` is set).

### 3.3 Position resolution

Anchor maps a point on the artifact to a point on the viewport:

```
viewportPoint = (rect.x + anchorX * rect.width,
                 rect.y + anchorY * rect.height)
```

The artifact's `anchorOrigin` determines which point of the artifact lands
on `viewportPoint`:

- `center`        → artifact center
- `topLeft`       → artifact (left, top)
- `topCenter`     → artifact (centerX, top)
- `bottomCenter`  → artifact (centerX, bottom)
- `leftCenter`    → artifact (left, centerY)
- `rightCenter`   → artifact (right, centerY)

Default is `center`. The resolver then computes the artifact's `Rect` from
the chosen origin and the resolved size.

### 3.4 Independence

Moving and resizing are **independent**:

```
move:   anchorY 0.42 → 0.37    (size unchanged)
resize: widthPct 0.70 → 0.75   (position unchanged)
```

No sibling is touched. No shrink pass runs. No gap weight matters.

### 3.5 No band membership

Anchored descriptors do **not** declare a `band`. They live in the gameplay
viewport, which is not a band. The `band` field, if present on an anchored
descriptor, is a validation fault (`anchored_descriptor_declared_band`).

------------------------------------------------------------------------------

## 4. Resolver behavior

Anchored placement is added as a **new stage** in the resolver pipeline. It
runs **after** band solving and **before** seat projection, so anchored
artifacts can be DOM-bounds-checked against HUD reserves the solver has
just confirmed.

### 4.1 Pipeline (updated)

```
A. Validate
B. Partition by composeMode
C. Band solve            (flow descriptors — unchanged)
D. Protected-area pass   (unchanged)
E. Overlay demotion      (unchanged)
F. Anchored placement    (NEW)
G. Seat projection       (unchanged)
H. Emit
```

### 4.2 Anchored placement stage

1. Compute `availableGameplayViewport.rect` from `GeometryConstraints`.
2. For each anchored descriptor, resolve size (§3.2) and position (§3.3).
3. If a descriptor declares `anchorParent`, resolve the parent first, then
   resolve the child against the parent's rect instead of the viewport.
   Cycles → fault `anchored_parent_cycle`.
4. Emit `ResolvedPlacement` with the resolved rect. No collapse, no shrink,
   no priority. If the resolved rect falls outside the viewport, fault
   `anchored_outside_viewport` (this is a declaration bug, not a render bug).

### 4.3 No sibling interaction

Anchored artifacts do not negotiate with each other or with flow artifacts.
**Overlap between anchored artifacts is the designer's responsibility.**
The resolver emits an advisory `anchored_siblings_overlap` fault when two
anchored placements intersect, but does not move either one. The fix lives
in the descriptors.

### 4.4 Synthetic groups

A group like `cribbage.cribCutGroup` is itself an anchored descriptor with
no rendered content; it exists only to host child anchors. Children declare
`anchorParent: "cribbage.cribCutGroup"` and resolve against the group rect.
This lets the designer move the whole group with one number while keeping
crib/cut at fixed relative positions.

------------------------------------------------------------------------------

## 5. DOM-bounds invariant

The most important contract in Wave 5D.

### 5.1 Statement

For every anchored placement `P`:

```
renderedBounds(P) ⊆ availableGameplayViewport.rect
```

`renderedBounds(P)` is the **actual DOM** `getBoundingClientRect()` of the
artifact's root element, converted to felt-local vmin via the same
projection used for `feltBounds`.

This invariant is checked **post-mount and post-layout**, in the felt host,
not in the pure resolver.

### 5.2 What it forbids

- An anchored artifact whose internal content (cards, labels, glyphs) is
  larger than its assigned rect and overflows into the HUD, tab rail,
  announcement band, or seat ring.
- An anchored artifact with internal padding, transforms, or shadows that
  extend past its assigned rect into structural reserves.
- Silent clipping (`overflow: hidden`) as the resolution. Clipping is not
  a fix; it is a way to hide a contract violation.

### 5.3 Detection

The felt host runs a `ResizeObserver` (or equivalent post-layout hook) on
every anchored placement's root. On every layout-relevant change:

1. Read `renderedBounds`.
2. Read `availableGameplayViewport.rect`.
3. If `renderedBounds ⊄ viewport.rect`, emit:

```ts
{
  type: 'wave5:contract_violation',
  code: 'artifact_visual_overflow',
  artifactId: P.id,
  assignedRect: P.rect,
  renderedBounds,
  viewport: viewport.rect,
  overflow: {
    top:    max(0, viewport.top    - renderedBounds.top),
    bottom: max(0, renderedBounds.bottom - viewport.bottom),
    left:   max(0, viewport.left   - renderedBounds.left),
    right:  max(0, renderedBounds.right  - viewport.right),
  },
}
```

The violation surfaces in:

- the active-surface diagnostic HUD (mobile runtime)
- the `wave5:contract_violation` telemetry channel
- the layout fault badge

### 5.4 What the violation means

A `artifact_visual_overflow` event is **always** one of:

1. The artifact's internal rendering ignores its assigned rect (fix: make
   the artifact's children proportional to the rect, the Phase 4B pattern).
2. The descriptor's `widthPct/heightPct/aspectRatio` are wrong for the
   content (fix: adjust the descriptor).
3. The viewport derivation is wrong (fix: canonical shell reserve).

It is **never** "the solver should have shrunk more." Anchored artifacts do
not shrink.

------------------------------------------------------------------------------

## 6. What is preserved from current work

Wave 5D reuses, unchanged:

- `CribbageGameplayGeometryProvider` — one provider per game per frame.
- One descriptor set per frame, one resolve pass, one placement hash.
- Slot components consume provider; no slot calls `resolveLayout` directly.
- `parentId` (for anchored groups, see §4.4) and `lastValidPlacements`
  (for cold-start stability).
- The existing solver pipeline for HUD/announcement/tabs/bottom HUD bands.
- All seat/chip-bound projection.

Wave 5D supersedes, for gameplay artifacts only:

- The `cribbage.gameplayColumn` group and its child weight/shrink config.
  Pegboard / cribCutGroup / peggingRow / countingRow stop being flow
  children of a column and become anchored descriptors against
  `availableGameplayViewport`.

The column descriptor is **not removed** by this spec; its removal is a
later migration step (§7.5).

------------------------------------------------------------------------------

## 7. Cribbage migration path (initial proposal — not applied here)

### 7.1 Artifacts to migrate

| id                          | new composeMode | notes                                           |
| --------------------------- | --------------- | ----------------------------------------------- |
| `cribbage.cribCutGroup`     | `anchored`      | Synthetic group; hosts `crib` + `cutCard`.      |
| `cribbage.crib`             | `anchored`      | `anchorParent: cribbage.cribCutGroup`.          |
| `cribbage.cutCard`          | `anchored`      | `anchorParent: cribbage.cribCutGroup`.          |
| `cribbage.pegboard`         | `anchored`      | `aspectRatio: 6`.                               |
| `cribbage.peggingRow`       | `anchored`      | Emitted only in `pegging` phase.                |
| `cribbage.countingRow`      | `anchored`      | Emitted only in `counting` phase.               |

### 7.2 Initial values (starting point, designer-tunable)

```ts
cribbage.cribCutGroup = {
  composeMode: 'anchored',
  anchorX: 0.50, anchorY: 0.18, anchorOrigin: 'topCenter',
  widthPct: 0.30, heightPct: 0.12,
};

cribbage.pegboard = {
  composeMode: 'anchored',
  anchorX: 0.50, anchorY: 0.42, anchorOrigin: 'center',
  widthPct: 0.70, aspectRatio: 6,
};

cribbage.peggingRow = {
  composeMode: 'anchored',
  anchorX: 0.50, anchorY: 0.78, anchorOrigin: 'bottomCenter',
  widthPct: 0.85, heightPct: 0.18,
};

cribbage.countingRow = {
  composeMode: 'anchored',
  anchorX: 0.50, anchorY: 0.78, anchorOrigin: 'bottomCenter',
  widthPct: 0.90, heightPct: 0.20,
};
```

These values are **starting points**, intended to be visually iterated by
the designer changing only the anchor/size numbers. No solver tuning.

### 7.3 Artifacts NOT migrated

- `cribbage.announcement`, `cribbage.topHud`, `cribbage.gameTitle`,
  `cribbage.parameterChips`, `cribbage.bottomHud`, `cribbage.tabs`,
  `cribbage.myHand` — stay on the solver. They are HUD/chrome and the
  packing model is correct for them.
- `cribbage.opponentCardBacks.*`, `cribbage.spotlight` — stay on
  `chipBound` / `seatBound`. They are seat-projected.

### 7.4 Migration steps (later, not in this spec)

1. Implement `composeMode: 'anchored'` and viewport derivation in resolver.
2. Implement DOM-bounds invariant in felt host.
3. Add anchored variants of the five descriptors above; keep solver
   variants behind a flag for one release.
4. Cut over Cribbage to anchored; remove `cribbage.gameplayColumn` and its
   gap children.
5. Sweep other games (Holm, SCC, Horses, Yahtzee, Gin Rummy) one at a time.

### 7.5 `cribbage.gameplayColumn` retirement

Once the four play-band artifacts are anchored, `gameplayColumn` has no
children worth packing and is deleted. The deletion is the signal that
Cribbage migration is complete.

------------------------------------------------------------------------------

## 8. Faults introduced

| code                              | meaning                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `wave5:viewport_collapsed`        | `availableGameplayViewport.rect` is empty.                             |
| `anchored_size_underspecified`    | Anchored descriptor missing required size fields (§3.2).               |
| `anchored_size_overspecified`     | Anchored descriptor over-constrained (widthPct + heightPct + aspect).  |
| `anchored_descriptor_declared_band` | Anchored descriptor illegally targets a band.                        |
| `anchored_parent_cycle`           | `anchorParent` chain forms a cycle.                                    |
| `anchored_outside_viewport`       | Resolved rect falls outside the viewport (declaration bug).            |
| `anchored_siblings_overlap`       | Advisory: two anchored placements intersect.                           |
| `wave5:contract_violation` / `artifact_visual_overflow` | DOM bounds exceed viewport (runtime).        |

All faults flow through the existing `wave4:layout_fault` channel except
`artifact_visual_overflow`, which uses a new `wave5:contract_violation`
channel to distinguish runtime DOM violations from pure-resolver faults.

------------------------------------------------------------------------------

## 9. Acceptance for the spec

This spec is complete when:

- ☑ Size and anchor are independent fields on the descriptor.
- ☑ Gameplay artifact position is **declared**, not emergent from sibling
  order or shrink passes.
- ☑ HUD infringement is impossible **by contract**: the viewport excludes
  HUD/announcement/tab/seat reserves, and the DOM-bounds invariant fires
  on visual overflow.
- ☑ The existing solver is preserved for HUD/chrome bands.
- ☑ Anchored resolution rules are unambiguous (§3.2, §3.3, §4.2).
- ☑ Visual overflow detection is defined at the DOM level, not the rect
  level (§5).
- ☑ A concrete Cribbage migration path is described (§7), with starting
  anchor/size values designers can tune without touching the solver.

------------------------------------------------------------------------------

## 10. Out of scope

- Animation between anchored states (no `anchorY` tweening defined here).
- Per-viewport-bucket anchor overrides (e.g. landscape vs portrait). If
  needed, add later as a `responsiveOverrides` map keyed by viewport bucket.
- Anchored descriptors for non-Cribbage games. Spec'd here, migrated later.
- Removal of the solver-side `cribbage.gameplayColumn` (separate migration).

------------------------------------------------------------------------------

## 11. One-line summary

> **The gameplay viewport is a canvas, not a flexbox.** Gameplay artifacts
> declare where they are and how big they are, against a single shared
> coordinate space that already excludes every structural reserve. The
> resolver places them; the DOM proves they fit; the designer iterates by
> changing two numbers.
