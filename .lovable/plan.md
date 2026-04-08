
## Platform Stabilization Plan — v2

### Current Mode: LIVE VALIDATION

---

### Phase 1 — Holm P0 (Identity Boundaries & Cache Invalidation)
**Status: Implemented — awaiting live validation**

- P0-1: Community card cache invalidation at hand boundary
- P0-2: decisionLocked suppression during betting
- P0-3: maxRevealed / card identity cache reset at hand boundary
- P0-4: Card fetch race guard — post-fetch roundId verification before commit
- Instrumentation: HOLM_RENDERED_COMMUNITY, card fetch roundId match invariant

### Phase 2 — Cribbage / Gin Rummy P1 (Identity Latch)
**Status: Implemented — awaiting live validation**
**Note: Not yet proven to solve the full presentation-oscillation issue. Identity latch drops stale snapshots at hand boundaries but oscillation root cause may have additional vectors.**

- P1-1: Cribbage roundId identity latch — stale realtime/poll rejection
- P1-2: Cribbage tap failure guard — verified existing instrumentation uses viewState
- P1-3: Gin Rummy roundId identity latch — stale applyState rejection
- Instrumentation: identity_latch_drop debug events

### Phase 3 — Yahtzee P2 (Turn Spotlight & Held-Dice Stability)
**Status: Audited — previously addressed in existing code, not independently validated**
**Note: Code audit confirmed optimistic-before-clear ordering (P2-1) and localDice/stableCacheKey pattern (P2-2) are structurally sound. No new code changes were made. Requires live validation to confirm.**

- P2-1: Turn spotlight flash — optimistic applied before scoringInProgress clear
- P2-2: Held-dice identity — localDice is sole source during active turn
- Architecture note: Yahtzee does not call yahtzeeSync.reset(), so vector-reset vulnerability does not apply

### Phase 4 — Horses / SCC (Ad-Hoc Sync Hardening)
**Status: Hardened — NOT migrated to useGameStateSync**
**Note: Due to complexity of useHorsesMobileController (2752 lines), Phase 4 was executed as a hardening pass on the existing ad-hoc sync pattern, not a full framework migration. Progress-vector gating and identity latch were added inline. Full migration remains a future option if hardening proves insufficient.**

- PLATFORM-1/2: Progress-vector gating with monotonic rejection
- Identity latch: roundIdLatchRef with baseline reset on identity change
- Instrumentation: HORSES/SCC_SYNC rejection logging
- Both Horses and SCC share the same controller (isSCC flag)

---

### Validation Order
1. **Holm** — first priority
2. **Cribbage / Gin Rummy** — second
3. **Yahtzee** — third
4. **Horses / SCC** — separate, with understanding that Phase 4 was hardening, not migration

### What Is NOT Claimed
- Presentation-oscillation is not proven resolved (Phase 2 addresses one vector)
- Yahtzee fixes are audited, not independently proven (Phase 3)
- Horses/SCC are not on the sync framework (Phase 4)
- No freeze windows are active in any game
