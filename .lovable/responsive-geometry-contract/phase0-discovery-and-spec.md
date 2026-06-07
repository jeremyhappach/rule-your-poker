# Contractual Responsive Geometry — Phase 0 Discovery + Spec

Status: **Discovery / spec pass. No implementation.**
Owner: Canonical shell layer.
Scope: Every gameplay artifact rendered inside the canonical felt (play region)
or the active-pane content region (row 4 of `ShellHudGrid`).

This document is the deliverable for the discovery pass. It is intended to be
the contract reference for the subsequent implementation waves.

---

## 1. Problem statement

Game artifact sizing is presently a mixture of:

- raw Tailwind pixel utilities (`w-12 h-[68px]`, `min-w-[140px]`)
- per-device branches (`isTablet ? 360 : 200`, `isTablet ? 'lg' : size`)
- magic Tailwind transforms (`scale-[2.8]`, `scale-[1.8]`, `scale-[1.5]`)
- per-round conditional scales (3-5-7's round-1 vs round-3 transforms)
- per-game `min-h-[…px]` reservations inside the active pane
- ad-hoc nudges (`-mb-2`, `-translate-x-1/2 + scale-[…]`)

Symptoms already visible:

- Gin: opponent card slightly overlaps the scoring rail.
- Cribbage: scoring rails / cards sit too low; large dead space above.
- Horses: pot/chip artifacts crowd the felt plate.
- 3-5-7: round-1 cards under-fill, round-3 cards risk overflow on small phones.
- Yahtzee: dice + scorecard packing has no shared budget; each surface guesses.

Every fix today is a per-game offset. The next ten games will inherit the
same shape of defect. We need a **proportional, contract-driven** layout
model — owned by the shell, **consumed** by games.

---

## 2. Principles (locked)

1. Artifacts must never overlap in a way that breaks readability.
2. Artifacts must never fall outside the canonical felt / pane bounds.
3. Crowding is avoided when possible.
4. Subject to 1–3, artifacts are as large as they can be.
5. Sizing is proportional to available space, not device class.
6. Layout adapts round-by-round as artifact count changes.
7. Device-specific hooks (`isTablet`, `isPhone`) are not allowed where
   geometry can solve the problem.
8. Games declare *requirements*; the shell decides *pixels*.

---

## 3. Available substrate (already exists, do not rebuild)

These are the load-bearing primitives the contract will build on.
**No new geometry source-of-truth is being introduced.**

- `index.css` shell tokens:
  `--shell-play-h`, `--shell-hud-h`, `--shell-felt-w`, `--shell-felt-h`,
  `--hud-h-announcement`, `--hud-h-timer`, `--hud-h-tabs`, `--hud-h-pane`,
  `--hud-h-identity`, `--play-scale`, `--hud-scale`.
- `ResponsiveGeometryProvider` + `useGeometryTokens()` — device-class
  tokens with `tableSurfaceMaxHeight` already promoted off magic `55vh`.
- `GameplaySlotContract.ts` — typed contract for what a gameplay surface
  publishes to the canonical slot (`centerSize`, `chipIntents`, etc.).
- Canonical shell rows (announcement / timer / tabs / pane / identity)
  with fixed proportional row heights.

The contract proposed below is the **layer above** these tokens: it
translates `(felt box, pane box, artifact requirements)` into resolved
pixel sizes for cards / dice / chips / rails.

---

## 4. Geometry debt inventory

Notation: P=pane (row 4 of HUD), F=felt (play region), R=risk.

### 4.1 Cribbage

| Artifact | Current sizing/positioning | R | Proposed primitive |
|---|---|---|---|
| Cut card | `w-10 h-[60px]` fixed, no felt awareness | M | `useCardSlotLayout` |
| Crib stack | Fixed felt position, no overlap budget vs scoring | H | `useCardStackLayout` + reserved-zone |
| Pegging row | Fan within fixed div; no per-round scaling | H | `useCardRowLayout` |
| Peg board | Manual aspect; sits below tabs without budget | H | `useScoreRailLayout(orientation)` |
| Player hand (pane) | `min-h-[170px]` reservation in pane | M | `usePaneCardRowLayout` |
| Chip transfer plate | Hardcoded coords | M | `usePotBoxLayout` |

### 4.2 Gin Rummy

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Discard slot | `w-12 h-[68px]` fixed | M | `useCardSlotLayout` |
| Stock pile | `w-12 h-[68px]` fixed | M | `useCardSlotLayout` |
| Opponent hand strip | Free-flow flex, overlaps score rail | **H** | `useCardRowLayout(maxOverlap)` |
| Knock/Gin overlay cards | Free-flow inside felt | M | `useCardRowLayout` |
| Score peg board | Sibling of pane, manual width | H | `useScoreRailLayout` |
| Layoff stacks | Fixed gap, no felt clamp | M | `useCardStackLayout` |

### 4.3 Yahtzee

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Active dice row | `DiceTableLayout` w/ `isTablet?lg:size` | **H** | `useDiceLayout` (count, slot box) |
| Held dice tray | Fixed below dice | M | `useDiceLayout(sub='held')` |
| Scorecard | Free-flow, competes with dice for pane | **H** | `usePaneSplitLayout(['dice','scorecard'])` |
| Bonus chip cluster | Manual coords | L | `useChipClusterLayout` |

### 4.4 Horses

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Player area cards | `HorsesPlayerArea` `min-w-[100/140]`, `max-w-[50px]` | **H** | `useCardStackLayout` |
| Center dice | `DiceTableLayout` w/ `isTablet?360:200` | H | `useDiceLayout` |
| Pot box | Crowds felt; no reserved zone | **H** | `usePotBoxLayout` |
| Leg / chip indicators | `min-h-[24/50px]` | M | `useChipClusterLayout` |
| Hand result display | Free overlay over felt | M | `useOverlayLayout` |

### 4.5 Holm

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Hole cards (pane) | Manual scale | M | `usePaneCardRowLayout` |
| Community cards | `CommunityCards` fixed widths | H | `useCardRowLayout` |
| Pot chip cluster | Manual position | M | `usePotBoxLayout` |
| Bet action buttons | Sibling of cards, no budget share | M | `usePaneActionStripLayout` |

### 4.6 3-5-7

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Player hands (3/5/7 round) | `scale-[1.6/2.2/2.1]` + tablet `scale-[2.8]` | **H** | `useCardRowLayout(count, maxOverlap)` |
| Winner reveal hand | `scale-[1.5]` / `scale-[1.8]` device-branched | **H** | `useCardRowLayout` |
| Pot box | Hardcoded center | M | `usePotBoxLayout` |
| Decision buttons | Sibling under cards | M | `usePaneActionStripLayout` |

### 4.7 SCC (Ship-Captain-Crew)

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Center dice | `DiceTableLayout` shared with Horses | H | `useDiceLayout` |
| Cargo chip cluster | `--poker-cargo` chip cluster, manual | M | `useChipClusterLayout` |
| Hand result | Overlay, no clamp | M | `useOverlayLayout` |
| Pot box | Same as Horses | H | `usePotBoxLayout` |

### 4.8 Cross-cutting (every game)

| Artifact | Current | R | Primitive |
|---|---|---|---|
| Canonical felt clip | Owned by shell; OK | — | `useSafeFeltBounds` (read-only consumer API) |
| Active pane content | `--hud-h-pane`; consumers don't query it | H | `usePaneGeometry` |
| Overlay portals | `[data-canonical-felt-surface]` | OK | `useOverlayLayout` reads this |

Highest-risk surfaces: **3-5-7 hand**, **Yahtzee dice+scorecard split**,
**Gin opponent strip**, **Horses pot/player area**, **Cribbage pegging row**.

---

## 5. Proposed contract model

```
┌─────────────────────────────────────────────────────────────┐
│ Shell owns geometry budget                                  │
│   - felt box (px) from --shell-felt-w/h                     │
│   - pane box (px) from --hud-h-pane × column width          │
│   - reserved zones (announcement/timer/tabs/identity)       │
└──────────────────────────┬──────────────────────────────────┘
                           │  publishes via Provider
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Geometry contract layer (new)                               │
│   usePlayGeometry()   → felt box, safe bounds               │
│   usePaneGeometry()   → pane box, action-strip reservation  │
│   useArtifactScale()  → uniform scale clamp helper          │
│   useCardRowLayout()  → {width,height,overlap,gap} for N    │
│   useCardStackLayout()→ {width,height,zStep} for stacks     │
│   useCardSlotLayout() → single slot (deck/discard/cut)      │
│   useDiceLayout()     → {dieSize,gap,rows,cols} for N       │
│   useChipClusterLayout()→ {radius,chipSize} for N           │
│   usePotBoxLayout()   → {x,y,w,h} inside safe bounds        │
│   useScoreRailLayout()→ rail orientation + thickness budget │
│   usePaneSplitLayout()→ split pane for multi-artifact games │
└──────────────────────────┬──────────────────────────────────┘
                           │  resolved pixels
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Game surfaces                                               │
│   - Declare: artifact type, count, aspect, min/preferred,   │
│     max overlap, reserved zones, priority                   │
│   - Consume: resolved {width,height,overlap,...}            │
│   - NEVER: pick pixels, branch on device, use scale-[…]     │
└─────────────────────────────────────────────────────────────┘
```

### 5.1 Request shape (what a game publishes)

```ts
interface ArtifactRequest {
  kind: 'card' | 'die' | 'chip' | 'pot' | 'rail' | 'slot';
  count: number;
  aspect?: number;                 // e.g. card = 0.7
  minReadablePx: number;           // refuses to go smaller
  preferredPx: number;             // target if space allows
  maxOverlapRatio?: number;        // 0 = no overlap, 0.6 = heavy fan
  priority: number;                // higher = wins budget contention
  reservedFor?: 'rank-suit' | 'selection' | 'action';
}
```

### 5.2 Resolved shape (what the contract returns)

```ts
interface ResolvedLayout {
  itemWidth: number;
  itemHeight: number;
  overlapPx: number;        // negative gap when fanning
  gapPx: number;            // positive gap when spaced
  rows: number;
  cols: number;
  bounds: { x: number; y: number; w: number; h: number };
  scale: number;            // for legacy `scale-[…]` callers during migration
}
```

### 5.3 Invariants the resolver enforces

- `itemWidth ≥ minReadablePx`. If impossible, the resolver **reduces count**
  via the game's declared fallback (wrap to next row, paginate, etc.) — it
  never returns a sub-readable size.
- Sum of artifact bounds ≤ safe bounds (felt or pane minus reserved zones).
- Overlap never covers the top-left corner region declared as
  `rank-suit` reservation for playing cards.
- Action strips (`usePaneActionStripLayout`) get first claim on pane
  height; cards/dice/chips compete for the remainder.

---

## 6. What must **not** be solved per-game

- Per-game `isTablet ? X : Y` card / dice sizing.
- Per-game `scale-[1.8]` / `scale-[2.8]` transforms on hands.
- Per-game `min-h-[…px]` pane reservations.
- Per-game `-mb-2` / `-translate-y-…` nudges to dodge another artifact.
- Per-game "tablet exception" branches.
- Per-game pot/chip absolute coords.
- Per-round `if (round === 1) scale-1.6 else scale-2.2` ladders.

If a game needs one of these today, it is a **contract gap**, not a
license to add another offset.

---

## 7. Migration order (proposed)

Sequenced so each wave reduces risk before the next wave depends on it.

1. **`usePlayGeometry()` + `usePaneGeometry()`** — read-only resolvers
   over existing shell tokens. Zero behavior change; unblocks everything.
2. **`useCardRowLayout()`** — first real resolver. Migrate **3-5-7
   hand** (highest-visibility, biggest scale magic) and **Gin opponent
   strip** (already overlapping). Retire `scale-[1.6/2.2/2.8/1.8]`.
3. **`useDiceLayout()`** — migrate `DiceTableLayout` device branches
   (Yahtzee / Horses / SCC). Retire `isTablet ? 360 : 200`.
4. **`useCardSlotLayout()` + `useCardStackLayout()`** — Gin
   discard/stock, Cribbage cut/crib, Horses player area.
5. **`useScoreRailLayout()`** — Cribbage pegboard, Gin pegboard.
   Resolves the Gin overlap and Cribbage dead-space defects structurally.
6. **`usePotBoxLayout()` + `useChipClusterLayout()`** — Horses/SCC pot
   crowding, Holm chip cluster, Yahtzee bonus chips.
7. **`usePaneSplitLayout()`** — Yahtzee dice+scorecard, Cribbage
   pegging+score, Holm cards+actions.
8. **Lint rule / codemod** — fail PRs that introduce `scale-[…]`,
   `isTablet ? px : px`, or `min-h-[…px]` inside a gameplay surface.

Each wave keeps existing surfaces functional during cutover (the
resolver returns numbers; the surface stops authoring them).

---

## 8. Risk ranking (consolidated)

**High** — visible defect today or imminent:

- 3-5-7 round-scaled hand transforms
- Gin opponent strip overlapping scoring rail
- Yahtzee dice+scorecard pane split
- Horses player area + pot crowding
- Cribbage pegging row + pegboard placement

**Medium** — works today, brittle under new device/round counts:

- Cribbage cut card / crib stack
- Gin discard / stock / layoff
- Holm community cards, hole-card pane scale
- 3-5-7 winner reveal scale, decision buttons
- SCC cargo cluster, hand result overlay

**Low** — already shell-aware or cosmetic:

- Canonical felt clip
- Overlay portals to `[data-canonical-felt-surface]`
- Leg / chip indicator min heights (HorsesPlayerArea)

---

## 9. Open questions (for next decision pass)

1. Does `useCardRowLayout` return **px** only, or also a CSS custom
   property (`--card-w`) so static markup can consume it without JS?
   *Recommendation: both — the resolver writes the var on its mount
   node, callers can read either.*
2. Should `usePaneSplitLayout` be declarative (`['dice','scorecard']`
   with weights) or imperative (game asks for `n` slots)?
   *Recommendation: declarative with weights + min heights.*
3. Where do **overlays** (cut-card reveal, gin overlay, hand result)
   plug in — through the geometry contract or stay portal-only?
   *Recommendation: portal-only, but read `useSafeFeltBounds()` so they
   can't overflow.*
4. Linting strategy — ESLint rule vs codemod sweep vs both?
   *Recommendation: ESLint rule scoped to `src/components/*Felt*.tsx`
   and `src/components/MobileGameTable.tsx`, plus one codemod sweep.*

---

## 10. Acceptance for this pass

- [x] Inventory of current geometry debt per game.
- [x] Proposed geometry contract model + request/resolved shapes.
- [x] Proposed migration order (8 waves).
- [x] Risk ranking by game/artifact.
- [x] Explicit statement of what must **not** be solved with per-game
      offsets (§6).
- [ ] **Decision required:** which primitive to implement first.
      *Recommendation: ship wave 1 (`usePlayGeometry` + `usePaneGeometry`)
      as a no-op read layer, then wave 2 (`useCardRowLayout`) targeting
      3-5-7 to retire the scale ladder.*

No code changed in this pass.
