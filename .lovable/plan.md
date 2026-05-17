# Phase 4 — PersistentTableShell scaffolding (scope proposal)

This is the first phase that begins ownership/lifecycle architecture work. To stay disciplined, Phase 4 is intentionally split: **scaffolding only**, no lifecycle restructuring of `Game.tsx`, no overlay consolidation, no visual change.

## Objective

Introduce a `PersistentTableShell` component that establishes the canonical shell ownership boundary (seat anchors + geometry tokens + diagnostics root), and mount it inside `MobileGameTable` as a transparent wrapper around the existing playfield. The shell does **not yet** persist across lifecycle phases — `Game.tsx` branching remains untouched. This phase only validates that the shell wrapper introduces zero regression while giving later phases a single anchor to lift above `Game.tsx` branches.

## In scope

1. **New module**: `src/lib/canonicalShell/PersistentTableShell.tsx`
   - Composes `SeatAnchorLayer` (already exists) over its children.
   - Reads `useGeometryTokensOptional()` to stamp a `data-shell-device` attribute on its root for diagnostics. Does NOT introduce a new provider; relies on the app-root `ResponsiveGeometryProvider` from Phase 3.
   - Renders `<div data-canonical-shell-root>` as a transparent container (no styling, no positioning) wrapping `children`.
   - Emits one `recordShellEvent('shell-mount', …)` on mount and `'shell-unmount'` on unmount with `{ gameId, gameType, viewerPosition }` for telemetry.
   - Props: `{ projectionMode, viewerPosition, seats, gameId, gameType, children }` — same inputs that `SeatAnchorLayer` already consumes in MobileGameTable.

2. **Wire into `MobileGameTable.tsx`**
   - The existing inline `<SeatAnchorLayer>` usage (Phase 1) is replaced by `<PersistentTableShell>` with the same props. SeatAnchorLayer remains the internal composition, so `useSeatAnchors()` consumers are unaffected.
   - No DOM hierarchy change beyond an additional transparent wrapper `div`. No className, no positioning, no z-index.
   - No change to overlay mounting, chip transport, sync framework, or lifecycle.

3. **Tests**: `src/lib/canonicalShell/PersistentTableShell.test.tsx`
   - Mounts shell, asserts `useSeatAnchors()` resolves through it (composition with SeatAnchorLayer works).
   - Asserts `data-canonical-shell-root` attribute present.
   - Asserts mount/unmount telemetry events fired.

## Explicitly OUT of scope (deferred to Phase 5+)

- Lifting the shell **above** `Game.tsx`'s lifecycle branches (persistent across config/active/settlement phases). This is the high-risk slice and gets its own approval.
- Consolidating overlays (Celebration, Settlement, Neutral, Config) under the shell.
- Playfield slot abstraction / neutral interstitial.
- Chip transport changes.
- Transition choreography.
- Any sync framework changes.
- Visual redesign or styling.

## Risk

Very low. Adds one transparent `<div>` wrapper and an internal re-export of existing Phase 1 logic. No behavioral surface area changes. If approved, Phase 5 (the actual lift above Game.tsx branches) will be proposed separately with its own dedicated scope and gating.

## Acceptance

- Build clean, canonical-shell tests pass (existing 17 + new PersistentTableShell tests).
- Live: phone + tablet, observer + active, 2-player canonical + multiplayer-capable — all visually identical to Phase 3.
- Telemetry: one `shell-mount` event per table mount visible in dev sync debug stream.

Awaiting approval before implementation.
