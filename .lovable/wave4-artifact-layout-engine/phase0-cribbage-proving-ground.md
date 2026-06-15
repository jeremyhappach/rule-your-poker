# Wave 4 — Artifact Layout Engine

**Proving ground:** Cribbage. If the contract satisfies Cribbage, every other
game becomes easier. This document is **architecture only** — no code, no
geometry tweaks, no per-game fixes.

End state: **ONE TABLE · ONE FELT · ONE SEAT RING · ONE CHIP ANCHOR ·
ONE SPOTLIGHT OWNER · ONE ARTIFACT LAYOUT ENGINE**.

---

## 0. Global contracts (recap, normative)

1. **No overlap.** Table artifacts may never overlap. Overlap is a bug.
2. **Aspect-ratio preserved.** Scale up or down. No stretch, no squash, no
   per-game distortion.
3. **Readability > balance > play area.** If a card becomes unreadable to
   make room for something else, the card wins.
4. **Artifacts as large as reasonably possible** within their protected
   space, after honoring (1)–(3).
5. **Artifacts negotiate.** No artifact owns absolute pixels. Every
   artifact declares `{ preferredSize, minimumSize, aspectRatio,
   protectedArea, priority }`. The engine resolves globally. No
   `if game === 'cribbage'` branches anywhere in layout.

---

## 1. Cribbage artifact inventory

Units:
- `vmin` = `min(feltWidth, feltHeight)` of the canonical felt surface.
- All `aspectRatio` values are `width / height`.
- `priority` is the negotiation rank when space is contested
  (higher = preserved first). Range 0–100.

### 1.1 Cards

| Artifact          | Owner                     | Preferred           | Minimum            | Aspect | Priority | Protected area                                                                 |
|-------------------|---------------------------|---------------------|--------------------|--------|----------|---------------------------------------------------------------------------------|
| Hand cards (mine) | `CribbageMobileCardsTab`  | 14 vmin tall × 6    | 10 vmin tall × 6   | 5/7    | 95       | Bottom HUD strip below felt; never overlapped by pegboard, count, or rail.      |
| Opponent hand backs | Seat artifact (chip-projected) | 6 vmin tall × n | 4 vmin tall × n   | 5/7    | 70       | Hangs from chip anchor; must clear name plate above and rail below.             |
| Crib (face-down stack) | `CribbageFeltContent` | 4 vmin tall × 4    | 3 vmin × 4         | 5/7    | 60       | Top-center play band; clears cut card to the right by ≥1 vmin.                  |
| Cut card          | `CribbageCutCardReveal`   | 6 vmin tall         | 4 vmin tall        | 5/7    | 75       | Top-center, right of crib stack. Reveal animation reserved in protected area.   |
| Pegging sequence  | `CribbageFeltContent`     | 7 vmin tall × ≤8    | 5 vmin × ≤8        | 5/7    | 90       | Mid play band, ≥2 vmin below pegboard, ≥2 vmin above bottom HUD.                |
| Counting hand+cut | `CribbageCountingPhase`   | 8 vmin tall × 5     | 6 vmin × 5         | 5/7    | 92       | Owns the full play band during counting; pegging row suppressed.                |
| Discard piles     | Seat artifact             | 4 vmin tall × 2     | 3 vmin × 2         | 5/7    | 50       | Projected from chip; never overlaps neighbor seat or rail.                      |

### 1.2 Pegging board

| Artifact      | Owner                  | Preferred          | Minimum           | Aspect | Priority | Protected area                                                                   |
|---------------|------------------------|--------------------|-------------------|--------|----------|----------------------------------------------------------------------------------|
| Pegboard      | `CribbagePegBoard`     | 90 vmin × 12 vmin  | 70 vmin × 8 vmin  | 7.5/1  | 88       | Top of play band, full width minus rail. Never crosses cut/crib row or pegging.  |

Pegboard is **structural**: it pins the top of the play band. Cards
inside the play band negotiate against the pegboard's resolved height,
not its preferred height.

### 1.3 HUD

| Artifact          | Owner                       | Preferred       | Minimum        | Aspect | Priority | Protected area                                                                   |
|-------------------|-----------------------------|-----------------|----------------|--------|----------|----------------------------------------------------------------------------------|
| Player timer      | `ShellHudGrid` (top strip)  | 8 vmin tall     | 6 vmin tall    | n/a    | 85       | Top rail. Never overlapped by announcement or seat name.                         |
| Announcement rail | `CanonicalAnnouncement…`    | 10 vmin tall    | 7 vmin tall    | n/a    | 98       | Dedicated band beneath top rail. Grows downward into play band only if minimum unmet. |
| Identity/title    | HUD bottom strip            | 6 vmin tall     | 5 vmin tall    | n/a    | 80       | Bottom rail beneath my-cards.                                                    |
| Tabs              | HUD bottom strip            | 7 vmin tall     | 6 vmin tall    | n/a    | 80       | Bottom rail. Coexists with identity in the bottom HUD reserve.                   |

### 1.4 Seat ring

| Artifact            | Owner                  | Preferred         | Minimum          | Aspect | Priority | Protected area                                                                  |
|---------------------|------------------------|-------------------|------------------|--------|----------|---------------------------------------------------------------------------------|
| Chip disc           | `CanonicalChipDisc`    | 8 vmin            | 6 vmin           | 1/1    | 100      | Immutable anchor (`data-chip-center`). Never resized below minimum. Wave 3 lock. |
| Name plate          | `CanonicalSeatCluster` | text + 4 vmin pad | text + 2 vmin pad| n/a    | 90       | Centered above chip, 2–4 px gap. Truncates before encroaching on neighbor.      |
| Card projection slot| Seat artifact          | 6 vmin tall       | 4 vmin tall      | 5/7    | 70       | Below chip. Hangs into play band; must not enter pegboard reserve.              |
| Dealer pip          | `CanonicalSeatCluster` | 2 vmin            | 1.5 vmin         | 1/1    | 65       | Tangent to chip; inside chip protected area.                                    |
| Spotlight ring      | `TurnSpotlight`        | derived from chip | derived          | 1/1    | 100      | Pure projection from chip + felt + currentTurnPosition. Wave 3 lock.            |

### 1.5 Felt messaging

| Artifact          | Owner                       | Preferred     | Minimum      | Aspect | Priority | Protected area                                              |
|-------------------|-----------------------------|---------------|--------------|--------|----------|-------------------------------------------------------------|
| Game title        | `CribbageMobileGameTable`   | 4 vmin tall   | 3 vmin tall  | n/a    | 40       | Center of felt, behind play band. Yields to any card layer. |
| Parameters chip   | HUD/title row               | 3 vmin tall   | 2.5 vmin tall| n/a    | 35       | Adjacent to title. Yields with title.                       |

---

## 2. Safe-area map

The felt is partitioned into **bands**, top → bottom. Bands are
*reservations*, not fixed pixels — each band exposes
`{ preferred, minimum }` and negotiates with neighbors via the engine.

```text
┌──────────────────────────────────────────────────────────┐
│  OUTER RAIL RESERVE              (chrome, status, exit)  │  ~3 vmin
├──────────────────────────────────────────────────────────┤
│  HUD TOP STRIP                   (timer · identity)      │  6–8 vmin
├──────────────────────────────────────────────────────────┤
│  ANNOUNCEMENT BAND               (lifecycle rail)        │  7–10 vmin
├──────────────────────────────────────────────────────────┤
│  SEAT RING (TOP)                 (chip + name + cards)   │  reserves
│    └── chip anchors immutable (Wave 3 lock)              │  derived from
│                                                          │  chip ring
├──────────────────────────────────────────────────────────┤
│  CENTER PLAY BAND                                        │  flex
│    ├── PEGBOARD ROW              (top of play band)      │  8–12 vmin
│    ├── CRIB + CUT CARD ROW       (next)                  │  4–6 vmin
│    ├── PEGGING / COUNTING ROW    (largest)               │  5–8 vmin
│    └── FELT TITLE (background)   (yields to all cards)   │  decorative
├──────────────────────────────────────────────────────────┤
│  SEAT RING (SIDES + BOTTOM)      (chip + name + cards)   │  derived
├──────────────────────────────────────────────────────────┤
│  HUD BOTTOM STRIP                (my hand · tabs · CTA)  │  10–14 vmin
├──────────────────────────────────────────────────────────┤
│  OUTER RAIL RESERVE                                      │  ~3 vmin
└──────────────────────────────────────────────────────────┘
```

Invariants:

- **Chip ring is structural**, not flow content. Bands flow *around*
  the resolved seat ring rather than displacing it. Seat ring honors
  Wave 3 immutability.
- **Announcement band is non-overlap by construction.** It owns its
  own strip. It cannot cover seats, cards, or HUD; it grows by
  pushing the play band down, capped at the play band minimum.
- **Bottom HUD reserve is a hard floor for hand cards.** Hand cards
  belong to the HUD reserve, not the play band — readability priority
  95 means the play band yields first.

---

## 3. Conflict matrix

Each cell records the *current* contention between two artifacts and
how the engine should resolve it under the Wave 4 contract.

| ↓ vs →            | Hand cards | Pegging row | Counting row | Pegboard | Crib + cut | Announcement | Top HUD | Bottom HUD | Seat ring | Showdown overlay | Game title |
|-------------------|:---------:|:-----------:|:------------:|:--------:|:----------:|:------------:|:-------:|:----------:|:---------:|:----------------:|:----------:|
| **Hand cards**     | —         | A           | A            | A        | A          | C            | A       | B          | A         | C                | A          |
| **Pegging row**    | A         | —           | M (excl.)    | A        | A          | C            | A       | A          | A         | C                | A          |
| **Counting row**   | A         | M (excl.)   | —            | A        | M (excl.)  | C            | A       | A          | A         | C                | A          |
| **Pegboard**       | A         | A           | A            | —        | A          | C            | A       | A          | A         | C                | A          |
| **Crib + cut**     | A         | A           | M (excl.)    | A        | —          | C            | A       | A          | A         | C                | A          |
| **Announcement**   | C         | C           | C            | C        | C          | —            | A       | A          | A         | C                | A          |
| **Top HUD**        | A         | A           | A            | A        | A          | A            | —       | A          | A         | C                | A          |
| **Bottom HUD**     | B         | A           | A            | A        | A          | A            | A       | —          | A         | C                | A          |
| **Seat ring**      | A         | A           | A            | A        | A          | A            | A       | A          | —         | C                | A          |
| **Showdown overlay** | C       | C           | C            | C        | C          | C            | C       | C          | C         | —                | C          |
| **Game title**     | A         | A           | A            | A        | A          | A            | A       | A          | A         | C                | —          |

Legend:

- **A — Adjacent.** Must not overlap. Engine reserves strip / band.
- **B — Bounded.** One owns the band; the other lives inside it and
  contributes to that band's minimum (e.g. hand cards inside bottom HUD).
- **C — Compose.** Allowed to share Z-space because one is a transient,
  on-top overlay that owns its own dimming/backdrop (announcement,
  showdown). Even composed overlays must respect protected-area
  reservations of priority-≥95 artifacts so cards remain readable.
- **M (excl.) — Mutual exclusion.** Never present simultaneously
  (state machine guarantees it: counting row replaces pegging row;
  counting hand replaces crib+cut).

Current known violations (catalogued for Wave 4 implementation phase,
not fixed here):

1. **Pegging row vs pegboard** — pegging row's `top: 68%` is hand-tuned
   and assumes the pegboard's current height. Negotiation absent.
2. **Crib + cut vs announcement** — long announcement at full
   preferred height visually crowds the crib+cut row at small viewports.
3. **Counting hand vs seat ring (bottom positions)** — the dense
   counting layout can clip the bottom seats' card projection slot
   on the narrowest viewports.
4. **Hand cards vs bottom HUD tabs** — hand cards and tabs both claim
   the bottom HUD reserve with no shared owner.
5. **Game title vs play band** — title currently floats inside the
   play band as decoration; it is not formally yielded.

---

## 4. Proposed global layout contract

### 4.1 Artifact descriptor

Every artifact registers a descriptor:

```
ArtifactDescriptor {
  id:            string          // stable per-mount
  owner:         string          // game / shell module
  band:          BandHint        // 'top-hud' | 'announcement' | 'play' | 'bottom-hud' | 'seat-projection'
  preferred:     Size            // { w?: vmin, h?: vmin }
  minimum:       Size
  aspectRatio:   number          // width / height; 0 = freeform
  priority:      0..100
  protectedArea: Inset           // padding the engine must keep clear around it
  composeMode:   'flow' | 'overlay'  // overlays opt-in to C in the matrix
}
```

No descriptor names a game. Game identity never enters the resolver.

### 4.2 Bands

Bands are first-class. The shell owns the band registry:

- `top-rail`, `top-hud`, `announcement`, `play`, `bottom-hud`,
  `bottom-rail` flow vertically.
- `seat-ring` is structural (not in flow) — it consumes corners of the
  play and HUD bands and projects artifacts (cards, dealer pip, name
  plate) anchored at `data-chip-center`.
- Each band exposes `{ preferred, minimum, grow, shrink }` and the
  engine solves a 1-D constraint problem top-to-bottom.

### 4.3 Resolver algorithm (descriptive)

1. **Collect** all mounted descriptors.
2. **Group** by band.
3. For each band, **sum** preferred heights of contained artifacts,
   plus their `protectedArea` padding.
4. **Solve vertically:** if total band preferred > felt height,
   shrink bands in *inverse priority order* of the highest-priority
   artifact each contains, down to each band's minimum.
5. **Solve horizontally** per band the same way.
6. **Aspect-ratio lock:** every artifact's resolved `{w, h}` honors
   its declared ratio. If a band can't satisfy the minimum at the
   declared ratio, the engine reports a **layout fault** (visible in
   dev; logged in prod) — never silently squashes.
7. **Overlay pass:** `compose: 'overlay'` descriptors are placed last,
   sized within the felt, but must not reduce the resolved size of
   any artifact with `priority ≥ 95`. (Cards stay readable under any
   announcement.)
8. **Seat projection pass:** seat-anchored artifacts read
   `data-chip-center` and place themselves with their own
   `protectedArea` honored against neighboring seats and bands.

### 4.4 Negotiation, not branches

The resolver replaces every existing per-game adjustment:

- No `if (gameType === 'cribbage') topOffset = 17%`.
- No `if (mobile && gin) scale = 0.83`.
- No bespoke `position: absolute; top: 68%`.

Per-game tuning happens **only** via the descriptor values that game's
artifacts publish. Game logic never reads viewport size.

### 4.5 Failure modes are explicit

- **Layout fault**: a band cannot satisfy a minimum. Dev shows a
  visible badge; prod logs a `wave4:layout_fault` event with the
  failing band, artifact, and viewport. Never a silent overlap.
- **Aspect violation**: any code path that bypasses the resolver and
  applies a transform that breaks declared ratio is a bug class
  (lint rule candidate in implementation phase).

### 4.6 Wave 3 invariants preserved

- `data-chip-center` remains the immutable anchor for spotlight,
  transport endpoints, win animations, and seat projections.
- Seat ring geometry is unchanged.
- Spotlight remains a pure projection of felt + chip DOM +
  `currentTurnPosition`.

Wave 4 sits *above* Wave 3: it allocates bands and protected areas;
it does not move chips, seats, or the spotlight.

---

## 5. Cribbage as the proving ground

Cribbage exercises every contract simultaneously:

- **Dense play band** (pegboard + crib + cut + pegging) — proves
  vertical band negotiation.
- **Phase mutual exclusion** (pegging ↔ counting) — proves the M
  cells of the matrix.
- **Long-lived overlays** (announcements during counting) — proves
  the priority ≥ 95 overlay rule keeps cards readable.
- **Hand cards in bottom HUD** alongside tabs — proves the B
  (bounded) relationship.
- **Seat-projected card backs and discard piles** — proves the seat
  projection pass coexists with the play band.

If Cribbage layout is fully describable as descriptors against this
resolver, with zero per-game branches, Wave 4 is satisfied. Holm,
357, Horses, SCC, Gin, and Yahtzee then onboard by **publishing
descriptors only**.

---

## 6. Out of scope (explicit)

- Any code change to Cribbage geometry.
- Any change to chip anchor, spotlight, or seat ring.
- Any implementation of the resolver (Wave 4 implementation phase,
  separate doc).
- CanonicalPhaseEngine (Wave 5).

This document is the contract. Implementation phases follow.
