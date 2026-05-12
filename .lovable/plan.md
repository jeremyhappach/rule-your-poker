# Cause A — Unify Presentation-Derived Identity (Cribbage, Gin Rummy, Yahtzee)

Eliminates the identity-mixing class that produced 6 of 10 reported bugs (Bugs 2, 3, 4, 5, 6, 9).

## What's wrong today

Render selectors and boundary effects in three games read identity from a mix of:
- raw DB fields (`game.current_round`, `game.total_hands`, `round.id`, `round.cribbage_state.currentTurnPlayerId`)
- presentation-derived fields (`presentation.handNumber`, `presentation.roundId`)
- viewState-derived fields (`viewState.handNumber`, `viewState.currentTurnPlayerId`)

When network jitter makes one source advance before another, selectors render a hand from identity X while another selector reads identity Y. Symptoms: stale cards, replayed cut-card, scorecard flash, "wrong roll", result-display unmount.

## Fix shape (one consistent pattern across all three games)

Per game, expose a single memoized `RenderIdentity` from the existing sync hook:

```ts
type RenderIdentity = {
  dealerGameId: string | null;
  handNumber: number;
  roundId: string | null;
  turnPlayerId: string | null;       // yahtzee/cribbage
  handContextId?: string | null;     // holm
  signature: string;                  // stable concat for cache keys
};
```

Rules:
- `RenderIdentity` is computed only from `presentation` (never from raw `game`/`round` props).
- It changes monotonically — never goes backward within a dealer game.
- Every render selector that touches hand/turn/round identity reads from `RenderIdentity.signature`, not from individual raw fields.
- Every boundary effect uses `RenderIdentity.signature` as its dep / guard ref.

## Files to change (Cause A only — Cause B and C are separate follow-ups)

### Shared
- `src/lib/gameStateSync/types.ts` — add `RenderIdentity` type.
- `src/lib/gameStateSync/useGameStateSync.ts` — derive and return `renderIdentity` alongside existing presentation. No change to sync semantics.

### Cribbage (Bugs 2, 3, 4)
- `src/components/CribbageMobileGameTable.tsx`
  - Active-hand selector (around line 753 + the `currentHandKey` / `renderHandKey` site near 800s) reads from `renderIdentity` instead of mixing `currentRoundId` with viewState.
  - Cut-card animation site keys its trigger ref on `${renderIdentity.signature}:cutCard` instead of the `cutCard` prop reference.
  - "Preparing next hand" effect deps switch to `renderIdentity.signature`.
- `src/components/CribbageMobileCardsTab.tsx` — card-list selector reads `renderIdentity.signature` (eliminates `crib-stale-active-hand-blocked` storm).
- `src/lib/cribbageSyncDiagnostics.ts` — no logic change; expectations still hold.

### Gin Rummy (Bug 5)
- `src/components/GinRummyGameTable.tsx`
  - Result/scoring panel currently reads `presentation.handNumber` mixed with prop `handNumber` (lines ~330–365). Switch both to `renderIdentity.handNumber`.
  - Result snapshot cache key includes `renderIdentity.signature` so cached scoring invalidates atomically with render hand.

### Yahtzee (Bugs 6, 9)
- `src/components/YahtzeeGameTable.tsx`
  - Turn/roll display reads `renderIdentity.turnPlayerId` (not raw turn id from round state).
  - Held-die zone selector keys on `(renderIdentity.signature, rollGen)` so a turn flip can't repaint held dice into scatter.
  - Roll counter reads `presentation`-derived roll generation.

## Out of scope for this change

- Holm reveal latches (Bugs 1, 7, 8) — these are Cause B, separate PR.
- Source-level useRef guards on cribbage `preparing-next-hand` and Holm 357 announcement double-fire (Bugs 2, 7) — these are Cause C and ride on top of the new identity from Cause A.
- Any change to scoring math, sync framework, RPCs, or migrations.
- No new instrumentation (per standing constraint).

## Verification

- The three diagnostic invariants `stale-dealer-game-render`, `stale-hand-render`, `result-render-mismatch` should stop firing under normal play. They remain in place — they're now the regression tripwire for Cause A.
- Cribbage `crib-stale-active-hand-blocked` and `crib-replay-detected` should drop sharply (some C-class re-entry will remain until Cause C lands).
- Yahtzee `yahtzee-held-die-rendered-in-scatter` should drop except in true held-mask races (those are Cause B).

## Order of work in this PR

1. Add `RenderIdentity` to types + sync hook.
2. Wire Cribbage `MobileGameTable` + `MobileCardsTab` first (largest blast radius).
3. Wire Gin Rummy result panel.
4. Wire Yahtzee turn/roll/held-die zone selectors.
5. Smoke-test the build; do not run the cross-country test until B and C also land (the user has explicitly asked for forensic consolidation, not partial deploys).
