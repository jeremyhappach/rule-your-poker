# Canonical Chipstack / Pot Program — Inventory

Scope: chip, pot, dealer-button, transport across all 7 games. **Inventory only — no fixes, no primitives, no code.**

---

## 1. Component inventory (the actual surface)

| File | Role | Status |
|---|---|---|
| `src/components/ChipStack.tsx` (53 LOC) | Canonical-looking "chip disc" primitive. Tablet doubling baked in. | **Imported by `MobileGameTable` but never rendered.** Dead. Sole live consumer is `WaitingForPlayersTable` *contract doc* (not code). |
| Inline chip rendering | Per-table chip discs are bespoke `<div className="rounded-full bg-white border-2 border-amber-500…">` in `MobileGameTable` (L4626, L6910), `CribbageMobileGameTable` (L6312…), `GinRummyGameTable` (L2494…), plus `chipValue=` props into shell waiting/identity rows. | **Authoritative path.** Every game renders chips inline; sizes via `chipSize` local var. |
| `formatChipValue` | String formatter only. Used everywhere. | Stable utility, not a component. |
| `ChipChangeIndicator.tsx` | Floating +/- delta toast. | Independent, low risk. |
| `DealerButtonAnimation.tsx` (153 LOC) | Animated dealer-button assignment. | **Defined but never imported.** Dead. Live dealer indicator is a static `<div>D</div>` (MGT L4660, L6936; Cribbage L7505 inline tag). |
| `AnteUpAnimation.tsx` | Player → pot fly-in for antes. | Live, MGT only (L5168, L5382, L5534). |
| `ChipTransferAnimation.tsx` (295 LOC) | Player → pot generic chip fly (post-decision). | Live in MGT (L5347) and Yahtzee (L2075). |
| `PotToPlayerAnimation.tsx` (395 LOC) | Pot → winner fly-out. | Live in MGT (L5435, L5512, L5686). |
| `HolmWinPotAnimation.tsx` | Holm-specific pot→winner with Chucky branch. | Live in MGT (L5457) for Holm only. |
| `CribbageChipTransferAnimation.tsx` (196 LOC) | Cribbage-flavored player↔pot fly (also reused by Gin). | Live in Cribbage (L5969) and Gin (L2429). |

**Six near-duplicate fly-animation components. Two fully-dead "canonical" primitives.** That is the headline finding.

---

## 2. Per-game matrix

| Game | Chip disc owner | Pot disc owner | Dealer button | Player→Pot anim | Pot→Player anim | Seat anchor source | Tablet hacks | z-index | Game-specific resistance |
|---|---|---|---|---|---|---|---|---|---|
| **Holm** | MGT inline | MGT inline (L5785 pot label) | MGT static `D` (L4660) | `AnteUpAnimation`, `ChipTransferAnimation` | `HolmWinPotAnimation` (Chucky branch) | shell seat anchors (canonical) | `chipSize` ternary on `isTablet` | `z-[100]` (ante), `z-[100]` (transfer), `z-[100]` (HolmWin) | **Chucky/Pussy-Tax/Phase-2** pot composition with re-ante & rollover (MGT L1408–1498). Hard to canonicalize. |
| **Gin Rummy** | GinRummyGameTable inline (L2494) | GinRummyGameTable inline | n/a (no rotating dealer button shown) | `CribbageChipTransferAnimation` (borrowed) | `CribbageChipTransferAnimation` reversed | bespoke seat anchors inside GinRummyGameTable | inline sizing | inline `z-` | Win amount is per-knock/gin/undercut, not pot. Settlement is direct A↔B, not via central pot. |
| **Cribbage** | CribbageMobileGameTable inline (L6312, L6392, L6497) | bespoke | inline `D` tag on rail (L7505) | `CribbageChipTransferAnimation` | same | bespoke seat anchors | inline | inline | Pegboard owns most of the rail; chips piggyback on rail geometry, not seat geometry. |
| **3-5-7** | MGT inline | MGT pot label | MGT `D` (L4660), hidden in multi-player showdown (L2141) | `AnteUpAnimation` (rollover + pussy-tax branches), `ChipTransferAnimation` | `PotToPlayerAnimation` | shell seat anchors | `chipSize` ternary | `zIndex:200` (PotToPlayer), `z-[100]` others | Pot freeze/snap protocol (MGT L1508–1555) is 357-shaped. Rollover ante uses `anteAnimationExpectedPot`. |
| **Yahtzee** | YahtzeeGameTable inline; identity rows via shell | n/a (per-roll/per-cat settlement, no central pot disc) | n/a | `ChipTransferAnimation` (L2075) | n/a | shell seat anchors | inline | `z-[100]` | Settlement is per-category, not pot-based. No pot disc to canonicalize. |
| **Horses** | MGT inline | MGT pot label | MGT `D` | `AnteUpAnimation`, `ChipTransferAnimation` | `PotToPlayerAnimation` | shell seat anchors | `chipSize` ternary | `z-[100]`/`zIndex:200` | Stay/Roll outcome composes legs into pot; multi-leg accumulation in pot label only. |
| **SCC** | MGT inline | MGT pot label | MGT `D` | `AnteUpAnimation`, `ChipTransferAnimation` | `PotToPlayerAnimation` | shell seat anchors | `chipSize` ternary | `z-[100]`/`zIndex:200` | Cargo-rank ante structure differs from Horses but uses same MGT pot path. |

---

## 3. Cross-cutting risks

- **OVR (overlap)**: Six fly-animation components race for `z-[100]` / `z-[200]` / `z-[250]`. No central z-stack contract. Adding a primitive without z-policy will create regressions.
- **OFL (overflow)**: Tablet-doubling lives in two places — dead `ChipStack.tsx` (`isTablet ? w-20 : w-10`) and inline `chipSize` ternaries in each game table. Divergent magic numbers.
- **STL (stale presentation)**: `displayedPot` lock/snap protocol (MGT L1246–1555) is the most fragile state in the whole shell. Any pot canonicalization must inherit this exact freeze-before-paint discipline or pot-in animations will desync.
- **AMB (ownership)**: Gin and Cribbage share `CribbageChipTransferAnimation` despite different settlement models. Holm has its own win-pot anim. 357 / Horses / SCC share MGT's `PotToPlayerAnimation`. Yahtzee uses only the transfer anim. No principle, only history.
- **LCC (lifecycle coupling)**: `AnteUpAnimation` carries multi-paragraph comments in `Game.tsx` (L1046–1115) about stale-trigger cross-dealer-game leakage. Any new canonical ante primitive inherits this entire foot-gun.
- **Seat anchors**: shell-anchored for MGT-resident games (Holm/357/Horses/SCC + Yahtzee), bespoke for Gin/Cribbage. A canonical chip primitive that requires canonical seat anchors **excludes Gin and Cribbage on day one**.

---

## 4. Wave 3 scope decision

### Option A — CanonicalChipstack only

- Replace inline chip discs + delete dead `ChipStack.tsx`, unify tablet sizing in one primitive.
- Touches every game's chip rendering but leaves pot, dealer button, and 6 fly-animations untouched.
- **Pro:** minimal blast radius, deletable dead code, immediate tablet-magic-number cleanup.
- **Con:** does not address the actual fragility (pot freeze/snap, animation z-stack, fly-animation duplication). Wave 4 (FeltLayout) still needs pot positions as inputs, so pot work is just deferred.

### Option B — CanonicalEconomyLayer (Chipstack + Pot + Dealer button + Chip transport)

- Subsumes A plus: a pot primitive that owns the freeze/snap protocol, a single dealer-button component (kill dead `DealerButtonAnimation.tsx` and the inline `D` tags), and one transport/fly primitive that replaces the 6 near-duplicate animation files behind a strategy prop (`ante` | `transfer` | `pot-to-player` | `holm-win`).
- **Pro:** fixes the actual debt — z-stack contract, freeze/snap discipline, single source of tablet sizing, single seat-anchor consumer. Unblocks Wave 4 FeltLayout because pot position becomes a known anchor.
- **Con:** Holm Chucky branch + 357 pot snap protocol + Gin/Cribbage bespoke seat anchors are all real obstacles. Larger blast radius. Realistically a 3–4 sub-wave program, not a single wave.

### Recommendation

**Option B, staged.** Structure it as Wave 3 with explicit sub-waves so each step ships independently:

1. **3A — CanonicalChipstack.** Replace inline discs in MGT-resident games (Holm/357/Horses/SCC/Yahtzee). Delete dead `ChipStack.tsx`. Unify tablet sizing. Skip Gin/Cribbage until they have canonical seat anchors.
2. **3B — CanonicalDealerButton.** Replace inline `D` tags + delete dead `DealerButtonAnimation.tsx`. Smallest sub-wave; high cleanup-to-risk ratio.
3. **3C — CanonicalPot.** Owns `displayedPot` freeze/snap. Migrate Holm/357/Horses/SCC; Yahtzee opts out (no pot); Gin/Cribbage opt out (no central pot). This is the high-risk sub-wave — gate on STL telemetry from current MGT path.
4. **3D — CanonicalChipTransport.** One animation component with a strategy prop. Migrate `AnteUpAnimation` → `ChipTransferAnimation` → `PotToPlayerAnimation` → `HolmWinPotAnimation` → `CribbageChipTransferAnimation` in that order (riskiest last). Inherits z-stack contract from 3C.

Reasoning: A alone leaves the debt that actually causes user-visible bugs (pot freeze races, animation z-overlap) untouched, and Wave 4 will be blocked on pot positioning anyway. B-as-monolith is too big to land safely given Holm Chucky and 357 snap protocols. Staged B gets the cleanup wins early (3A/3B) while isolating the risky discipline (3C) from the risky migration count (3D).

### Out of scope for Wave 3 regardless of choice

- Gin and Cribbage chipstack migration — gated on those tables adopting canonical seat anchors (Wave 2-shaped follow-up, not Wave 3).
- Yahtzee pot — there is none. No work.
- Settlement math (Gin direct settlement, Cribbage pegboard, Yahtzee per-category) — these are not chip/pot concerns.

---

## 5. Decisions you need to make (no implementation yet)

1. **A vs B vs staged-B?** Recommended: staged-B.
2. **Does Wave 3 block Wave 4, or can they interleave?** Recommended: 3A + 3B can land before Wave 4 opens; 3C must land before Wave 4 FeltLayout; 3D can run in parallel with Wave 4.
3. **Are Gin and Cribbage seat-anchor migrations a Wave 2 follow-up or a Wave 3 prerequisite?** If prerequisite, Wave 3 grows. If follow-up, those two games stay legacy through Wave 3 and adopt later.
