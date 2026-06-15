# Wave 4 — Phase 1

Contract additions (§7–§9), Cribbage Artifact Inventory v2, and Conflict Matrix v2.

Architecture + inventory only. No geometry changes. No code movement. No per-game fixes.

Reference: `phase0-cribbage-proving-ground.md` for §1–§6 (global contracts, bands, resolver, Wave 3 invariants).

---

## §7 — Protected Safe Areas

Safe areas are **structural** properties of the table, not artifacts. Artifacts negotiate **within** safe areas; they never negotiate them **away**.

| Safe Area              | Always present | Min size            | What lives inside                                 | What may NOT happen                          |
| ---------------------- | -------------- | ------------------- | ------------------------------------------------- | -------------------------------------------- |
| Outer Rail reserve     | yes            | ~3 vmin band        | Chrome, status, home affordances, debug HUDs      | Gameplay artifacts may not cross into rail   |
| Seat Ring reserve      | yes            | ring radius locked  | Name plate, chip anchor (`data-chip-center`), dealer pip, spotlight projection | Chip anchor never moves; ring never compresses for artifact pressure |
| Announcement band      | yes            | ~7 vmin             | LifecycleAnnouncement, win/match overlays         | May shrink to min, may NEVER disappear       |
| Play band              | yes            | ≥ pegboard row min  | Pegboard, crib, cut card, pegging/counting rows   | May not overflow into HUD or rail            |
| Bottom HUD reserve     | yes            | ~10 vmin            | Hand cards (priority owner), tabs, primary CTA    | Hand cards always fit; tabs/CTA negotiate inside this band |

**Rules**

1. Safe areas are computed **before** artifact negotiation begins.
2. The resolver receives the residual band rectangles and only schedules artifacts inside them.
3. A safe-area collision is a `wave4:layout_fault` (see §9), never a silent clip.
4. Safe area sizes are tokenized in `ResponsiveGeometryProvider` and identical across all games.

---

## §8 — Collapse Priority

`ArtifactDescriptor` gains a second axis. `priority` answers *"who shrinks last"*. `collapsePriority` answers *"who disappears first"*.

```ts
type CollapsePriority =
  | 'never'        // structural; survives all pressure
  | 'last'         // collapses only after every other artifact in the band
  | 'late'
  | 'mid'
  | 'early'
  | 'first';       // first to vanish under pressure

interface ArtifactDescriptor {
  // ...existing fields from §2
  priority: number;             // 0–100, shrink-resistance
  collapsePriority: CollapsePriority;  // disappearance order
}
```

**Resolver semantics**

1. Sum minimums in band. If they fit → no collapse, only shrink toward preferred.
2. If minimums exceed band → drop artifacts in `collapsePriority` order: `first → early → mid → late → last`.
3. `never` is structural; if `never` artifacts alone exceed the safe area, emit `wave4:layout_fault`.
4. After each drop, re-solve. Stop as soon as remaining minimums fit.

**Cribbage examples**

| Artifact             | priority | collapsePriority |
| -------------------- | -------- | ---------------- |
| Announcement         | 98       | never            |
| Hand cards (mine)    | 95       | never            |
| Pegboard             | 92       | last             |
| Counting row         | 92       | late             |
| Pegging row          | 90       | late             |
| Cut card             | 75       | mid              |
| Opponent card backs  | 70       | mid              |
| Crib                 | 60       | mid              |
| Discard piles        | 50       | early            |
| Bottom HUD tabs      | 55       | early            |
| Game title           | 40       | first            |
| Parameter chips      | 35       | first            |

Equal `collapsePriority` ties break by ascending `priority`.

---

## §9 — Explicit Layout Faults

The resolver may not paper over impossible layouts.

**Fault triggers**

- Sum of `never`/`last` minimums in a band exceeds the band's safe-area height.
- An artifact's `aspectRatio` cannot be honored within its allotted rect (would require >2% deviation).
- Two protected areas would overlap (e.g. seat ring reserve vs play band after viewport shrink).
- A descriptor declares a `protectedArea` outside its assigned band.

**Behavior**

- Emit `logDebugEvent({ eventType: 'wave4:layout_fault', payload: { band, artifactId, reason, ... } })`.
- In dev: render a red `LayoutFaultBadge` over the affected band with the reason.
- In prod: log to telemetry; visually fall back to the *last valid* layout from the previous frame rather than overlapping.
- Never silently overlap, squash, or clip.

Faults are bugs. They are loud on purpose.

---

## Cribbage Artifact Inventory v2

`vmin` = `min(vw, vh)` of the felt rect.

| Artifact            | Owner                          | Band            | preferredSize       | minimumSize        | aspectRatio | priority | collapsePriority | protectedArea                  | composeMode | safeAreaDependencies                  |
| ------------------- | ------------------------------ | --------------- | ------------------- | ------------------ | ----------- | -------- | ---------------- | ------------------------------ | ----------- | ------------------------------------- |
| Pegboard            | CribbageMobileGameTable        | Play (top)      | 60×10 vmin          | 50×8 vmin          | 6:1         | 92       | last             | full row, exclusive            | adjacent    | Play band, Seat ring reserve          |
| Crib                | CribbageFeltContent            | Play (upper)    | 6×8 vmin            | 5×7 vmin           | 3:4         | 60       | mid              | rect at center-top of play     | adjacent    | Play band, Announcement (below)       |
| Cut card            | CribbageCutCardReveal          | Play (upper)    | 6×8 vmin            | 5×7 vmin           | 3:4         | 75       | mid              | rect adjacent to crib          | adjacent    | Play band, Crib (sibling)             |
| Pegging row         | CribbageFeltContent            | Play (lower)    | 50×9 vmin           | 40×7 vmin          | n/a         | 90       | late             | horizontal strip below pegboard| adjacent    | Play band, Pegboard, Bottom HUD       |
| Counting row        | CribbageCountingPhase          | Play (lower)    | 60×10 vmin          | 48×8 vmin          | n/a         | 92       | late             | horizontal strip below pegboard| mutual-exclusive-with-pegging | Play band, Pegboard, Bottom HUD |
| My hand             | CribbageMobileCardsTab         | Bottom HUD      | 70×14 vmin          | 56×11 vmin         | per-card 3:4| 95       | never            | full bottom strip              | adjacent    | Bottom HUD reserve                    |
| Opponent card backs | CribbageOpponentSeat (Wave 3)  | Seat ring       | seat-projected      | seat-projected     | per-card 3:4| 70       | mid              | projection off `data-chip-center` | adjacent | Seat ring reserve                     |
| Discard piles       | CribbageOpponentSeat (Wave 3)  | Seat ring       | seat-projected      | seat-projected     | per-card 3:4| 50       | early            | projection off `data-chip-center` | adjacent | Seat ring reserve                     |
| Announcement        | LifecycleAnnouncement          | Announcement    | 80×8 vmin           | 70×7 vmin          | n/a         | 98       | never            | full announcement band         | compose     | Announcement band                     |
| Top HUD             | ShellHudChrome                 | Top HUD         | full width × 7 vmin | full width × 6     | n/a         | 80       | late             | top strip                      | adjacent    | Outer rail, Top HUD safe area         |
| Bottom HUD          | ShellHudChrome                 | Bottom HUD      | full width × 12     | full width × 10    | n/a         | 80       | late             | bottom strip                   | adjacent    | Bottom HUD reserve                    |
| Seat ring           | SeatAnchorLayer (canonical)    | Seat ring (structural) | ring of N seats | ring of N seats | n/a   | 100      | never            | annular reserve                | structural  | Felt geometry only                    |
| Game title          | CribbageMobileGameTable header | Top HUD         | 24×5 vmin           | 16×4 vmin          | n/a         | 40       | first            | inside top HUD                 | adjacent    | Top HUD                               |
| Parameter chips     | ShellHudChrome                 | Top HUD         | 30×4 vmin           | 22×3 vmin          | n/a         | 35       | first            | inside top HUD                 | adjacent    | Top HUD                               |
| Tabs (bottom)       | CribbageMobileGameTable        | Bottom HUD      | 60×5 vmin           | 48×4 vmin          | n/a         | 55       | early            | inside bottom HUD              | adjacent    | Bottom HUD, My hand (sibling)         |
| Spotlight           | TurnSpotlight                  | Seat ring (projection) | projected   | projected          | n/a         | 88       | last             | projected from `data-chip-center` | compose | Seat ring reserve                     |
| Dealer pip          | CanonicalOpponentSeat          | Seat ring       | 3×3 vmin            | 2.5×2.5 vmin       | 1:1         | 65       | late             | adjacent to chip               | adjacent    | Seat ring reserve                     |
| Name plate          | CanonicalOpponentSeat          | Seat ring       | 14×3 vmin           | 10×2.5 vmin        | n/a         | 70       | mid              | tangent above chip (2–4 px)    | adjacent    | Seat ring reserve, Chip anchor        |

Notes
- `composeMode = compose` overlays may not reduce a priority-≥95 artifact's rect (per §2).
- `mutual-exclusive-with-pegging` for the counting row encodes the phase-driven choice currently done by `phaseForLayout` checks in `CribbageFeltContent`. Wave 4 makes that selection a descriptor-level fact, not a render branch.

---

## Conflict Matrix v2

Codes: **A** = Adjacent (must not overlap), **B** = Bounded (inner contained in outer), **C** = Compose (transient overlay), **M** = Mutual exclusion.

| Pair                                | Current behavior                                       | Current owner of the workaround                  | Desired relationship | Wave 4 replacement                                       |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------ | -------------------- | -------------------------------------------------------- |
| Pegging row × Pegboard              | Overlap risk at small heights; `top-[68%]` hard-coded  | `CribbageFeltContent` absolute positioning       | A                    | Both descriptors in Play band; resolver stacks vertically |
| Counting row × Pegging row          | Phase flag swaps which renders                         | `isCountingPhase` branch in `CribbageFeltContent`| M                    | `mutual-exclusive` group; resolver picks one             |
| Crib + Cut card × Announcement      | Crib row at `top-[17%]` competes with announcement band| Hard-coded percentages                           | A                    | Crib/cut in Play (upper); announcement owns its band     |
| Counting row × Bottom HUD (seats)   | Counting strip and bottom seats can collide on short viewports | Implicit; no resolver                    | A                    | Bottom HUD safe area locks; counting row constrained to Play |
| Hand cards × Bottom HUD tabs        | Tabs can push hand cards out of view                   | Manual flex order in `CribbageMobileGameTable`   | A inside same band   | Both inside Bottom HUD safe area; hand cards `never` collapse, tabs `early` |
| Game title × Play band              | Title text bleeds into play on short viewports         | None — accepted overlap                          | B (title bounded to Top HUD) | Title descriptor pinned to Top HUD; collapses `first`   |
| Parameter chips × Game title        | Both compete for top strip                             | Manual layout in header                          | A                    | Top HUD band negotiates by `collapsePriority` (both `first`) |
| Spotlight × Name plate              | Visual overlap when spotlight radius large             | Z-index hack                                     | C                    | Spotlight = compose overlay over seat ring; name plate priority ≥ 70 unaffected |
| Spotlight × Hand cards              | Spotlight can bleed below seat ring onto bottom HUD    | Z-index                                          | C with bound         | Spotlight rect bounded by Seat ring reserve; cannot enter Bottom HUD |
| Cut card flip × Crib                | OK today (side-by-side); brittle on resize             | Hard-coded `gap-4`                               | A                    | Both in same Play sub-row; gap from `geometry.tokens`    |
| Dealer pip × Chip anchor            | Pip projected from chip                                | Already canonical (Wave 3)                       | C off anchor         | No change — confirmed canonical                          |
| Opponent card backs × Name plate    | Card backs can clip name plate at short radii          | Per-seat ad-hoc spacing                          | A                    | Both seat-projected; resolver enforces order around chip |
| Discard piles × Opponent card backs | Stacked under seat; can overlap                        | Manual offsets                                   | A                    | Seat projection order: name plate → chip → cards → discards |
| Announcement × Match-win overlay    | Both fight for center                                  | LifecycleAnnouncement + ad-hoc overlays          | M within compose     | Single Announcement band; overlays compose, never duplicate |
| Top HUD × Outer rail                | Rail icons can collide with HUD chips                  | Manual padding                                   | A across safe areas  | Safe-area math separates them; fault on overlap          |

---

## Success Criteria Recap

- **WHO** owns things — settled in Wave 3.
- **WHERE** things live — Wave 4, this document.
- **WHEN** things happen — Wave 5.

Cribbage at end of Wave 4 must be fully expressible as `ArtifactDescriptor[]` + band negotiation + seat projections, with **zero** `if (game === 'cribbage')` layout branches. Every other game inherits the same engine by publishing its own descriptors.

---

## Next Deliverable

`phase2-resolver-spec.md`:
- `LayoutResolver` interface and pseudocode
- `ArtifactDescriptor` TypeScript definition (final)
- `useArtifactRegistration` hook contract
- `LayoutFaultBadge` dev component spec
- Migration order: Cribbage descriptors first, then Holm/357/Horses/SCC/Gin/Yahtzee inherit.
