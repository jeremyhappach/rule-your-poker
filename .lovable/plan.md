
## Platform Stabilization Plan — v3

### Current Mode: LIVE VALIDATION

---

### Phase 1 — Holm P0 (Identity Boundaries & Cache Invalidation)
**Status: LOCKED — stable in production**
**Lock policy: No changes except crash fixes or invariant violations**

- P0-1: Community card cache invalidation at hand boundary
- P0-2: decisionLocked suppression during betting
- P0-3: maxRevealed / card identity cache reset at hand boundary
- P0-4: Card fetch race guard — REMOVED broken roundId guard, replaced with fetchToken-only pattern
- P0-5: Hard clear playerCards + cardStateContext on every roundId change
- P0-6: Render safety guard — never render cards when cardStateContext.roundId !== currentRound.id
- P0-7: Solo capture gated by allDecisionsIn to prevent stale decision leakage
- Instrumentation: card-fetch-start, card-fetch-drop-stale, hand-boundary-reset, solo-capture-attempt

**Production telemetry (post-fix):** card-fetch-round-mismatch ceased; solo-player-stale-relock caught by new guard.

### Phase 2 — Cribbage Stabilization (Same Holm Pattern)
**Status: Implemented — awaiting live validation**

Applied same 3 principles from Holm:

1. **HARD RESET at hand boundary** (CribbageMobileGameTable)
   - `setCribbageState(null)` on roundId change (previously explicitly avoided)
   - Full reset of counting/scoring latches, win sequence state, pegging scores
   - `initialLoadComplete` and `hasInitializedRef` reset to trigger fresh load
   - `persistSyncDebugEvent` instrumentation: `hand-boundary-reset`

2. **FETCH TOKEN** (CribbageMobileGameTable loadOrInitializeState)
   - `cribbageFetchTokenRef` incremented before each load
   - Token checked after every `await` point
   - Prevents stale load results from overwriting fresh state

3. **RENDER GATE** (already present)
   - Mobile cards tab: `viewState && !isTransitioning && renderHandKey === currentHandKey`
   - Mobile felt content: `isGameplayMode && viewState`
   - Desktop: `!cribbageState` returns loading state; `!isTransitioning` gates card display
   - Identity latch: `roundIdLatchRef` drops stale realtime/poll snapshots

**Known Cribbage issues targeted:**
- Discarded cards reappearing → fixed by hard-nulling cribbageState + sync reset
- Score regression → existing INV-6 monitoring; counting baselines reset on boundary
- Tap failures → existing INV-7; isProcessing/counting state now properly cleared

### Phase 2b — Gin Rummy (Identity Latch)
**Status: Implemented — awaiting live validation after Cribbage**

- Gin Rummy roundId identity latch — stale applyState rejection
- Instrumentation: identity_latch_drop debug events

### Phase 3 — Yahtzee P2 (Turn Spotlight & Held-Dice Stability)
**Status: Audited — previously addressed in existing code, not independently validated**

- P2-1: Turn spotlight flash — optimistic applied before scoringInProgress clear
- P2-2: Held-dice identity — localDice is sole source during active turn

### Phase 4 — Horses / SCC (Ad-Hoc Sync Hardening)
**Status: Hardened — NOT migrated to useGameStateSync. DO NOT TOUCH until Cribbage/Gin/Yahtzee validated.**

- Progress-vector gating with monotonic rejection
- Identity latch: roundIdLatchRef with baseline reset on identity change

---

### Validation Order
1. ~~**Holm**~~ — ✅ LOCKED
2. **Cribbage** — NEXT: live validation
3. **Gin Rummy** — after Cribbage
4. **Yahtzee** — after Gin
5. **Horses / SCC** — separate, hardening only

### What Is NOT Claimed
- Cribbage fixes are not yet validated in production
- Presentation-oscillation may have additional vectors beyond identity latch
- Yahtzee fixes are audited, not independently proven
- Horses/SCC are not on the sync framework
