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

| Dim | Status | Action |
|---|---|---|
| `dealerGameId` | Implicit (scope reset) | Verify framework reset() fires on dealerGameId flip, not just roundId |
| `handNumber` | ✅ present (dim 1) | — |
| `roundNumber` | ❌ missing | Add to scope key (Triple-Key Scoping memory rule) |
| `dealerSelectionCohort` | ❌ missing | Add dim — must increment on each tie redraw |
| `dealerResolved` | ❌ missing (no `dealer-select` phase) | Add to phase enum + latch dim |
| `phase` | ⚠️ partial | Phase enum lacks `dealer-select` and split count phases (`count-non-dealer`, `count-dealer`, `count-crib`) |
| `peggingTurnOwner` | ❌ missing | Add content tiebreaker |
| `peggingTurnSeq` | ⚠️ partial | `playedCards` count proxies this but doesn't reset per segment |
| `peggingSegmentSeq` | ❌ missing | Required tiebreaker per memory `progress-vector-tiebreakers` |
| `countOwner` | ❌ missing | Required tiebreaker per memory |
| `cribCountOwner` | ❌ missing | Resolved separately for clarity |
| `handCompleteLatch` | ⚠️ partial (`complete` phase) | Make explicit boolean dim |
| `matchCompleteLatch` | ❌ missing | Required for match-end vs hand-end disambiguation |

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
