## Wave 3C.4a — Chip Anchor Invariant

**Contract — CHIP ANCHOR INVARIANT.** `data-chip-center` is the seat origin. After initial seat mount, across:

```
Waiting → Interstitial → Gameplay pre-deal → Card backs → Showdown
        → Win animation → Next hand
```

the chip's `getBoundingClientRect()` drift is **0 px** (not ±0). Spotlight, ante / chopped / sweep, bucks-on-you, pot transport, and all future win animations depend on this.

**Root cause.** `CanonicalSeatCluster` slots 1 and 4 use `top-[50%] -translate-y-1/2`. The cluster currently renders pill + chip in flow with consumer `{children}` (card backs, showdown cards, leg pips) appended below. When children mount, cluster height grows and `-translate-y-1/2` shifts the entire cluster — including the chip and `data-chip-center` — upward.

**Fix — chip-centered coordinate system.** Restructure `src/lib/canonicalShell/CanonicalSeatCluster.tsx` so the chip is the layout origin and every other artifact is anchored to it.

1. **Chip zone**: a fixed-size wrapper sized exactly to the `CanonicalChipDisc`. This is the *only* element that participates in slot anchoring (slot top/bottom/middle rules target it). Its center is therefore invariant regardless of what siblings render.
2. **Name plate / dealer pip / status overlays**: absolutely positioned siblings of the chip, anchored to chip edges (e.g. `absolute bottom-full mb-1 left-1/2 -translate-x-1/2` for "above-chip"). They do not contribute to the cluster's measured height.
3. **`children` + decorator slots** (cards, leg pips, showdown artifacts): absolutely positioned overlay anchored to the chip, with growth direction determined by row:
   - top-row seats (0, 5): grow downward from chip.
   - bottom-row seats (2, 3): grow upward from chip.
   - middle-row seats (1, 4): grow downward.
4. Public surface (`namePlacement`, `chipOverlay`, `innerDecoration`, `outerDecoration`, `chipDiscDecorators`) preserved. Only wrapper positioning changes from in-flow to chip-anchored absolute.
5. Update `CanonicalSeatCluster.test.tsx` assertions that lock in the old in-flow layout.

**Verification.** In preview, log `[data-chip-center]` rect for slots 1 and 4 at each phase listed in the contract. Drift must read 0 px. Spotlight angle, chip-transport endpoints, and leg-indicator placement all derive from `[data-chip-center]` and are therefore invariant by construction.

**Acceptance:**
- Chip rect identical across every phase (0 px drift).
- Spotlight unchanged.
- Transport endpoints (ante, chopped, sweep, pot, bucks-on-you) unchanged.
- Showdown spacing unchanged.
- No chip lift on middle seats.

---

## Wave 3C.4b — `ThreeFiveSevenWinController`

**Location** (per pushback): `src/lib/357/ThreeFiveSevenWinController.tsx`. **Not** in `canonicalShell/`. Game-specific controllers do not live in the shell; they are the inputs Wave 5's `CanonicalPhaseEngine` will eventually generalize over.

**Ownership — controller owns everything.** Per pushback, MGT stays out of phase orchestration entirely. The controller owns:

- phase state machine
- timers
- completion refs / trigger dedupe
- snapshots (winnerId, potAmount, leg positions, chip rects)
- **animation rendering** (`LegEarnedAnimation`, `LegsToPlayerAnimation`, `PotToPlayerAnimation`)
- **overlay mount** — the controller renders the overlay tree itself, portalled into the felt surface (`[data-canonical-felt-surface]`), so MGT does not need a single `if phase === …` branch.

MGT remains gameplay-only: seat rendering, game artifacts, no phase awareness. Game.tsx detects the backend outcome and emits a trigger; that is its only role.

### File layout

```
src/lib/357/
  ThreeFiveSevenWinController.tsx     # provider + overlay renderer
  useThreeFiveSevenWinController.ts   # consumer hooks (trigger)
  threeFiveSevenWinMachine.ts         # pure reducer + phase enum
```

### State machine

```
IDLE → LEG_EARNED → LEGS_TO_PLAYER → POT_TO_PLAYER → DELAY → IDLE
```

Transitions:
- `IDLE → LEG_EARNED`: on `trigger({ winTriggerId, winnerId, potAmount, legPositions })`. Dedupe by `winTriggerId`. Snapshot all payload values into controller state — never re-read from DB after this.
- `LEG_EARNED → LEGS_TO_PLAYER`: on `LegEarnedAnimation.onComplete`.
- `LEGS_TO_PLAYER → POT_TO_PLAYER`: on `LegsToPlayerAnimation.onComplete`.
- `POT_TO_PLAYER → DELAY`: on `PotToPlayerAnimation.onComplete`.
- `DELAY → IDLE`: controller-owned `setTimeout`.

### Survival contract (the real Wave 5 proto-objective)

The controller must survive:
- MGT remount
- seat remount
- showdown remount
- shell remount
- lazy-route churn

Only **route exit** kills it.

Implementation: mount `<ThreeFiveSevenWinControllerProvider>` at `App.tsx` (route-level, outside the route's render boundary that hosts `Game.tsx` / MGT), so the provider's React subtree is stable across every remount inside the route. The overlay portal targets `[data-canonical-felt-surface]` and re-attaches when the surface remounts; controller state survives because it lives in the provider above.

Test: force an MGT remount mid-`LEGS_TO_PLAYER`. Sequence must complete through `IDLE`. This single test is the prototype acceptance for Wave 5.

### Hooks

```ts
// Game.tsx — fires trigger when backend signals win.
const { trigger } = useThreeFiveSevenWinTrigger();
trigger({ winTriggerId, winnerId, potAmount, legPositions });
```

MGT does **not** consume a phase hook. The controller renders its own overlay; MGT is unaware.

### Refactor scope

- **`src/pages/Game.tsx`**: keep backend detection logic, replace local `threeFiveSevenWinTriggerId` + dedupe with a single `useEffect` that calls `trigger(...)`. Remove local sequencing state.
- **`src/components/MobileGameTable.tsx`**: delete `showLegEarned`, `threeFiveSevenWinPhase`, related timers, `is357WinWinner`-driven tabling suppression that was tied to MGT's own win phase. Tabling suppression that genuinely belongs to seat rendering (e.g. `shouldHideForTabling` for the soloist) stays — but it reads from the controller hook only if absolutely required. Strong preference: zero MGT awareness; if a suppression behavior needs the controller phase, expose it as a dedicated selector (`useIs357SeatTabled(playerId)`) so MGT reads a boolean, not the FSM.
- **Animation components unchanged**. They render where the controller mounts them, advance via `onComplete`.

### Snapshot strategy

`legPositions` and `potAmount` are snapshotted into controller state at `IDLE → LEG_EARNED`. Subsequent backend resets (status flipping to `game_over`, `last_round_result` clearing) cannot strand the sequence because the controller no longer reads DB after the trigger.

### Acceptance

- Final-leg win plays LEG_EARNED → LEGS_TO_PLAYER → POT_TO_PLAYER → DELAY → IDLE end-to-end.
- No `Loading…` flash. No zombie table.
- Forced MGT remount mid-sequence: animation completes uninterrupted. **This is the proto-Wave-5 acceptance.**
- Re-emitted trigger with same `winTriggerId`: ignored.
- Non-final-leg win path (leg awarded, hand continues) still works.
- MGT contains zero `phase === …` branches for win sequencing.

---

## Out of scope

- **Ante flicker** (`lockedChipsRef ?? displayedChips ?? player.chips`): inventory only after the controller lands; fix only if trivial.
- **Horses / SCC seat migration**: later wave.
- **Wave 5 CanonicalPhaseEngine**: the 357 controller is intentionally a prototype, not the engine.

---

## Order of operations

1. Ship 3C.4a. Verify chip rect drift = 0 px across all phases.
2. Ship 3C.4b on top of 3C.4a so animation endpoints are already stable.
3. Smoke: Waiting → Interstitial → R1/R2/R3 → multi-player showdown → final-leg win → next hand.
4. Force an MGT remount mid-`LEGS_TO_PLAYER`; confirm sequence completes.
5. Brief ante-flicker inventory note in the closing message.
