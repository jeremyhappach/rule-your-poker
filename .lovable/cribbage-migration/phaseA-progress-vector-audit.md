# Phase A — Cribbage Progress Vector Audit

Source: `src/lib/gameStateSync/cribbageProgress.ts`
Plan reference: §4a (Cribbage progress-vector audit, mandatory)

## Status: Phase C prerequisites LANDED

Per the locked-in rule "identity/progress dimensions must land BEFORE the
corresponding lifecycle surface migrates", the Phase C-prereq subset has
been delivered ahead of the dealer-selection canonical surface migration.

## Current vector (5-dim, post Phase C-prereq)

```text
[handNumber, dealerSelectionCohort, dealerResolved, phaseOrdinal, subPhase]
```

Where:
- `dealerSelectionCohort`: monotonic per-tie-redraw counter (defaults 0)
- `dealerResolved`: latch — 0 only when `phase === 'dealer-select'` and
  `dealerResolved === false`; legacy snapshots default to 1
- `phaseOrdinal`: dealer-select=-1, dealing=0, discarding=1, cutting=2,
  pegging=3, counting=4, complete=5
- `subPhase = playedCards*1000 + totalDiscarded*100 + cribSize*10 + totalScore`

## Required vector per plan §4a (13 dims)

| Dim | Status | Notes |
|---|---|---|
| `dealerGameId` | Implicit (scope reset) | Verify framework reset() fires on dealerGameId flip — owned by Phase F validation |
| `handNumber` | ✅ present (dim 1) | — |
| `roundNumber` | ⚠️ scope-keyed | Triple-Key Scoping enforced at scope-key level, not as a vector dim |
| `dealerSelectionCohort` | ✅ **LANDED** (dim 2) | Phase C prereq — increments on each tie redraw |
| `dealerResolved` | ✅ **LANDED** (dim 3) | Phase C prereq — latch, paired with `dealer-select` phase |
| `phase` | ✅ extended | `'dealer-select'` added; split count phases deferred to counting migration |
| `peggingTurnOwner` | ⏳ pegging-prereq | MUST land before pegging surface migration |
| `peggingTurnSeq` | ⏳ pegging-prereq | MUST land before pegging surface migration |
| `peggingSegmentSeq` | ⏳ pegging-prereq | MUST land before pegging surface migration |
| `countOwner` | ⏳ counting-prereq | MUST land before counting surface migration |
| `cribCountOwner` | ⏳ counting-prereq | MUST land before counting surface migration |
| `handCompleteLatch` | ⏳ counting-prereq | MUST land before counting surface migration |
| `matchCompleteLatch` | ⏳ match-end-prereq | MUST land before match-end surface migration |

## Gap summary

**Critical (block Phase C):**
- `dealerSelectionCohort` — required for tie-redraw identity scoping
- `phase` enum extension for `dealer-select` and split count sub-phases
- `peggingSegmentSeq` + `countOwner` content tiebreakers

**Required for replay (block Phase F):**
- `matchCompleteLatch` — distinguishes match end from hand end for replay teardown

**Nice to have:**
- Explicit `peggingTurnOwner`, `cribCountOwner` dims (currently derivable from state)

## Remediation tasks (queue for Phase C/F)

1. Extend `CribbagePhase` type: add `'dealer-select'`, split `'counting'` into `'count-non-dealer' | 'count-dealer' | 'count-crib'`.
2. Extend `cribbageProgress.ts` vector to include cohort, segment seq, count owner, match-complete latch.
3. Update `cribbageGameLogic.ts` / `cribbageRoundLogic.ts` to populate new phase values and segment counters.
4. Update sync framework reset to include `dealerGameId` boundary.

## Sync raw-read audit checklist (deliverable for Phase A.2)

Files reviewed for `gameStates.find(...)`, `useGameStateSync` raw reads bypassing presentation:

- `src/components/CribbageMobileGameTable.tsx` — TBD when Phase C lands
- `src/components/CribbageFeltContent.tsx` — TBD
- `src/components/CribbageCountingPhase.tsx` — TBD
- `src/components/CribbageCutCardReveal.tsx` — TBD
- `src/components/CribbageTurnSpotlight.tsx` — TBD

Full scan deferred to per-surface migration phases (deliberate per plan: "remediation lands during Phase C–F as each surface migrates").
