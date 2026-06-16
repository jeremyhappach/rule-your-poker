# Wave 5 — Cribbage Gameplay Column Spec

Status: **spec only**. No code, no tests, no UI changes. This document is the
contract that the resolver, the provider, and every Cribbage gameplay slot
will be held to.

## 1. Problem Statement

Cribbage gameplay artifacts (`pegboard`, `crib`, `cutCard`, `peggingRow`,
`countingRow`) currently negotiate as **independent flow items** inside the
play band. The resolver sorts them by `priority` desc, ties by `id` asc, and
produces:

```
pegboard(92) → countingRow(92) → peggingRow(90) → cutCard(75) → crib(60)
```

The **intended** Cribbage reading order is:

```
pegboard
  ↓ proportional gap
crib + cutCard (side-by-side)
  ↓ proportional gap
peggingRow XOR countingRow
  ↓ bottom safe area
HUD
```

The two orderings are not reconcilable by tuning priorities. Priority drives
shrink/collapse resistance — it must not be overloaded with sibling ordering.
The model is missing a **parent layout contract** that pins child order and
distributes slack proportionally between siblings.

## 2. New Descriptor: `cribbage.gameplayColumn`

A new descriptor that owns the entire Cribbage play band as a single
fixed-order 1-D column.

```ts
{
  id: "cribbage.gameplayColumn",
  owner: "CribbageGameplayGeometryProvider",
  band: "play",
  composeMode: "group",        // NEW — see §3
  axis: "y",                   // explicit; the resolver no longer infers
  preferredSize: { width: vmin(100), height: vmin(100) }, // fills band
  minimumSize:   { width: vmin(60),  height: vmin(40)  },
  priority: 95,                // group itself is shrink-resistant
  collapsePriority: "never",   // the column cannot disappear
  safeAreaDependencies: ["play", "announcement", "bottomHud"],
  children: [
    { kind: "child",  id: "cribbage.pegboard" },
    { kind: "gap",    id: "cribbage.gap.pegboardToCribCut", weight: 1, min: vmin(1) },
    { kind: "child",  id: "cribbage.cribCutGroup" },
    { kind: "gap",    id: "cribbage.gap.cribCutToPlayRow",  weight: 1, min: vmin(1) },
    { kind: "child",  id: "cribbage.peggingRow" }, // OR cribbage.countingRow
  ],
}
```

`cribbage.cribCutGroup` is itself a nested `group` along axis `x`:

```ts
{
  id: "cribbage.cribCutGroup",
  composeMode: "group",
  axis: "x",
  preferredSize: { width: vmin(40), height: vmin(8) },
  minimumSize:   { width: vmin(24), height: vmin(6) },
  aspectRatio: undefined,       // children own their own aspect ratios
  priority: 70,
  collapsePriority: "mid",
  children: [
    { kind: "child", id: "cribbage.crib" },
    { kind: "gap",   id: "cribbage.gap.cribToCut", weight: 1, min: vmin(1) },
    { kind: "child", id: "cribbage.cutCard" },
  ],
}
```

Children (`cribbage.pegboard`, `cribbage.crib`, `cribbage.cutCard`,
`cribbage.peggingRow`, `cribbage.countingRow`) keep their existing aspect
ratios, preferred sizes, and minimum sizes. Their `band` field is repurposed
inside a group to mean "parent group is responsible for placing me" — the
top-level band solve **must not** see them as flow items.

## 3. Resolver Extension: `composeMode: "group"`

Add a new branch to the resolver. Pure, single-pass, deterministic.

### 3.1 Validation (Stage A additions)

- A descriptor with `composeMode: "group"` must declare `axis: "x" | "y"`
  and a non-empty `children` array.
- Each `children[i]` is either `{ kind: "child", id }` or
  `{ kind: "gap", id, weight, min? }`. Unknown kinds → fault
  `group_child_invalid`.
- Every referenced child `id` must exist in the descriptor set. Missing
  reference → fault `group_child_missing`.
- A child id may appear in **at most one** group. Duplicate parent →
  fault `group_child_multiple_parents`.
- A child that is referenced by a group is removed from the top-level band
  solve. The group's own `band` is the only entry point.

### 3.2 Group solve (new Stage C.5)

For each `group` descriptor, after the parent band assigns it a rect:

1. Let `extent = rect[axis]` (primary axis) and `cross = rect[otherAxis]`.
2. Sum every child's `preferredSize[axis]` → `prefSum`.
3. Sum every gap's `min` → `gapMin`. Sum every gap's `weight` → `weightSum`.
4. **Fits**: if `prefSum + gapMin ≤ extent`, allocate each child its
   preferred extent and distribute the remaining slack
   `extent − prefSum − gapMin` across gaps in proportion to `weight`.
5. **Tight**: if `prefSum + gapMin > extent`, shrink children in
   preservation order (§4) toward their `minimumSize[axis]`, holding gaps
   at `min` until children are at their minimums. Then shrink gaps below
   `min` is forbidden — instead collapse children in collapse order (§4)
   and re-solve once.
6. **Impossible**: if every preservation-eligible child is at minimum and
   the column still overflows, emit fault
   `group_min_exceeds_extent` with the group id and the offending children.
7. After primary-axis allocation, apply each child's `aspectRatio` against
   `cross`. If the cross extent cannot honor it, emit
   `aspect_unhonorable` for that child (existing fault, group-aware).
8. Place children sequentially along `axis` in **declared order**. Position
   is the cumulative sum of prior children + prior gaps. Priority **never**
   reorders children inside a group.
9. The group's final placement is the union rect of its children + gaps.
   The group itself is emitted as a `ResolvedPlacement` so consumers can
   read the column rect directly.

### 3.3 Nested groups

`cribbage.cribCutGroup` resolves recursively after its parent assigns its
rect. The recursion is bounded by descriptor depth at validation time; no
loops are possible because group→child references form a DAG (a child has
at most one parent, §3.1).

### 3.4 Bottom clamp invariant

The resolver always honors `safeAreaDependencies`. For `cribbage.gameplayColumn`
the `bottomHud` dependency means the column's bottom edge **must** sit above
`geometry.bottomHudReserve.y`. This is enforced by clipping the column's
assigned rect during Stage C — not by per-child math. PeggingRow/CountingRow
inherit this safety automatically because they are the last child.

## 4. Preservation & Collapse Order (Cribbage column)

Shrink preservation order (most → least preserved):

1. `peggingRow` / `countingRow` readability (whichever is active)
2. `pegboard` readability
3. `cutCard`
4. `crib`
5. decorative gaps (`gap.*` shrink to `min` first, before any child)

Collapse order (first to disappear under extreme pressure):

1. `gap.pegboardToCribCut` and `gap.cribCutToPlayRow` (gaps collapse to 0
   before any child is removed)
2. `crib` (collapse to invisible — game still playable)
3. `cutCard` (collapse to invisible)
4. `cribCutGroup` (whole group disappears once both children are gone)
5. `pegboard` (last — Cribbage cannot proceed without it; emit
   `last_min_exceeds_band` if even this is forced)
6. `peggingRow`/`countingRow` is `collapsePriority: "never"` — emit
   `never_min_exceeds_band` rather than hide it.

If the impossible case is reached, emit `wave4:layout_fault`. Never overlap,
never silently clip, never escape the band.

## 5. Coordinate Model

All values are expressed as one of:

- `vmin` lengths (`preferredSize`, `minimumSize`, gap `min`)
- unitless ratios (`aspectRatio`)
- unitless weights (gap `weight`)
- enums (`axis`, `composeMode`, `collapsePriority`)
- fixed declared order (`children` array)

**Forbidden inside this spec and any consumer:**

- `top-[N%]`, `left-[N%]` Tailwind classes for gameplay artifacts
- pixel offsets (`+10px`, `mt-1`, `pt-1`, `-translate-y-1/2 px-2`)
- per-game CSS percentages
- magic nudges anywhere ("looks right at 18%")

If a layout requires a nudge, the nudge belongs in a descriptor's
`preferredSize` / `minimumSize` / `aspectRatio` / gap `weight` — never in CSS.

## 6. ResolvedLayout Shape

The resolver continues to return a flat `placements` array. Groups and their
children are all emitted as siblings; relationships are recoverable via the
`parentId` field added to `ResolvedPlacement`:

```ts
interface ResolvedPlacement {
  id: string;
  parentId?: string;         // NEW — set when this placement is inside a group
  rect: Rect;                // final felt-coord rect (absolute, vmin)
  visible: boolean;
  collapsedReason?: 'pressure' | 'dependencyMissing' | 'overlayDemoted' | 'parentCollapsed';
  appliedAspectRatio: boolean;
}
```

Required placements emitted for an active Cribbage frame:

- `cribbage.gameplayColumn`            (group root)
- `cribbage.pegboard`                  (parentId: `cribbage.gameplayColumn`)
- `cribbage.cribCutGroup`              (parentId: `cribbage.gameplayColumn`)
- `cribbage.crib`                      (parentId: `cribbage.cribCutGroup`)
- `cribbage.cutCard`                   (parentId: `cribbage.cribCutGroup`)
- `cribbage.peggingRow`                (parentId: `cribbage.gameplayColumn`)
- `cribbage.countingRow`               (parentId: `cribbage.gameplayColumn`)

PeggingRow XOR CountingRow mutual exclusion is preserved at the descriptor
factory layer (`getCribbageArtifactDescriptors`) — only one is emitted per
frame. Both ids appear in this list so consumers know which to look up; the
resolver only places the one that was emitted.

Gap placements (`cribbage.gap.*`) are emitted with `visible: false` and a
non-zero rect that describes the reserved whitespace. Consumers should
ignore them; they exist for diagnostics and faults only.

## 7. Consumer Model

### 7.1 Generalization — one primitive, not many

`composeMode: "group"` + `axis: "x" | "y"` is the **only** nested-layout
primitive added to the resolver. We do NOT add `"column"`, `"row"`,
`"stack"`, or any other game-shaped mode. Gin, Yahtzee, Holm, 3-5-7, and
every future game compose their own layouts from the same `group` primitive.

### 7.2 `CribbageGameplayGeometryProvider`

A new React provider, mounted once near the top of `CribbageMobileGameTable`,
inside the canonical shell tree and below the live geometry constraints. It
is the **single geometry authority** for the Cribbage play band.

Responsibilities:

1. Build the Cribbage descriptor set **once per frame** using
   `getCribbageArtifactDescriptors(opts)` plus the new column/group
   descriptors.
2. Call `resolveLayout(descriptors, geometry)` **once** per geometry +
   descriptor change.
3. Expose a stable context value:

```ts
interface CribbageGameplayGeometryContext {
  placementsById: ReadonlyMap<string, ResolvedPlacement>;
  lastValidPlacementsById: ReadonlyMap<string, ResolvedPlacement>;
  faults: ReadonlyArray<LayoutFault>;
  getPlacement(id: string): ResolvedPlacement | undefined;
  getLastValidPlacement(id: string): ResolvedPlacement | undefined;
}
```

4. Maintain `lastValidPlacementsById` — the most recent placement per id
   that resolved without a fault. Updated atomically on every successful
   resolve. Survives geometry hiccups, cold starts, and brief unmounts of
   upstream measurements.
5. Emit `wave4:layout_fault` telemetry exactly once per unique fault set.

### 7.3 Slot consumer rule (invariant)

> **Gameplay slots may NEVER call `resolveLayout()`.**

`Wave4PegboardSlot`, `Wave4PeggingRowSlot`, and every future Cribbage
gameplay slot **must** read their placement from the provider via
`useCribbageGameplayGeometry().getPlacement(id)` (or
`getLastValidPlacement(id)`).

Independent calls to `resolveLayout` from inside slots are forbidden. This
prevents descriptor drift, placement drift, and multiple resolves with
slightly different inputs. Violations reintroduce sibling drift exactly like
the current hardcoded `top-[N%]` rows.

### 7.4 Pre-measurement / unavailable-placement policy

The provider exposes both `current` and `lastValid` placements; consumers
choose their own fallback policy. Acceptable choices today include:

- current placement (when present)
- last-valid placement (avoids cold-start gaps, observer fly-ins, HUD flashes)
- skeleton
- `null`

The contract does **not** mandate which to pick. Past pain (observer
fly-ins, HUD flashes, cold-start gaps, early render races) means the policy
must remain tunable per slot and per phase, not baked into the contract.
Slots that previously rendered with hardcoded `top-[N%]` should default to
`lastValid → current` to avoid regressions.

## 8. Migration Path

All phases are sequential. Each phase is independently revertable.

1. **Phase 1 — Spec** *(this document)*. No code.
2. **Phase 2 — Resolver tests**. Add fixtures for `composeMode: "group"`,
   nested groups, preservation/collapse order, bottom-clamp invariant, and
   the three new fault codes. Tests fail until Phase 3 lands the resolver
   change. Resolver source not yet edited.
3. **Phase 3 — Group resolver + provider scaffold**. Implement the `group`
   resolver branch, `parentId` on `ResolvedPlacement`, the three new fault
   codes, and the `CribbageGameplayGeometryProvider` (including
   `lastValidPlacementsById`). Provider is mounted but **no slot consumes
   it yet**. All Phase 2 tests pass.
4. **Phase 4 — Pegboard + PeggingRow cutover**. `Wave4PegboardSlot` and
   `Wave4PeggingRowSlot` read placements from the provider. **Fallbacks
   retained** during this phase to absorb cold-start and pre-measurement
   races. No `resolveLayout` calls inside slots.
5. **Phase 5 — CountingRow**. Migrate `CribbageCountingPhase`'s
   `top-[58%]` row to a new `Wave4CountingRowSlot` that reads from the
   provider. PeggingRow/CountingRow XOR validated end-to-end. Fallbacks
   still retained.
6. **Phase 6 — Crib + Cut group**. Migrate `CribbageFeltContent`'s
   `top-[17%]` crib row and `CribbageCutCardReveal` into
   `Wave4CribSlot` + `Wave4CutCardSlot`, both reading from the provider's
   `cribbage.cribCutGroup` children.
7. **Phase 7 — Cleanup**. Remove remaining `top-[N%]` / `mt-1` / `pt-1` /
   `+Npx` Cribbage gameplay positional classes confirmed obsolete by
   Phases 4–6. Retire fallback paths on a per-slot basis only after
   `lastValidPlacements` has demonstrably eliminated the original race.

After Phase 7, the Cribbage play band has exactly one resolution per
frame, exactly one source of truth for vertical order, and zero CSS
percentage anchors for gameplay geometry that proved unnecessary.

## 9. Acceptance

This spec is correct when all of the following hold:

- One nested-layout primitive only: `composeMode: "group"` + `axis`. No
  `"column"` / `"row"` / `"stack"` modes.
- Cribbage gameplay artifacts are **children of a fixed-order group**, not
  siblings in the band's priority sort.
- `priority` controls shrink/collapse only. It never reorders siblings.
- All vertical placement is expressed via ratios, weights, aspect ratios,
  preferred/minimum sizes, and declared order. No CSS `top-[N%]`, no px.
- PeggingRow/CountingRow bottom is structurally clamped above `bottomHud`.
- A single `CribbageGameplayGeometryProvider` owns the resolution. Slots
  consume; **slots never call `resolveLayout()`**.
- Provider exposes both current and `lastValid` placements; pre-measurement
  policy is consumer-chosen, not contract-mandated.
- Impossible layouts emit explicit `wave4:layout_fault` events. No silent
  clipping, overlap, or band escape is permitted.

No live UI changes are introduced by this spec.
