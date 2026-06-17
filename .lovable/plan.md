# Wave 5D Implementation Plan — Anchored Compose Mode Infrastructure

Approved direction: build the infrastructure first, migrate nothing yet. Cribbage descriptors stay on the solver until Phase 4. No retuning in this plan.

## Guiding constraints (from review)

- Position and size are independent fields. Moving Pegboard = `anchorY: 0.42 → 0.37`, nothing else.
- `renderedBounds ⊆ availableGameplayViewport` is a hard runtime contract, not advisory.
- No silent `overflow: hidden` fixes.
- Anchored overlap stays advisory in v1; `anchoredCollisionPolicy: warn → fault` is a Phase 5 follow-up, not a blocker.
- No big-bang. Cribbage first. Other games later, one at a time.

---

## Phase 1 — Viewport derivation (resolver-only, no descriptors consume it yet)

Goal: produce `availableGameplayViewport` on every resolve pass, expose it on `ResolvedLayout.geometry`, prove it's stable across phases.

Work:

1. Extend `GeometryConstraints` consumer in `wave4LayoutResolver` to compute the viewport rect from `feltBounds` minus:
   - `announcementBand`
   - `topHudReserve`
   - `bottomHudReserve` (tabs + HUD stack)
   - `outerRailReserve`
   - `seatRingReserve`
   - `shellSafeAreas[*]`
   Using rectangular intersection → largest axis-aligned interior rect.
2. Emit `availableGameplayViewport` on `ResolvedLayout.geometry` with `derivedFrom` echo for diagnostics.
3. Fault `wave5:viewport_collapsed` when rect is empty.
4. Add invariant test: viewport is stable across `idle / discard / cut / pegging / counting` for a fixed `GeometryConstraints` snapshot.

Acceptance: viewport visible in the active-surface diagnostic HUD; no descriptor consumes it yet; no visual change.

---

## Phase 2 — `composeMode: "anchored"` descriptor + resolver stage

Goal: descriptors can declare anchored placement, resolver places them. Nothing in Cribbage uses it yet.

Work:

1. Extend descriptor types in `wave4LayoutResolver/types`:
   - `composeMode: 'anchored'`
   - `anchorX`, `anchorY`, `anchorOrigin` (default `center`)
   - `widthPct`, `heightPct`, `aspectRatio`
   - `anchorParent` (synthetic groups, §4.4)
2. Validation faults:
   - `anchored_size_underspecified` / `anchored_size_overspecified` per §3.2 truth table
   - `anchored_descriptor_declared_band`
   - `anchored_parent_cycle`
3. New resolver stage **F. Anchored placement**, inserted after overlay demotion, before seat projection:
   - Resolve viewport (Phase 1).
   - Resolve `anchorParent` chain first (topo order).
   - Compute size → origin point → rect.
   - Fault `anchored_outside_viewport` when rect escapes viewport.
   - Advisory `anchored_siblings_overlap` on intersection (no movement).
4. Anchored descriptors emit standard `ResolvedPlacement` so `ArtifactHost` / slot consumers don't need a new render path.
5. Unit tests for each size combination, each `anchorOrigin`, parent-chain resolution, and every fault code.

Acceptance: a synthetic test descriptor renders at declared anchor with declared size; moving `anchorY` moves only that artifact; no other resolver path changes behavior.

---

## Phase 3 — DOM-bounds invariant (runtime contract)

Goal: enforce `renderedBounds ⊆ availableGameplayViewport.rect` at the felt host.

Work:

1. In the felt host (where `ArtifactHost` mounts placements), attach a `ResizeObserver` to every anchored placement root. Also re-check on viewport-rect change.
2. Convert `getBoundingClientRect()` → felt-local vmin using the same projection as `feltBounds`.
3. On violation, emit `wave5:contract_violation` / `artifact_visual_overflow` with the full payload from spec §5.3 (assignedRect, renderedBounds, viewport, overflow per edge).
4. Surface in:
   - active-surface diagnostic HUD
   - `wave5:contract_violation` telemetry channel (new channel, not folded into `wave4:layout_fault`)
   - layout fault badge
5. Explicitly **do not** apply `overflow: hidden` to anchored hosts. The contract is "fit the envelope," not "hide the spill."

Acceptance: a deliberately oversized test artifact fires the violation with correct per-edge overflow numbers.

---

## Phase 4 — Cribbage migration (single game, feature-flagged)

Goal: cut Cribbage's four gameplay artifacts over to anchored. No retuning beyond the §7.2 starting values.

Work:

1. Add anchored descriptor variants behind a flag (`wave5d.cribbageAnchored`), defaulted **off**:
   - `cribbage.cribCutGroup` (synthetic group)
   - `cribbage.crib` (`anchorParent: cribCutGroup`)
   - `cribbage.cutCard` (`anchorParent: cribCutGroup`)
   - `cribbage.pegboard`
   - `cribbage.peggingRow` (pegging phase only)
   - `cribbage.countingRow` (counting phase only)
   Initial values verbatim from spec §7.2.
2. Solver-side `cribbage.gameplayColumn` and its play-band children remain in place behind the off flag.
3. Flag on → anchored emitters active, column children suppressed for the four migrated artifacts.
4. Smoke matrix: idle / discard / cut / pegging / counting × {seated, observer} × portrait/landscape.
5. Tune anchors and percentages in a follow-up turn after smoke — not in this phase. The deliverable here is "the architecture works on a live game," not "Cribbage is visually final."
6. `cribbage.gameplayColumn` retirement is deferred to Phase 4.5 (delete the descriptor + gap children) once the flag flips on by default.

Acceptance: with flag on, "move Pegboard up" is literally `anchorY: 0.42 → 0.37` in the descriptor file, and nothing else in the layout shifts.

---

## Phase 5 — Follow-ups (not in this plan, tracked here)

- `anchoredCollisionPolicy: warn | fault` config; default `warn`, promote intentional pairs to `fault`.
- Per-viewport-bucket anchor overrides (`responsiveOverrides` keyed by viewport bucket).
- Animation between anchored states.
- Sweep Holm → Gin Rummy → Yahtzee → SCC → Horses, one game per cutover, same Phase 4 pattern.

---

## What this plan explicitly does NOT do

- No descriptor edits to existing Cribbage artifacts.
- No retuning of pegboard/peggingRow/cribCut sizes or positions.
- No removal of `cribbage.gameplayColumn` (Phase 4.5).
- No anchored migration of any non-Cribbage game.
- No solver changes for HUD/chrome bands — they stay on `preferred/minimum/shrinkOrder/collapseOrder`.

---

## Technical surfaces touched

- `src/lib/wave4LayoutResolver/types.ts` — descriptor + ResolvedLayout extensions
- `src/lib/wave4LayoutResolver/resolver.ts` — viewport derivation + anchored stage
- `src/lib/wave4LayoutResolver/telemetry.ts` — `wave5:contract_violation` channel
- `src/lib/wave4LayoutResolver/ArtifactHost.tsx` — DOM-bounds observer for anchored placements
- `src/lib/wave4LayoutResolver/CanonicalConstraintReader.ts` — feed reserves into viewport derivation
- Cribbage geometry provider (Phase 4 only) — anchored descriptor emitters behind flag

---

## Sequencing & checkpoints

After each phase, stop and confirm before starting the next:

1. Phase 1 lands → confirm viewport rect on the diagnostic HUD looks right.
2. Phase 2 lands → confirm test descriptor moves independently.
3. Phase 3 lands → confirm violation fires on a synthetic overflow.
4. Phase 4 lands (flag off) → confirm zero visual diff.
5. Flag flip + tune → separate turn, separate review.
