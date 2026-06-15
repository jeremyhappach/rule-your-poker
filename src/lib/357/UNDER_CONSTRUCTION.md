# 3-5-7 — ⚠ Under Construction

**Status:** known debt parked behind Wave 5.

Wave 3C.4b ("ThreeFiveSevenWinController") was scoped to minimal stabilization:
controller owns trigger / dedupe / snapshots / timers / animation mount; MGT
keeps tabling, pot deferral, hand-reset deferral, announcement suppression.

During implementation the boundary turned out to require lifting too much of
MGT's runtime state across a route-level provider to mount the animations
elsewhere. That is exactly the "accidentally build Wave 5 inside 357" failure
mode we agreed to avoid. We stopped.

## Known bug (shipping)

Final-leg win can produce a "Loading…" flash → blank table → zombie state
when `Game.tsx` or `MobileGameTable` remounts mid-sequence. The local state
machine (`showLegEarned` + `threeFiveSevenWinPhase` + the `*CompletedRef`
guards in MGT, plus `threeFiveSevenWinTriggerId` + processed-ref dedupe in
Game.tsx) is wiped by the remount and the sequence is stranded.

## Inventory — where 357 win sequencing lives today

### Game.tsx (~11.5k lines)
- `threeFiveSevenWinTriggerId` state + `threeFiveSevenWinProcessedRef` dedupe
  (around line 1173 / 7956–8003).
- Backend-outcome → trigger detection (≈ 7940–8093). Parses
  `last_round_result`, finds the winner player, snapshots `legPositions` and
  `potAmount`, sets `is357WinAnimationActive`, `threeFiveSevenWinnerId`,
  `threeFiveSevenWinnerCards`, `threeFiveSevenWinTriggerId`.
- Win-state reset gate (≈ 8095–8121) guarded by `is357WinAnimationActiveRef`.
- Trigger prop wiring into MGT at two routing branches (≈ 10224, 10965).

### MobileGameTable.tsx (~7.9k lines) — ~20 `phase ===` read sites
- State machine: `threeFiveSevenWinPhase` (`'idle' | 'waiting' |
  'legs-to-player' | 'pot-to-player' | 'delay'`) + `*Ref`, dedupe refs
  `lastThreeFiveSevenTriggerRef`, `currentAnimationIdRef`,
  `legsToPlayerCompletedRef`, `potToPlayerCompletedRef` (≈ 1169–1177).
- Phase progression timers (≈ 4178–4360): trigger-prop path, LegEarned
  onComplete primary path (≈ 5890–5925), legs-to-player → pot-to-player
  → delay → idle.
- Animation mounts (≈ 5863–5961): `LegEarnedAnimation`,
  `LegsToPlayerAnimation`, `PotToPlayerAnimation`. Animations depend on
  `tableContainerRef`, `players`, `currentPlayer`, `getClockwiseDistance`,
  `legsToWin`, `legValue`, `gameType`, `threeFiveSevenCachedLegPositions`,
  `threeFiveSevenWinnerId`, `threeFiveSevenWinPotAmount`.
- Side-effect couplings: `setThreeFiveSevenPotHiddenUntilReset`,
  `setPotOutAnimationActive`, `setDisplayedPot`, `setWinnerLegsFlashTrigger`,
  `setWinnerPotFlashTrigger`, `setAnteFlashTrigger`.
- Read-only branches that derive UI from `threeFiveSevenWinPhase`:
  - pot computation / `isPotVisuallyEmpty` / `hasPending357WinForPot`
    (≈ 1568–1719).
  - hand-context reset deferral (`shouldDeferHandReset` ≈ 2095–2121).
  - last-round-result announcement suppression (≈ 3358–3514).
  - per-seat tabling suppression / `shouldHideForTabling`
    (≈ 5077, 5114–5246).

## TODO — Wave 5 selectors (do not generalize today)

When `CanonicalPhaseEngine` lands, the following predicates become
generalizable selectors. They are intentionally NOT created now to avoid
burning abstractions into the least-played game prematurely:

- `useShould357DeferPot()` — collapses the
  `hasPending357WinForPot || phase !== 'idle'` checks in MGT pot rendering.
- `useShould357DeferHandReset()` — replaces the inline
  `is357Animating || holm…` check in `shouldDeferHandReset`.
- `useShould357SuppressAnnouncement()` — replaces the inline
  `isLegWin` / `awaitingNextRound` guards in the announcement composer.
- `useIs357SeatTabled(playerId)` — replaces the inline `isInWinAnimation`
  + `threeFiveSevenWinPhase` cross-checks in `renderHolmCanonicalSeat` /
  `render357CanonicalSeat` tabling logic.

When Wave 5 lands, these selectors live in the engine and 357's local state
collapses into engine state. Until then, the in-MGT branches remain authoritative.

## Why the controller wasn't shipped today

The animation mount sites are tightly coupled to MGT's container ref and live
state. A faithful controller would either:

1. Lift `tableContainerRef`, `players`, callbacks (`setAnteFlashTrigger`,
   `setDisplayedPot`, …), and the winner-card render up to App.tsx — i.e.
   half of MGT becomes prop-drilled through the provider; OR
2. Portal the animations from a route-level provider into MGT-owned DOM
   nodes — which still requires MGT to expose those nodes and run live
   subscriptions to controller phase, defeating the survival contract
   (MGT remount still detaches the portal target).

Both paths cross into Wave-5-shaped abstractions. Per explicit user
direction:

> I would rather have one ugly TODO in 357 than accidentally build half of
> Wave 5 in the least-played game and regret the abstractions later.

So we ship the breadcrumb instead. Wave 5 `CanonicalPhaseEngine` is the
correct home for this controller.
