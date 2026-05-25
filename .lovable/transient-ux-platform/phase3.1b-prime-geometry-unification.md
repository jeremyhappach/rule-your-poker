# Phase 3.1b' — Geometry Unification (Option B)

**Status:** PLAN. No code yet. Blocks remainder of 3.1b.

## Why this phase exists

3.1a/3.1b were designed under an implicit **Option A** assumption:
each game family kept its own canonical felt geometry (Cribbage =
circle, everyone else = ellipse) and only the *ownership* of the felt
moved to the shell.

The approved end-state is **Option B**: a single shared canonical
table geometry platform-wide. From session entry through gameplay,
across every family, the user perceives the **same table**. Only the
gameplay artifacts layered on top differ.

This phase removes the Option-A artifacts already merged and lands
the shared geometry behind the existing `?shell_owned_felt=1` flag.

## Decisions (locked)

1. **Canonical geometry = current shared ellipse.** No new shape.
   Lowest churn for Gin / Yahtzee / Holm / 3-5-7 / Horses / SCC
   (already on the ellipse).
2. **Cribbage pegboard stays on-felt** during this phase, re-anchored
   to the shared ellipse. Lifting it into shell chrome is a separate
   UX redesign and explicitly out of scope here.
3. **Revert Option-A artifacts** introduced for Cribbage shell-owned
   felt: square sizing, `slate-200` Cribbage backdrop slab,
   `isCribbage` geometry branch at felt + host level.
4. **Flag stays OFF by default.** All validation happens behind
   `?shell_owned_felt=1`. No production behavior change until the
   shared-ellipse path is signed off.

## Target invariant (refined)

> At any instant during a session route there is exactly one DOM node
> with `data-canonical-felt-surface=""`, AND its geometry (shape,
> dimensions, positioning) is identical across every game family. The
> felt node mounts once on session entry and never unmounts.

## Scope

### A. Felt-level deunification (revert Option-A branches)

**`src/lib/canonicalShell/CanonicalFeltSurface.tsx`**
- Remove the `isCribbage` branch. Single felt class + style covering
  every `gameKind`:
  - `absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner overflow-hidden`
  - `background: linear-gradient(135deg, color, darkColor)` +
    inset shadow.
- Keep `data-canonical-felt-game` for diagnostics.
- Bridge overlay uses the ellipse `objectPosition` / `opacity` values
  for all families (drop the Cribbage `brightness(0.5)` cover branch).
- Plate variants (`dice` / `card` / `cribbage`) stay — they're
  content, not geometry. The Cribbage plate still renders its skunk
  subtitle line; only its *positioning frame* is now the shared
  ellipse plate slot.

**`src/lib/canonicalShell/ShellOwnedFeltHost.tsx`**
- Remove the `isCribbage` sizing branch. Host frame uses the same
  ellipse box as Holm / 3-5-7 / Yahtzee / Gin / Horses / SCC.
- Remove the Cribbage-specific `slate-200` backdrop slab added in
  the prior fix. The shell paints one neutral backdrop (existing
  shell-neutral surface) behind the single ellipse, identical across
  families.
- `stickyRef` continuity behavior is retained — that fix was correct
  and orthogonal to geometry.

**`src/components/CribbageMobileGameTable.tsx`**
- Remove the local `bg-slate-200` slab (lines ~5449-5453) — under
  shared geometry, the shell backdrop is the only backdrop and the
  local one is dead weight even with the flag OFF (visual parity is
  reachable via shell tokens; see validation step C-2).
- Replace the square `min(90vw, calc(55vh - 32px))` wrapper with the
  canonical ellipse wrapper used by other canonical families (read
  `tableSurfaceMaxHeight` from `useGeometryTokens()` instead of the
  inline `55vh` magic constant).
- Remove the inner square `relative z-10` clip box around the felt.
  The ellipse felt is the geometry; Cribbage content layers on top
  of the same ellipse.

### B. Cribbage content re-anchoring

The Cribbage table currently composes against a circle in a square
wrapper. Each on-felt element needs an ellipse-aware anchor:

| Element        | Current anchor               | New anchor strategy |
|----------------|------------------------------|---------------------|
| Pegboard       | centered inside the circle   | centered along ellipse minor axis, vertical position tuned so both pegs remain inside the ellipse at canonical breakpoints |
| Crib pile      | dealer-side of circle (~45° offset) | dealer-side of ellipse, projected onto the same arc angle but radius adapted to ellipse `rx/ry` |
| Cut card       | center-top of circle         | center-top of ellipse (no change in anchor semantics) |
| Player hands   | bottom arc of circle (fan)   | bottom arc of ellipse — the existing canonical seat anchor from `SeatAnchorLayer` already exposes ellipse-relative positions; reuse it |
| Turn spotlight | radial highlight from circle center | radial highlight from ellipse center; the gradient ramps along the ellipse major axis |
| Chip animations | start/end positions read from on-felt refs | unchanged — they read DOM refs, will track new positions automatically |

Implementation rules:
- **No new geometry math files.** Re-anchor via the existing
  `SeatAnchorLayer` + `useRequiredSeatAnchors` for seat-relative
  positions, and via `useGeometryTokens()` for ellipse dimensions.
- **No per-pixel tuning constants inside Cribbage components.** Any
  new anchor offset that's not derivable from existing tokens is a
  signal to extend `GeometryTokens`, not to hardcode in Cribbage.
- **Pegboard** keeps its existing scoring logic and identity-key
  stability (see mem://architecture/cribbage/pegboard-stability).
  Only its container's positioning style changes.

### C. Validation sequence

**C-1. Flag OFF parity (zero regression)**
With the flag OFF, after the revert + re-anchor:
- Cribbage renders against the shared ellipse instead of the legacy
  circle. This is a **visible** change from today's flag-OFF state.
- Hand boundary transitions, scoring, pegging, deferred-scoring flow,
  ante, and high-card draw must all still behave identically (logic
  untouched).
- Walk: waiting → high-card → ante → deal → pegging → counting →
  next hand → game end. Snapshot at each phase.

**C-2. Flag ON shared-geometry**
With `?shell_owned_felt=1`:
- DOM contains exactly one `[data-canonical-felt-surface]` continuously
  through every phase listed in C-1. Use the existing
  `useShellFeltInvariant` warn-only hook to confirm.
- The shell-mounted ellipse is visually identical to the flag-OFF
  ellipse from C-1 (same gradient, bridge overlay, plate).
- Cribbage chrome (pegboard / crib / cut / hands / spotlight)
  positions match the C-1 snapshots within tolerance.

**C-3. Cross-family non-regression**
With flag ON, smoke each canonical-shell family that already used
the ellipse:
- Gin Rummy — gameplay surface unchanged, shell felt persists.
- Yahtzee — gameplay surface unchanged, shell felt persists.
- Holm / 3-5-7 / Horses / SCC — flag has no effect today (they're
  not yet migrated to publish into the shell host); confirm visual
  state still matches the legacy local-felt baseline.

Validation gates are sequential — do not advance to the next family
cutover (3.1b waiting surface, 3.2 family migrations) until C-1 +
C-2 + C-3 all pass.

### D. Rollback strategy

- **Geometry rollback (worst case):** revert the
  `CanonicalFeltSurface` + `ShellOwnedFeltHost` changes; Cribbage
  re-anchoring revert restores the circle wrapper. The flag remains
  OFF in production throughout, so a rollback is a code revert with
  no runtime state surgery.
- **Partial rollback:** if Cribbage re-anchoring lands but a single
  on-felt element (e.g. pegboard) regresses visually, only that
  element's anchor block reverts to a Cribbage-local layout while
  felt geometry stays shared. The branch is contained to a Cribbage
  component, not to `CanonicalFeltSurface`.
- **Per-surface escape hatch:** `useShellFeltContext().shellOwnsFelt`
  still gates whether each surface publishes into the shell host.
  A surface that stops publishing reverts to its local ellipse felt
  render (which is now also the shared geometry — there is no path
  back to the circle except via the geometry rollback above).

## Files expected to change in 3.1b' implementation

- `src/lib/canonicalShell/CanonicalFeltSurface.tsx`
  — remove `isCribbage` geometry branch.
- `src/lib/canonicalShell/ShellOwnedFeltHost.tsx`
  — remove `isCribbage` sizing + backdrop branch.
- `src/components/CribbageMobileGameTable.tsx`
  — drop local backdrop + square wrapper; switch to ellipse wrapper;
    re-anchor pegboard / crib / cut / spotlight against ellipse.
- (likely) `src/components/CribbagePegBoard.tsx` container styles
  only — no scoring/identity logic change.
- (likely) `src/components/CribbageTurnSpotlight.tsx` to derive
  gradient extents from ellipse tokens.
- (possibly) `src/lib/canonicalShell/ResponsiveGeometryProvider.tsx`
  — promote any new ellipse-derived constant (e.g. pegboard vertical
  inset) into `GeometryTokens` rather than hardcoding in Cribbage.

No DB, sync, edge function, or RLS changes. No flag additions —
`isShellOwnedFeltEnabled()` continues to gate the cutover.

## Sequencing under Option B (revised)

```text
3.1a   shell-owned felt skeleton                          ✅ DONE
3.1b   mount host + Cribbage cutover (Option A)           ⚠️ PARTIAL — superseded
3.1b'  geometry unification (THIS PLAN)                   ← next
        - revert Option-A branches
        - shared ellipse shell-owned felt
        - Cribbage re-anchored on-felt
        - validate C-1 / C-2 / C-3
3.1c   waiting surface cutover (canonical families)
3.2    Holm / 3-5-7 / Horses / SCC per-family slot migration
        — already on ellipse, but each cutover re-validates against
          the unified canonical geometry
3.3    DealerGameSetup overlay migration
3.4    cleanup (retire WaitingForPlayersTable, dead siblings, flag)
3.5    invariant default-on + full smoke
```

## Open questions for 3.1b' kickoff

1. Cribbage on-felt pegboard at canonical ellipse aspect ratio: does
   the existing pegboard SVG fit inside the ellipse at the narrowest
   supported phone breakpoint (320×568) without clipping? If not,
   the answer is a `GeometryTokens.pegboardScale` derived from
   device class — not a Cribbage-local magic number.
2. Should the shared ellipse `tableSurfaceMaxHeight` (currently
   `55vh`) be reduced for Cribbage-on-ellipse so the pegboard +
   bottom-fan hands both fit comfortably? If yes, it's a single
   provider-level token change applied to every family (acceptable
   under Option B) or a `surfaceProfile` token (preferred — opens
   the door to future per-family tuning *without* re-introducing
   per-family geometry branches).
3. Plate variant for the unified ellipse: keep three plate variants
   (`dice` / `card` / `cribbage`) since they're content-only, or
   collapse to two (`compact` / `expanded`)? Recommendation: keep
   three for now; plate copy convergence is a separate content
   decision.

Awaiting approval to implement.
