# Canonical Single-Surface Audit — Platform-Wide

Status: DRAFT (Phase 0 of the Canonical Game-Table Unification initiative).
Scope: every render path that paints — or can paint — a table-shaped
surface at runtime. The goal of the initiative is to eliminate **all**
lifecycle/table transition seams across **every** game so that, at any
moment, there is **exactly one** canonical gameplay surface mounted
under the `PersistentTableShell`.

This document is an **inventory**, not a migration plan. It enumerates
every surface that violates (or risks violating) single-surface
ownership today. Migration sequencing comes in Phase 1.

---

## Target architecture (frozen contract)

**Shell owns** (`PersistentTableShell` + canonical primitives):

- Persistent table geometry (`CanonicalFeltSurface` is the only legal felt)
- Header chrome (`ShellHudChrome`-mounted, route-authored)
- Announcements (`CanonicalAnnouncementProvider` + rail + `CanonicalCelebrationLayer`)
- HUD / tab bar (`ShellTabBarProvider`)
- Ambient lifecycle messaging (`LifecycleAnnouncement` rail emits)
- Observer chrome (chips, names, dealer pip via `SeatAnchorLayer` + `CanonicalSeatCluster`)
- Lifecycle transitions / placeholders (`NeutralInterstitial`, `PlayfieldSlotController`)
- Chip transport runtime + pot anchor (`ChipTransportRuntime`)

**Game slot owns** (mounted by `PlayfieldSlotController`):

- Gameplay artifacts only (cards, dice, pegging, score sheets, per-game CTAs)
- Game-specific overlays that are scoped to the slot (knock, gin, no-qualify, etc.)

**Hard invariants**:

1. Exactly **one** `CanonicalFeltSurface` mounted at any time.
2. Exactly **one** `PersistentTableShell` per route, route-stable, never remounted on phase change.
3. No `fixed inset-0` table-shaped surface outside the shell.
4. No game-type-conditional alternate table geometry (e.g. `DiceTableLayout` substituting for the canonical felt).
5. No `MobileGameTable` / `GameTable` sibling that coexists with the canonical slot.
6. No lifecycle-phase remount of the gameplay surface within a dealer game.

---

## Findings by surface class

### Class A — Parallel / sibling table render paths (HIGHEST PRIORITY)

These mount a table-shaped surface **outside** `PlayfieldSlotController`
or **in parallel** with the canonical slot. They are the direct cause of
the user-reported "two tables stacked", "table morphs and snaps back",
and Yahtzee transition seam symptoms.

| # | Source | Trigger | Symptom | Risk |
|---|---|---|---|---|
| A1 | `src/pages/Game.tsx` L8537 — `MobileGameTable instanceLabel="dealer-selection-bg"` | `game.status === 'dealer_selection' && game_type !== 'gin-rummy'` | Mounts a full background MobileGameTable under `HighCardDealerSelection` as a sibling of the canonical slot. Bootstrap "intermediate table" seam. | High |
| A2 | `src/pages/Game.tsx` L8602 — `MobileGameTable instanceLabel="status-keyed"` | `game_selection \| configuring \| game_over (no config_complete)` and `!_treatAsCanonicalRoute` | Sibling table during dealer-config window. For non-canonical-route families this is the "intermediate misshapen surface" you saw in Yahtzee transitions. | High |
| A3 | `src/pages/Game.tsx` L8752 — `MobileGameTable instanceLabel="game-over-or-win-anim-ungated"` | terminal animation branch outside the slot, filtered by a hand-curated game-type denylist | Second table can briefly coexist with the active gameplay table during game-over presentation. This is the documented "duplicate table after Gin/Horses win" regression class. | High |
| A4 | `src/pages/Game.tsx` L9121 — `MobileGameTable instanceLabel="cribbage-or-special"` | Dice games (horses, SCC) `isInProgress \| isAnteDecision \| isDiceGameOver \| horsesWinPotTriggerId` | Dice games still render through `MobileGameTable`, not a dedicated game surface. Geometry is delegated to `DiceTableLayout` which is **not** a `CanonicalFeltSurface` consumer → geometry seam vs. cribbage/gin/yahtzee at hand-off. | High |
| A5 | `src/pages/Game.tsx` L9250 — `MobileGameTable instanceLabel="main-in-progress-gated"` | Holm / 3-5-7 fallback for `in_progress` + terminal | Same as A4: poker-variant family still mounts the legacy `MobileGameTable` shell rather than a dedicated `CanonicalFeltSurface`-anchored game surface. | High |
| A6 | `src/pages/Game.tsx` L8514 — `<WaitingForPlayersTable …>` | `game.status === 'waiting'` | Pre-session lobby renders a full alternate table component (`src/components/WaitingForPlayersTable.tsx`, 478 LOC) that does **not** use `CanonicalFeltSurface`. Waiting → first hand is a hard geometry swap. | High |
| A7 | `src/components/DealerGameSetup.tsx` L1112, L1526, L1711, L1928 — four `fixed inset-0` full-screen modals | Dealer config flow | Full-viewport takeovers that paint over the shell. Behaviorally an overlay, not a slot artifact. Not currently shell-owned. | Med |
| A8 | `src/components/DealerSettingUpGame.tsx` — `fixed inset-0` full-screen plate | Currently **unused** in codebase (no importers) | Dead code that still ships. Risk of accidental re-introduction. Delete. | Low |

### Class B — Per-game alternate table geometries (no `CanonicalFeltSurface`)

These are dedicated gameplay surfaces, but they paint their own felt
geometry instead of consuming `CanonicalFeltSurface`. At the boundary
between two such games (or between any of them and a `CanonicalFelt`
game), geometry visibly changes shape — the exact "morph + snap back"
seam.

| # | Source | Game(s) | Note |
|---|---|---|---|
| B1 | `src/components/CribbageMobileGameTable.tsx` L5376–L5596 — multiple `absolute inset-0` layers with hard-coded slate background | Cribbage | Does NOT import `CanonicalFeltSurface`. Cribbage migration phase target (already planned). |
| B2 | `src/components/DiceTableLayout.tsx` (1998 LOC) | Horses, SCC | Owns its own felt geometry. Mounted under `MobileGameTable`. No `CanonicalFeltSurface` consumer. |
| B3 | `src/components/MobileGameTable.tsx` L4488 + L4513 inner `<img>` felt | Holm, 3-5-7, dice fallback | DOES import `CanonicalFeltSurface` (good) but ALSO paints a sibling `<img>` felt layer. Hybrid path — needs audit for double-felt risk. |
| B4 | `src/components/WaitingForPlayersTable.tsx` | All games (lobby) | Independent felt + seat layout. Not canonical. |

### Class C — Geometry-altering lifecycle wrappers

These are not tables themselves but mutate the perceived table shape
mid-lifecycle by injecting / removing wrapper layout.

| # | Source | Trigger | Note |
|---|---|---|---|
| C1 | `Game.tsx` `_treatAsCanonicalRoute` branch (L8258–) | Family flip across `configuring → in_progress` | Sticky family resolution exists, but the **non-canonical fallback** still renders alternate trees (A2/A3). Removing the fallback eliminates the branch. |
| C2 | `Game.tsx` outer wrapper `enableOuterShell` env flag (L8240) | `VITE_CANONICAL_SHELL_LIFT='off'` | Escape hatch still wired. Acceptable for now; track for removal once unification lands. |
| C3 | `Game.tsx` bootstrap branch L8191 — empty `<div>` child inside shell | Pre-hydration | Renders a transparent shell child only. Safe, but confirms shell-first-paint depends on a sentinel; verify no flash when canonical felt replaces it. |

### Class D — Over-shell overlays (not tables, but visually compete with the slot)

These do not violate single-table ownership directly, but they are
authored as `fixed inset-0` outside the shell. Migrating them to
`CanonicalCelebrationLayer` / shell-owned overlay mounts is the cleanest
way to keep the shell as the single z-index authority.

| # | Source | Class | Note |
|---|---|---|---|
| D1 | `GinRummyKnockOverlay`, `GinRummyGinOverlay`, `GinRummyMatchWinner` | Game-scoped overlay | Mounted inside `GinRummyGameTable`. Slot-scoped, so single-table invariant holds; migrate to canonical overlay layer per `phase2-plan.md`. |
| D2 | `YahtzeeOverlays` (`YahtzeeRollOverlay`, `UpperBonusOverlay`, `WinnerOverlay`, `YahtzeeBonusOverlay`) | Game-scoped overlay | Same as D1. |
| D3 | `NoQualifyAnimation`, `MidnightAnimation` | SCC overlay | Game-scoped. |
| D4 | `LegEarnedAnimation`, `LegsToPlayerAnimation`, `SweepTheLegsAnimation` | Horses overlay | Game-scoped. |
| D5 | `ChoppedAnimation`, `BucksOnYouAnimation`, `SweepsPotAnimation`, `AnteUpAnimation`, `HolmWinPotAnimation`, `PotToPlayerAnimation`, `ChipTransferAnimation`, `CribbageChipTransferAnimation`, `DiceRollAnimation`, `DealerButtonAnimation`, `CribbageCutCardReveal` | Animation primitives | Out of scope per existing transient-UX plan. Listed for completeness. |

### Class E — Observer-specific alternate surfaces

Audited. No game currently renders a **distinct** observer table; observer
chrome is composed from `SeatAnchorLayer` + `projectionMode='observer-absolute'`
inside the same `PersistentTableShell`. **No findings.** Continue to enforce
via `CANONICAL_SEAT_CONSUMERS` registry invariant (already throwing on
divergence at module load).

### Class F — Bootstrap / dealer-selection special-case tables

| # | Source | Note |
|---|---|---|
| F1 | A1 (`dealer-selection-bg` sibling MobileGameTable) | Restated for visibility — this is a bootstrap-only alternate table. |
| F2 | `HighCardDealerSelection` siblings at L8582 and L9018 | Currently rendered **alongside** a table, not as a slot child. Cribbage path already overlays it on `CribbageMobileGameTable`; gin-rummy path overlays it on `GinRummyGameTable`; the L8582 path overlays it on the A1 sibling — eliminate when A1 is removed. |
| F3 | `DealerGameSetup` (A7) | Bootstrap-adjacent full-screen takeover. |

### Class G — Completion / game-over alternate tables

| # | Source | Note |
|---|---|---|
| G1 | A3 (`game-over-or-win-anim-ungated`) | The original "duplicate table after win" source. Already hand-filtered with a game-type denylist; this is fragile and must be replaced by slot-owned terminal presentation in every family. |
| G2 | Yahtzee terminal — currently routed through `YahtzeeGameTable` inside the slot (Game.tsx L9205 includes `isYahtzeeGameOver`). The visible Yahtzee transition seam is therefore NOT from a sibling table — it is the slot itself remounting because `currentRound.id` changes at game-over. Track under Class H. |

### Class H — Slot-internal remount seams (gameplay surface remounts inside the slot)

These do not violate single-surface ownership topologically (one surface
at a time), but they cause a visible mid-game geometry blip because
the canonical felt unmounts and remounts. Same user-visible class of
"morph + snap back".

| # | Source | Game(s) | Note |
|---|---|---|---|
| H1 | `PlayfieldSlotController` identity derived from `(game_type, current_game_uuid)` (Game.tsx L8918) | All canonical-shell games | Correct contract. But several game-table components key children on `currentRound.id` internally, which forces an inner remount on round boundary even while the outer slot identity is stable. Audit `YahtzeeGameTable`, `GinRummyGameTable`, `CribbageMobileGameTable` for `key={round*}` on layout-bearing children. |
| H2 | `MobileGameTable key={gameId}` vs `key=${gameId}-${status}` at A1/A2 | Holm / 3-5-7 / dice | The `status`-suffixed key forces a full table remount on every status transition. This is exactly the "intermediate alternate table" seam in the user's Yahtzee report when applied to non-Yahtzee families. |

---

## Cross-cutting structural risks

1. **`isCanonicalShellFamily` vs render-branch enforcement** — the registry exists and is invariant-checked, but `Game.tsx` still contains hand-curated game-type denylists at A3 (`game.game_type !== 'cribbage' && ... !== 'gin-rummy' && ... !== 'horses' && ... !== 'ship-captain-crew'`). Every future game added to canonical shell must also be added to that denylist or the duplicate-table regression returns. **Replace denylist with `isCanonicalShellFamily(game.game_type)` gate.**
2. **`MobileGameTable` is doing four jobs**: lobby bg, dealer-selection bg, dealer-config bg, active gameplay for poker-variant family. Each job is a separate render branch in `Game.tsx` and is the structural source of every Class A finding. The unification end-state is: `MobileGameTable` retired entirely; poker-variant family moves to dedicated `CanonicalFeltSurface`-anchored surfaces (mirroring cribbage/gin/yahtzee).
3. **`DiceTableLayout` is the largest non-canonical surface** (~2000 LOC) and is mounted from inside `MobileGameTable`. Migration cannot complete without it; plan dice migration **before** or **alongside** retiring `MobileGameTable`.
4. **`WaitingForPlayersTable` is the only pre-session table**. Migrating it to a `CanonicalFeltSurface`-anchored waiting surface eliminates the waiting → first-hand geometry swap and lets the shell own the lobby too.
5. **`DealerGameSetup`'s four `fixed inset-0` modals** should become a single shell-owned overlay (or canonical announcement event with a CTA payload). Currently they paint over both shell and slot.

---

## Migration buckets (preview only — sequenced in Phase 1)

- **Bucket 1 — Eliminate parallel siblings (Class A1–A3, A6).** Replace with slot/shell-owned equivalents. This alone removes the duplicate-table regression class platform-wide.
- **Bucket 2 — Cribbage migration to `CanonicalFeltSurface` (Class B1).** Already planned. Execute inside the unification frame, not as a Cribbage-local migration.
- **Bucket 3 — Dice migration (Class B2 + A4).** Replace `DiceTableLayout` with a dice-specific `CanonicalFeltSurface` consumer, route Horses & SCC off `MobileGameTable`.
- **Bucket 4 — Poker-variant migration (Class A5 + B3).** Holm & 3-5-7 onto dedicated `CanonicalFeltSurface` consumers. Retire `MobileGameTable`'s felt path.
- **Bucket 5 — Waiting/lobby migration (Class A6 / B4).** `WaitingForPlayersTable` becomes a canonical waiting surface.
- **Bucket 6 — Dealer-config + setup overlays (Class A7, D-family).** Shell-owned overlay mounts.
- **Bucket 7 — Slot-internal remount audit (Class H).** Per-game key audit + fix.
- **Bucket 8 — Cleanup (Class A8, C2).** Delete dead components and feature flags.

---

## Phase 0 exit criteria

- [x] Every `MobileGameTable` / `GameTable` mount in `Game.tsx` enumerated (5 instances: A1–A5).
- [x] Every `fixed inset-0` plate outside the shell enumerated (A7, A8).
- [x] Every per-game felt path that does NOT consume `CanonicalFeltSurface` enumerated (B1, B2, B3, B4).
- [x] Observer-only alternate surfaces audited (Class E — none).
- [x] Bootstrap / dealer-selection / game-over alternate-table sources enumerated (F1–F3, G1–G2).
- [x] Slot-internal remount seams flagged (H1–H2).
- [x] Existing transient-UX inventory (`phase1-inventory.md`) cross-referenced; this document **supersedes** its table-ownership findings.

## What this document is NOT

- Not a migration plan. Phase 1 is.
- Not authorization to delete any user-visible asset. Surfaces move ownership; legacy visuals are preserved during the move.
- Not a green light to start Cribbage in isolation. Cribbage migrates as **Bucket 2** of this initiative, not as a standalone effort.
