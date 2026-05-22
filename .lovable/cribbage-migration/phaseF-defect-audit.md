# Phase F — defect audit (dealer-selection embed + match-end freeze)

## Defect 1 — dealer-selection "embedded announcements" (NOT a contract violation)

`rg "Drawing for high card|Tie — redrawing for dealer"` → single match in
`src/lib/canonicalShell/announcements/renderers.tsx`. No bespoke parallel
renderer exists in Cribbage. Dealer-selection ambient emit
(`CribbageMobileGameTable.tsx:679`) uses `scope: { dealerGameId: gameId }`
(no `roundId`) and reaches the canonical layer cleanly.

What the user is seeing is the canonical `LifecycleAnnouncement` plate
(`bg-gradient-to-br from-poker-felt to-poker-felt-dark`, gold border)
rendered by `CanonicalAnnouncementLayer` with `position:absolute; inset:0`
*inside the shell's table container* (the layer is mounted inside
`PersistentTableShell`, not at viewport root). It looks embedded because
of layer placement, not because a parallel surface exists.

Conclusion: Phase C announcement-ownership contract holds. Visual
elevation/placement of the canonical layer is a Phase G styling decision.

## Defect 2 — match-end freeze (CRITICAL, root-cause fixed)

### Root cause

Silent emit drop due to scope-narrowing mismatch:

- `PersistentTableShell.tsx:188` mounts the provider with `roundId={null}`.
- `triggerWinSequence` (`CribbageMobileGameTable.tsx:3103-3113`) emits
  `match_win` with `scope: { dealerGameId: gameId, roundId: currentRoundId ?? null }`
  — `currentRoundId` is a real UUID.
- `scopeMatches` (pre-fix) computed
  `wantsRound = eventScope.roundId !== undefined` → `true` (uuid, not undefined),
  then `eventScope.roundId !== current.roundId` (uuid !== null) → returned
  `false`. **emit returned silently. `match_win` never rendered.**

Cascade:
- `setWinSequencePhase('announcement')` ran anyway → all render branches
  that suppress winner/banner content during the announcement window
  (`CribbageMobileGameTable.tsx:1197, 5263-5267`) returned `null` → blank
  felt for ~4500ms with no winner UI → user perceived "freeze."
- Chip animation eventually fired via the 4500ms TTL timer, but the
  observable symptom (no `match_win`, blank table) matched the report.

Same bug silently dropped every round-scoped emit, including
`waiting_for_player` (`CribbageMobileGameTable.tsx:854`).

### Other audit checkpoints

- Terminal state reached: ✅ `cribbageGameLogic.ts:738/778/835` set
  `phase: 'complete'` + `matchCompleteLatch: true`.
- `triggerWinSequence` invocation paths: ✅ both counting completion
  (`:4254-4261`, `:4310-4316`) and pegging-phase win effect
  (`:3120-3130`) fire it. `winSequenceFiredRef` guards multi-fire.
- `matchCompleteLatch` presentation-safe: ✅ top bit of progress vector
  (`cribbageProgress.ts`), default-true semantics when phase === complete.
- Bespoke winner ownership removal left no terminal consumer: ✅ canonical
  `match_win` is the consumer. Bug was the silent drop, not missing wiring.
- Progress vector terminal state: ✅ complete (`[1, h, c, r, 5, sub]`).
- Lifecycle transition bootstrap: ✅ `handleChipAnimationEnd` /
  `ensureBackendGameOverAck` loop calls `onGameComplete`.

### Fix (minimal, root-cause)

`CanonicalAnnouncementProvider.tsx :: scopeMatches`:

Treat provider-side `roundId == null` as a wildcard at the round
dimension. Only enforce roundId equality when BOTH sides specify a
non-null value. dealerGameId enforcement unchanged.

Rationale: shell is mounted as a dealerGame-scoped ownership boundary
(it does not know per-round identity). Per-game emits future-proof
themselves by carrying a finer `roundId`; under the old code this caused
silent drops instead of correctly narrowing only when the provider
itself is round-scoped.

### Verification

- `match_win` now reaches the canonical renderer; winner overlay shows
  for full 4500ms TTL.
- `waiting_for_player` ambient emits now reach the canonical layer.
- Dealer-selection emits (no `roundId`) unchanged — already worked.
- No change to dealerGameId boundary teardown semantics.

