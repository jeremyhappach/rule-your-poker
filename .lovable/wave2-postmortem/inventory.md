# Wave 2 Post-Mortem — Ownership & Geometry Inventory

Status: INVENTORY ONLY. No fixes. No Wave 4 design. No code.

Scope: enumerate gameplay artifacts per game, classify ownership and geometry
source, flag risks. Used to decide whether Wave 2G exists, whether Wave 4
scope shifts, and whether Canonical Chipstack becomes Wave 3.

## Ownership legend
- **Shell** = Canonical Shell owns mount + geometry (seat anchors, felt surface, action strip slot, lifecycle rail, overlay mounts).
- **Geo+Game** = Canonical geometry primitive (useCardRowLayout / useDieRowLayout / ResponsiveGeometryProvider) consumed by game render.
- **Hybrid** = part shell-owned, part bespoke; seam exists.
- **Legacy** = pre-canonical bespoke render, no shell or geometry primitive.

## Geometry legend
- **CardRow** = `useCardRowLayout`
- **DieRow** = `useDieRowLayout`
- **FeltLayout** = future `useFeltLayout` (not yet built)
- **Bespoke** = hard-coded sizes / min-h wrappers / per-game math
- **Unknown** = not audited in this pass

## Risk legend
- **OVR** = overlap risk (artifacts can collide at small viewports)
- **OFL** = device overflow risk (artifact escapes felt at iPhone-class widths)
- **STL** = stale presentation risk (carryover across dealer-game / hand boundary)
- **AMB** = ownership ambiguity (two systems could legitimately render this)
- **LCC** = lifecycle coupling (artifact mount/unmount tied to lifecycle phase rather than identity)

---

## Holm

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Hole cards (per seat) | Geo+Game | CardRow | — | — |
| Community / hap card | Geo+Game | CardRow | — | — |
| Chipstacks (seat) | Legacy | Bespoke (`ChipStack` w/ tablet doubling) | AMB | Wave 3 (Canonical Chipstack) |
| Pot | Legacy | Bespoke | AMB, OVR | Wave 3 |
| Dealer button | Shell (anchors) + Legacy render | Bespoke flight | — | — |
| Score rail / leg/buck indicators | Legacy | Bespoke | — | — |
| Action strip (Pass/Take CTA) | Shell (ActionStripSlot) | — | — | Done (2F.1) |
| Lifecycle prompts | Shell (rail) | — | — | Done (Phase 2) |
| Cracked overlay | Legacy inline | Bespoke | LCC | Phase 3 overlay migration |
| Felt decorations | Shell | — | — | — |

## Gin Rummy

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Player hand (sortable) | Geo+Game | CardRow | — | — |
| Opponent hand (face-down) | Geo+Game | CardRow | — | — |
| Stock / discard pile | Hybrid | Bespoke | OVR (tight at 393px) | Wave 4 (FeltLayout) candidate |
| Pegboard | Legacy | Bespoke (`GinRummyPegBoard`) | — | — |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Action strip (Draw/Knock CTA) | Shell (ActionStripSlot) | — | — | Done (2F) |
| Knock / Gin overlays | Legacy | Bespoke | LCC | Phase 3 overlay migration |
| Match winner | Legacy | Bespoke | LCC | Phase 3 |
| Opponent draw motion | Legacy | Bespoke | — | Animation primitive (X) |
| Felt decorations | Shell | — | — | — |

## Cribbage

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Hand cards | Geo+Game | CardRow | — | — |
| Crib (face-down stack) | Geo+Game | CardRow | — | — |
| Pegging row | Geo+Game | CardRow | OVR at 4-card width | monitor |
| Cut card | Shell (felt surface) | Bespoke | — | — |
| Pegboard | Legacy | Bespoke (`CribbagePegBoard`) | — | — |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Pot | Legacy | Bespoke | AMB | Wave 3 |
| Dealer button | Shell anchors | Bespoke flight | — | — |
| Counting / scoring strip | Legacy ambient | Bespoke | LCC | — (ambient, intentional) |
| Action strip (Discard / Peg CTA) | Shell (ActionStripSlot) | — | — | Done (2F.1) |
| Turn spotlight | Shell anchor | — | — | — |
| Skunk / double-skunk overlay | Shell (CanonicalCelebrationLayer) | — | — | Done |
| Cut card reveal | Legacy | Bespoke | — | Animation primitive (X) |
| Felt decorations | Shell | — | — | — |

## 3-5-7

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Dealt cards (per seat 3/5/7) | Geo+Game | CardRow | OVR at 7-card width on phone | monitor / FeltLayout |
| Center "house" cards | Hybrid | Bespoke | OVR | Wave 4 candidate |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Pot | Legacy | Bespoke | AMB | Wave 3 |
| Ante / chopped / sweep / bucks-on-you animations | Legacy | Bespoke | — | Animation primitive (X) |
| Result reveal plate | Legacy ambient | Bespoke | LCC | — |
| Action strip (Ante CTA) | Shell (ActionStripSlot) | — | — | Done (2F) |
| Instant-win overlay | **MISSING / unverified** | — | LCC, AMB | Phase 3 — needs asset audit (see phase1-inventory Q1) |
| Felt decorations | Shell | — | — | — |

## Yahtzee

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Felt dice (active roller) | Geo+Game | DieRow | OFL slight on iPhone (carries over from Horses/SCC) | Wave 4 (geometry tightening) |
| Scorecard (own) | Legacy | Bespoke | — | — |
| Opponent scorecard region | Legacy | Bespoke | — | — |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Pot | n/a | — | — | — |
| Action strip (Roll N / Pick category) | Shell (ActionStripSlot) | — | STL (first-roll revert fixed 2F.2; watch regression) | — |
| YAHTZEE! / upper-bonus / winner overlays | Legacy | Bespoke | LCC | Phase 3 overlay migration |
| Bot thinking plate | Legacy ambient | Bespoke | — | — |
| Felt decorations | Shell | — | — | — |

## Horses

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Player dice tray | Geo+Game | DieRow | OFL slight on iPhone | Wave 4 (geometry tightening) |
| Held-die indicator | Geo+Game | DieRow | — | — |
| Hand result strip | Legacy ambient | Bespoke | LCC | — |
| Leg indicator | Legacy | Bespoke | AMB | Wave 3 (chipstack-adjacent) |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Pot | Legacy | Bespoke | AMB | Wave 3 |
| Auto-roll indicator | Legacy ambient | Bespoke | — | — |
| Leg / sweep animations | Legacy | Bespoke | — | Animation primitive (X) |
| Action strip (Roll / Stay / Locked In / Result) | Shell (ActionStripSlot) | — | — | Done (2F.3) |
| Natural overlay | **MISSING / unverified** | — | LCC, AMB | Phase 3 — needs asset audit |
| Felt decorations | Shell | — | — | — |

## Ship-Captain-Crew (SCC)

| Artifact | Ownership | Geometry | Risk | Future Wave |
|---|---|---|---|---|
| Player dice tray | Geo+Game | DieRow | OFL slight on iPhone (shared with Horses) | Wave 4 |
| Cargo dice (locked 6/5/4 + cargo) | Hybrid | Bespoke (inside SCCHandResultDisplay) | OVR, AMB | Wave 4 candidate |
| Hand result strip | Legacy ambient | Bespoke | LCC, STL (first-hand flicker fixed in controller) | monitor |
| Chipstacks | Legacy | Bespoke | AMB | Wave 3 |
| Pot | Legacy | Bespoke | AMB | Wave 3 |
| Ante / chip-transfer animations | Legacy | Bespoke | — | Animation primitive (X) |
| Action strip (Roll / Lock In / Locked In / Result) | Shell (ActionStripSlot) | — | — | Done (2F.3) |
| No-qualify / midnight overlays | Legacy | Bespoke | LCC | Phase 3 overlay migration |
| Felt decorations | Shell | — | — | — |

---

## Cross-game patterns observed

1. **Chipstacks + Pot are universally legacy.** Every game renders bespoke `ChipStack` with tablet-doubling magic numbers and per-game pot composition. This is the single largest remaining ownership debt, touches all 7 games, and is the strongest candidate to be promoted to **Wave 3 (Canonical Chipstack)**.

2. **Dice geometry is canonical-but-tight.** All three dice games (Yahtzee, Horses, SCC) consume `useDieRowLayout`, but the iPhone-class OFL flicker reproduces on all three. Containment is a one-knob change (maxDieSize or pane reserve), but the user has fenced geometry from 2F. This is a **Wave 4** item, not 2G.

3. **Pegboards and indicators (leg/buck/auto-roll) are uniformly legacy.** None consume canonical geometry. Low risk individually; collectively they suggest a "score-rail / indicator" primitive could exist, but reuse is shallow — defer until two games genuinely share one.

4. **Overlay class is consistently Phase 3 territory.** Every dramatic event (Cracked, Knock, Gin, MatchWinner, YAHTZEE!, UpperBonus, NoQualify, Midnight, Natural, InstantWin) is still inline/legacy. Skunk/double-skunk are the only ones migrated. This is **Transient UX Platform Phase 3**, not Wave 2G.

5. **Stale-presentation class (STL) is concentrated at dealer-game boundary.** Yahtzee first-roll (fixed 2F.2), SCC first-hand flicker (fixed in controller), Holm first-hand bootstrap flash (fixed earlier). Pattern: per-game controllers must reset local presentation on `currentRoundId` change, not only on `isMyTurn` becoming true. Worth codifying as a controller-template lint in a future hardening pass — not a Wave.

6. **MISSING-asset risks** flagged for 3-5-7 instant-win and Horses natural overlays. Cannot Phase-3-migrate what we cannot find. Audit before opening Phase 3 for those two games.

## Recommended next-wave decisions (for user to make)

- **Wave 2G — exists?** Recommend **no**. Remaining Wave-2-shaped work (action-strip primitive consumers) is complete after 2F.3. Anything left is either chipstack (deserves its own wave) or overlay (Phase 3) or geometry (Wave 4).
- **Wave 3 — Canonical Chipstack?** Recommend **yes**. Highest cross-game reuse, clearest ownership ambiguity, blocks Wave 4 felt-layout because pot/chip positions are FeltLayout inputs.
- **Wave 4 scope?** Recommend narrowing to (a) `useFeltLayout` for center-of-felt artifacts (Gin stock/discard, 357 house cards, SCC cargo) and (b) dice OFL containment knob. Defer pegboard/indicator primitives.
- **Phase 3 (overlay migration)** continues independently of Wave 3/4; gate only on the two missing-asset audits.
