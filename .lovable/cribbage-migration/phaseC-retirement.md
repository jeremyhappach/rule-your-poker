# Phase C Retirement Log

## Files killed
- `src/components/CribbageHighCardSelection.tsx` (Phase C.2, prior turn)
- `src/components/HighCardDealerSelection.tsx` (Phase C.2, this turn)

## Migration shape
All dealer-selection logic now lives in `src/hooks/useHighCardDealerSelection.ts`.

Callsites:
- **Cribbage dealer-game** (`CribbageMobileGameTable`): uses the hook directly via a tiny headless `CribbageDealerSelectionController` shim. Slot identity stable; canonical announcements own messaging.
- **Session-level / Gin Rummy** (`Game.tsx`): three JSX usages preserved via a *local* inline `HighCardDealerSelection` shim defined at the top of `Game.tsx`. Behavior-preserving — identical props/effects/mount semantics, no render output. Out-of-scope for Phase C ("once Cribbage is selected") but kept lossless so the legacy file could be deleted with zero semantic drift.

## Invariants held
- `desiredIdentity` unchanged across draw / reveal / redraw / resolution / transition for the Cribbage path.
- No new render surfaces; the local shim renders `null`.
- Canonical announcements (ambient `dealer_selection_in_progress`, transient `dealer_selected`) remain the sole messaging path inside Cribbage.

## Phase C exit gate
- Geometry snap: none introduced.
- Slot identity churn: none.
- Hidden legacy dealer-selection surfaces: gone.
- Observer parity: presentation-state derivation in `CribbageMobileGameTable` continues to use `effectiveHighCardCards`; flagged for ongoing watch (per user note) but no regression introduced.

## Next
Phase D — passive ambient lifecycle.
