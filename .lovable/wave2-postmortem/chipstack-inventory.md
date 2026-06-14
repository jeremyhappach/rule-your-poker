# Wave 3 — CanonicalChipstack Inventory

Status: **inventory only**. No code changes, no fixes, no primitives.
Scope excludes: Pot, FeltLayout, DealerButton, Transport implementation, Settlement math.

---

## Terminology correction

Wave 3A shipped `CanonicalChipDisc`. In retrospect that primitive standardized
only the **chip badge / chip counter** (a single circular value display):
geometry, typography, turn-ring overlay, folded dim, `data-chip-center` anchor.

It did **NOT** standardize the broader **Chipstack** concern:

| Concern                          | 3A shipped? |
|----------------------------------|-------------|
| Badge geometry + typography      | ✅ |
| Turn-pulse ring                  | ✅ |
| Folded opacity                   | ✅ |
| `data-chip-center` anchor attr   | ✅ |
| Stack composition (multi-disc)   | ❌ |
| Stack positioning vs seat anchor | ❌ |
| Seat-relative geometry contract  | ❌ |
| Z-order rules vs cards/dice/pot  | ❌ |
| Showdown replacement behavior    | ❌ |
| Emoticon replacement behavior    | ❌ |
| Transport endpoint ownership     | ❌ |
| Pot relationship                 | ❌ |
| Stack-level animations           | ❌ |
| Waiting-table chip rendering     | ❌ |

**Rename (docs only, filename unchanged):** treat `CanonicalChipDisc` as
**`CanonicalChipBadge`** in all future docs / comments / wave plans.
The filename `src/components/canonicalShell/CanonicalChipDisc.tsx` is kept
to avoid churn; the JSDoc header should be updated whenever that file is
next touched to clarify it owns the *badge*, not the *stack*.

---

## Per-game inventory

Columns:
- **Badge renderer** — what component instantiates the chip counter
- **Stack position** — where the badge is placed relative to seat
- **Seat anchor** — does it consume a canonical shell anchor?
- **Z-index** — layering rules in effect
- **Showdown** — what replaces the badge during showdown
- **Emoticon** — replacement behavior when emoticon active
- **Transport endpoint** — who owns `data-chip-center` / fly origin
- **Pot relationship** — how the stack relates to pot disc
- **Animation owner** — what flies chips in/out
- **Waiting table** — what renders chip during pre-session

### Holm
| Field | Value |
|---|---|
| Badge renderer | `MobileGameTable.renderPlayerChip` → `CanonicalChipBadge` |
| Stack position | Inline inside MGT seat-cluster map (L6798), beside seat avatar |
| Seat anchor | ✅ Canonical shell `SeatAnchorLayer` (registered consumer) |
| Z-index | Inherits MGT seat-cluster layer (default), no explicit z |
| Showdown | Bespoke inline disc replacement at MGT L4883 (NOT canonical) |
| Emoticon | Badge `amount=null`, `overlay` slot renders emoticon above |
| Transport endpoint | `data-chip-center={position}` on badge wrapper |
| Pot relationship | Separate amber pot disc at felt center; stacks fly INTO pot on ante, OUT on win |
| Animation owner | `AnteUpAnimation`, `HolmWinPotAnimation`, `PotToPlayerAnimation` (3 bespoke) |
| Waiting table | `CanonicalSeatCluster` internal `chipValue` badge (different primitive — `w-8 h-8`) |

### 3-5-7
| Field | Value |
|---|---|
| Badge renderer | `MobileGameTable.renderPlayerChip` → `CanonicalChipBadge` |
| Stack position | Inline inside MGT seat-cluster map (L6798) |
| Seat anchor | ✅ Canonical shell `SeatAnchorLayer` |
| Z-index | MGT seat-cluster layer default |
| Showdown | Bespoke inline disc at MGT L4883 |
| Emoticon | Badge `amount=null` + `overlay` slot |
| Transport endpoint | `data-chip-center={position}` |
| Pot relationship | Pot disc at felt center; ante flies in, sweep on `chopped`/win |
| Animation owner | `AnteUpAnimation`, `PotToPlayerAnimation`, `ChoppedAnimation`, `SweepsPotAnimation` |
| Waiting table | `CanonicalSeatCluster` internal badge |

### Horses
| Field | Value |
|---|---|
| Badge renderer | `MobileGameTable.renderPlayerChip` → `CanonicalChipBadge` |
| Stack position | MGT seat-cluster anchor |
| Seat anchor | ✅ Canonical shell `SeatAnchorLayer` |
| Z-index | MGT default; auto-roll indicator overlays badge sibling |
| Showdown | Bespoke inline disc at MGT L4883 |
| Emoticon | Badge `amount=null` + overlay slot |
| Transport endpoint | `data-chip-center={position}` |
| Pot relationship | Per-leg pot; chips fly between players (no central pot for transfers) and to legs |
| Animation owner | `ChipTransferAnimation`, `LegsToPlayerAnimation`, `LegEarnedAnimation`, `SweepTheLegsAnimation`, `MidnightAnimation` |
| Waiting table | `CanonicalSeatCluster` internal badge |

### SCC (Ship-Captain-Crew)
| Field | Value |
|---|---|
| Badge renderer | `MobileGameTable.renderPlayerChip` → `CanonicalChipBadge` |
| Stack position | MGT seat-cluster anchor |
| Seat anchor | ✅ Canonical shell `SeatAnchorLayer` |
| Z-index | MGT default |
| Showdown | Bespoke inline disc at MGT L4883 |
| Emoticon | Badge `amount=null` + overlay slot |
| Transport endpoint | `data-chip-center={position}` |
| Pot relationship | Central pot; ante in, winner sweep |
| Animation owner | `AnteUpAnimation`, `PotToPlayerAnimation`, `BucksOnYouAnimation`, `NoQualifyAnimation` |
| Waiting table | `CanonicalSeatCluster` internal badge |

### Yahtzee
| Field | Value |
|---|---|
| Badge renderer | `YahtzeeGameTable.tsx` L1896 → `CanonicalChipBadge` (size=`gameplay-compact`) |
| Stack position | Inside Yahtzee bespoke seat panel (NOT MGT) |
| Seat anchor | ❌ No shell SeatAnchorLayer; bespoke 2-seat layout |
| Z-index | Component-local; no canonical z contract |
| Showdown | No showdown phase (head-to-head scorecard reveal) |
| Emoticon | Same overlay slot pattern |
| Transport endpoint | `data-chip-center` present but no chip-transport consumers wired |
| Pot relationship | No pot — direct stack-to-stack settlement on game end |
| Animation owner | None (chip totals update via `ValueChangeFlash` inside badge) |
| Waiting table | `CanonicalSeatCluster` internal badge (pre-session shell layer) |

### Gin Rummy — **SKIPPED in 3A**
| Field | Value |
|---|---|
| Badge renderer | Bespoke inline disc in `GinRummyGameTable` / `GinRummyFeltContent` |
| Stack position | Bespoke 2-seat layout, hardcoded offsets |
| Seat anchor | ❌ Bespoke internal anchors (registered consumer for shell, but chip path is bespoke) |
| Z-index | Component-local |
| Showdown | Knock/Gin overlay covers seat region (`GinRummyKnockOverlay`, `GinRummyGinOverlay`) |
| Emoticon | Bespoke replacement path |
| Transport endpoint | No `data-chip-center` |
| Pot relationship | No pot — knock/gin settlement |
| Animation owner | `GinRummyOpponentDrawAnimation` (cards, not chips); chip totals snap |
| Waiting table | Pre-session shell layer (canonical) |

### Cribbage — **SKIPPED in 3A**
| Field | Value |
|---|---|
| Badge renderer | Bespoke inline disc in `CribbageFeltContent` |
| Stack position | Bespoke 2-seat layout |
| Seat anchor | ❌ Bespoke internal anchors |
| Z-index | Component-local; pegboard owns separate z-band |
| Showdown | Counting phase + cut-card reveal overlays (`CribbageCountingPhase`, `CribbageCutCardReveal`) |
| Emoticon | Bespoke path |
| Transport endpoint | Bespoke positions passed to `CribbageChipTransferAnimation` (FROZEN — see file header) |
| Pot relationship | No central pot — direct loser→winner transfer |
| Animation owner | `CribbageChipTransferAnimation` (frozen, bespoke) |
| Waiting table | Pre-session shell layer (canonical) |

---

## Cross-cutting observations

1. **Badge canonicalized, stack is not.** Every MGT-resident game (Holm/357/Horses/SCC) shares the badge primitive, but the *placement* of that badge is still done by `MobileGameTable.renderPlayerChip` JSX inside the seat-cluster map. There is no `CanonicalChipstack` slot.

2. **Showdown emoticon-replacement disc is a parallel inline path** (MGT L4883–4896, `w-12 h-12 rounded-full bg-slate-700/80`). It is **not** routed through `CanonicalChipBadge` and therefore does not share folded/turn/value semantics. Confirmed by Wave 3A audit.

3. **Waiting-table chip is a third primitive.** `CanonicalSeatCluster` renders its own `w-8 h-8 rounded-full` chip badge for the pre-session surface. Geometry intentionally smaller than gameplay — but typography, color resolution, and `data-chip-center` are independently maintained.

4. **Transport endpoints live on the badge wrapper, not on a stack object.** Every animation that needs an origin reads `[data-chip-center="${position}"]` on the badge. There is no separate "stack root" attribute. Migrating to a stack primitive would either keep the same attribute on the stack root, or introduce a new `data-chipstack-root` and migrate every animation.

5. **Pot is not a stack.** Pot rendering is bespoke at felt center (amber disc + `displayedPot` freeze/snap protocol at MGT L1246–1555). No shared structure with player stacks today.

6. **Animations remain game-owned.** Six near-duplicate animators (`AnteUp`, `ChipTransfer`, `PotToPlayer`, `HolmWinPot`, `CribbageChipTransfer`, `DealerButtonAnimation`) each compute their own endpoints, durations, and z-indices. None of them mount through a shell-owned slot.

7. **Yahtzee is a partial citizen.** It uses the badge primitive but is otherwise outside the shell seat-anchor system — a `CanonicalChipstack` that depended on `SeatAnchorLayer` would either need a Yahtzee carve-out or a Yahtzee migration prerequisite.

---

## Wave 3B decision matrix

### Option A — Shell-owned seat economy primitive
`CanonicalChipstack` owns:
- badge rendering (delegates to `CanonicalChipBadge`)
- placement relative to canonical seat anchor (seat-relative geometry)
- z-order contract vs cards/dice/overlays
- showdown replacement (absorbs MGT L4883 path)
- emoticon replacement (absorbs current overlay-slot pattern)
- transport endpoint registration (single `data-chipstack-root` attribute, badge attribute deprecated)
- waiting-table downsize variant (absorbs `CanonicalSeatCluster` internal badge)
- exposes hooks: `useChipstackEndpoint(position)`, `useChipstackBoundingBox(position)`

Pros: one place to fix layering, showdown, emoticon, waiting parity bugs. Removes the L4883 parallel path. Unblocks Pot consolidation in Wave 3C.

Cons: large surface; requires Yahtzee shell-anchor migration OR an explicit carve-out; requires migrating every animator to the new endpoint attribute; touches `MobileGameTable.renderPlayerChip`, `YahtzeeGameTable`, `CanonicalSeatCluster`, `PreSessionSeatLayer` simultaneously.

### Option B — Thin shell wrapper
`CanonicalChipstack` is a passive composition of:
- `CanonicalChipBadge` (existing)
- `useSeatAnchors()` for placement (existing)
- transport hooks (existing — `useChipTransport`)
- game-owned animations (no change)

Adds: a single component to encapsulate the *pattern* used today in `MobileGameTable.renderPlayerChip`, so Yahtzee + MGT + (eventually) Gin/Cribbage share the same composition. Does NOT absorb showdown / emoticon / waiting paths.

Pros: low risk, incremental, doesn't block Wave 3C; no animator migration required; no Yahtzee anchor work.

Cons: parallel showdown disc (L4883) remains; waiting-table badge remains a separate primitive; no z-order contract — bugs in those areas still require bespoke fixes.

### Recommendation framework (not a decision)
- If Wave 3C (Pot) needs a shared geometry contract → **A** is the prerequisite.
- If Wave 3C can stand alone on the existing badge primitive → **B** is sufficient and Wave 3B becomes optional polish.
- If showdown/emoticon/waiting-parity bugs are an active complaint → **A**.
- If the next user-visible work is animator consolidation (Wave 3D) → **A** simplifies endpoint contracts, **B** does not.

---

## Out of scope (explicit)

- Pot disc & `displayedPot` freeze/snap (Wave 3C)
- Dealer button (Wave 3B-alt or later)
- Chip transport implementation (Wave 3D)
- Settlement math
- FeltLayout (Wave 4)
- Gin/Cribbage seat-anchor migration (deferred follow-up)
