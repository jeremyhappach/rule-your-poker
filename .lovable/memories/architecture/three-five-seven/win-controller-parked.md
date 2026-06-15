---
name: 3-5-7 Win Controller parked behind Wave 5
description: 3C.4b stopped — controller intentionally not built; full inventory + selector list lives in src/lib/357/UNDER_CONSTRUCTION.md; do not retry without Wave 5
type: constraint
---

3C.4b (ThreeFiveSevenWinController, route-level survival of LEG_EARNED → LEGS_TO_PLAYER → POT_TO_PLAYER → DELAY → IDLE through MGT/Game remount) was investigated and intentionally stopped. The controller mount sites in MobileGameTable depend on `tableContainerRef`, live `players`, `currentPlayer`, `getClockwiseDistance`, and side-effect setters (`setAnteFlashTrigger`, `setDisplayedPot`, `setPotOutAnimationActive`, `setWinnerLegsFlashTrigger`, `setWinnerPotFlashTrigger`, `setThreeFiveSevenPotHiddenUntilReset`). Lifting that across a route-level provider is "accidentally building Wave 5 inside the least-played game".

**Constraint:** do NOT attempt to build `src/lib/357/ThreeFiveSevenWinController.tsx` (or any equivalent route-level 357 win owner, or 357-specific selectors `useShould357DeferPot` / `useShould357DeferHandReset` / `useShould357SuppressAnnouncement` / `useIs357SeatTabled`) without reading `src/lib/357/UNDER_CONSTRUCTION.md` first and confirming Wave 5 `CanonicalPhaseEngine` is the home. Phase ownership stays game-local in MGT until then.

**Known shipping debt:** final-leg 357 win can produce a "Loading…" flash → zombie table when `Game.tsx` or `MobileGameTable` remounts mid-sequence. Documented, accepted, parked.

**Breadcrumbs in code:** TODO WAVE 5 comments at the `threeFiveSevenWinPhase` definition in `MobileGameTable.tsx` and the `threeFiveSevenWinTriggerId` definition in `pages/Game.tsx` point to the doc.
