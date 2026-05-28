
# Phase 1 — Canonical Seat System

Goal: one seat renderer, one projection system, one styling system across waiting → dealer setup → interstitial → gameplay. After this phase, lifecycle phase changes never move seats within a given projection mode, and there is exactly one seat-rendering code path in the entire app.

## Continuity contract (projection-scoped)

Seat coordinates are stable **within a projection mode**, not necessarily across projection modes.

**Observer projection** (viewer is not seated):
- Uses absolute seat positioning for multiplayer games.
- May apply intentional face-to-face ergonomic adjustments for 2P games (Cribbage / Gin / Yahtzee), as already encoded in `canonicalized2p` + `occupied-2p-face` placement.
- For a given observer, seat coordinates for a given player identity are **identical** across waiting, dealer setup, interstitial, and gameplay. An observer must never see a player jump seats because the lifecycle phase changed.

**Active-player projection** (viewer is seated):
- Activated when the user joins/sits; viewer remains in active-player projection for the remainder of the session.
- Viewer is rendered via the active content area + bottom HUD; their on-felt cluster is self-suppressed.
- Other seats are projected relative to the viewer (HOME-relative slotting).
- May legitimately differ from observer projection.
- May legitimately differ between game families when an intentional ergonomic rule exists (e.g. Holm may position the opponent differently from Cribbage). Family-level differences are a property of the projection, not the lifecycle.
- For a given seated viewer, seat coordinates for a given player identity are **identical** across waiting, dealer setup, interstitial, and gameplay.

**What is NOT acceptable, in either mode:**
- Lifecycle-driven seat movement. Waiting → setup, setup → interstitial, interstitial → gameplay, and gameplay → next dealer-game must not change the rendered coordinate of any player.

**What IS acceptable:**
- Coordinate differences driven by projection-mode change (observer → active, or vice versa on join).
- Coordinate differences driven by an intentional game-family ergonomic rule, encoded in the projection layer (`seatAnchors.ts` / `canonicalSlotPlacement.ts`).

## What the audit found

Five distinct seat renderers exist today. Three gameplay tables (Gin, Cribbage, Yahtzee) already go through `CanonicalSeatCluster` + `SeatAnchorLayer`. Three places diverge:

1. **`MobileGameTable`** (Holm / 3-5-7 / Horses / SCC, AND the background table during waiting and dealer setup for those families) — hand-rolls its own `slotPositions` map, a separate `getObserverSlotFromPosition` map for observer mode, and a custom `w-12/h-12` chip circle plus a bare `<span>` nameplate. Primary cause of lifecycle-driven divergence for the four dice/poker families.
2. **`CanonicalShellWaitingSurface`** — already uses `CanonicalSeatCluster`, but bypasses `getBotAlias`, so bots show `"Bot 665153"` (raw DB name) instead of `"Bot 1"`. Also omits the `$` prefix used in gameplay.
3. **`WaitingForPlayersTable`** add-bot path — writes `"Bot {6-char-hex}"` directly to `profiles.username`, diverging from `botNaming.ts`'s sequential scheme.

`DealerGameSetup` / `DealerConfig` / `NeutralInterstitial` render no seat clusters themselves — they sit on top of `MobileGameTable`. Fixing `MobileGameTable` automatically fixes setup and interstitial.

## Hard end-state constraint (per user direction)

When this phase ships, `MobileGameTable` has **exactly one** seat-rendering path. No family flags, no per-family bespoke branches:

- The local `slotPositions` map is deleted, not gated.
- `getObserverSlotFromPosition` is deleted, not gated.
- `renderPlayerChip` is deleted, not gated.
- Every seat in every family in every phase resolves through `useSeatAnchors().byPosition.get(position)` and renders through `CanonicalSeatCluster`.
- Observer projection is exclusively `SeatAnchorLayer`'s `'observer-absolute'` mode; active projection is exclusively `'active-canonical'`. Game-family ergonomic rules live inside `seatAnchors.ts` / `canonicalSlotPlacement.ts` (where they already live for the 2P face-to-face case), not inside `MobileGameTable`.

If validation surfaces a per-family blocker, the resolution is to extend the canonical projection layer to cover the case, not to reintroduce a bespoke branch. The work ships behind a single PR so no intermediate mixed state ever lands.

## Cutover plan

### Step 1 — Single source of truth for display names
- Migrate `WaitingForPlayersTable`'s add-bot path to call `botNaming.ts:makeBotUsername` so the DB row is `"Bot N"` from insertion.
- Route every name render site through `getDisplayName` from `botAlias.ts`. Specifically: fix `CanonicalShellWaitingSurface` (currently raw `profiles.username`) and the `MobileGameTable` positional fallback. No render site reads `profiles.username` directly for a seat label after this step.

### Step 2 — Mount `SeatAnchorLayer` for every `MobileGameTable` family
- Wrap `MobileGameTable`'s seat region in `<SeatAnchorLayer>` with the same projection-mode resolution Gin/Cribbage/Yahtzee already use: `'active-canonical'` when the viewer is seated, `'observer-absolute'` when not.
- The provider mounts simultaneously for Holm, 3-5-7, Horses, and SCC since they all flow through `MobileGameTable`.
- Projection mode is set once on join and persists for the rest of the session — never toggled by lifecycle phase.

### Step 3 — Replace bespoke seat code in one PR
- Delete `slotPositions`, `getObserverSlotFromPosition`, and `renderPlayerChip` in `MobileGameTable`.
- Render every seat (active and observer) through `<CanonicalSeatCluster>`, with game-owned decorators (leg indicator, buck indicator, dealer pip, status tints, chip-transfer endpoint markers) moved into the cluster's `children` slot so they ride the canonical anchor.
- Any family-specific ergonomic difference that needs to survive (e.g. Holm-specific opponent placement, if one exists today and is intentional) is expressed in `seatAnchors.ts` / `canonicalSlotPlacement.ts` keyed on `gameType`, not in `MobileGameTable`.
- Active-player content area and bottom HUD are untouched.

### Step 4 — Waiting / setup / interstitial inherit canonical seats automatically
- Because `WaitingForPlayersTable` and `DealerGameSetup` render `MobileGameTable` underneath, Step 3 gives them canonical seat geometry with zero additional change. This is what makes lifecycle-driven movement structurally impossible in the new layout.
- For canonical-shell families (Cribbage / Gin / Yahtzee waiting), update `CanonicalShellWaitingSurface` to use `getDisplayName` and the `$` prefix so waiting matches gameplay verbatim.
- `NeutralInterstitial` already renders no seats; confirm nothing else paints seat chrome on top of it during dealer rollover.

### Step 5 — Lock geometry, truncation, and chip formatting
- `CanonicalSeatCluster` already pins width to `w-[96px]` and uses `truncate min-w-0` on the name span. Audit all call sites for prop overrides that widen, restyle, or remove the pill — remove them.
- Standardize `chipValue` everywhere to `` `$${formatChipValue(chips)}` ``.

### Step 6 — Registry + invariant
- Add `holm`, `three_five_seven`, `horses`, `scc` to `CANONICAL_SHELL_FAMILY` (as required for the seat provider mount) and `CANONICAL_SEAT_CONSUMERS` so `useRequiredSeatAnchors` throws in dev if any future change tries to render seats outside the provider.

## Acceptance criteria

- **Single path:** `MobileGameTable` contains zero family-specific seat branches. `slotPositions`, `getObserverSlotFromPosition`, `renderPlayerChip` are deleted from the codebase.
- **Projection-scoped continuity:** for a given session, a given viewer, a given player identity, and a fixed projection mode, the seat coordinate (`data-seat-position` element bounding box on screen) is **identical**, pixel-for-pixel, across waiting → dealer setup → interstitial → gameplay → next dealer-game. Verified for both an observer and a seated participant.
- **Projection-mode transitions are allowed to move seats** (e.g. when a viewer joins mid-session and switches from observer to active-player projection). This is not a regression.
- **Game-family ergonomic differences are allowed within active-player projection** (e.g. Holm vs Cribbage opponent placement). Those differences live in `seatAnchors.ts` / `canonicalSlotPlacement.ts`, not in family branches inside `MobileGameTable`.
- Bots are labeled `Bot N` from the moment of insertion in waiting, setup, and gameplay (alias resolved at the DB and confirmed by `getDisplayName` at render).
- All nameplates render in the same fixed-width pill with `…` truncation; no name pushes layout.
- Chip bubbles use the same size, palette, and `$` formatting everywhere.
- No dev-mode `useRequiredSeatAnchors` warning in any phase of any registered family.

## Out of scope (Phase 2 / 3)
- HUD stack height, active-content reservation, announcement/tab rail height.
- Timer ownership and numeric vs progress-bar divergence.
- Any change to gameplay logic, sync, or scoring.

## Files expected to change
- `src/components/MobileGameTable.tsx` — delete bespoke seat code; mount `SeatAnchorLayer`; render every seat through `CanonicalSeatCluster`; decorators folded into the cluster `children` slot.
- `src/components/canonicalShell/CanonicalShellWaitingSurface.tsx` — use `getDisplayName`, add `$` prefix.
- `src/components/WaitingForPlayersTable.tsx` — replace inline `Bot {hex}` username generation with `makeBotUsername`.
- `src/lib/canonicalShell/shellRouting.ts` — register `holm`, `three_five_seven`, `horses`, `scc` in both registries.
- `src/lib/canonicalShell/seatAnchors.ts` / `canonicalSlotPlacement.ts` — only if a Holm/3-5-7/Horses/SCC ergonomic rule needs to be ported out of the bespoke branch into the canonical projection layer.

No DB migrations. Existing bot rows are unaffected; `getBotAlias` continues to override at render. New bot inserts get the canonical name at write time.

## Risk + rollback

Because the end-state contract is a single path, the work ships as one PR, not incrementally:

- Validated across all four `MobileGameTable` families (Holm, 3-5-7, Horses, SCC) plus the three already-canonical families (Cribbage, Gin, Yahtzee) before merge.
- Validation covers the four lifecycle transitions (waiting → setup, setup → gameplay, gameplay → next dealer-game, observer-join during each phase) AND captures element bounding boxes before/after each transition to prove projection-scoped continuity.
- Rollback is a git-level revert of the single PR. No per-family kill switch — intentional, to preserve the one-path invariant.

Highest residual risk is the leg/buck/dealer-pip decorators currently positioned against `slotPositions`. Mitigation: re-express each as a `children` element of the canonical cluster so it inherits the anchor, with a visual diff against the current production layout before merge.
