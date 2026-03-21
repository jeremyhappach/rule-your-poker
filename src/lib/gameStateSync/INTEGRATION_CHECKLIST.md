# Sync Framework Integration Checklist

> Every game adopting `useGameStateSync` must pass every item before shipping.
> Derived from Gin Rummy and Yahtzee pilot rollouts (2026-Q1).

---

## 1. Progress Vector Audit

- [ ] **Define dimensions**: List every dimension in the ProgressVector and its source field.
      Example — Gin: `[handNumber, phaseOrdinal, actionCount]`
      Example — Yahtzee: `[phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed]`
- [ ] **Monotonic across turns**: Verify that every legal player action produces a strictly greater vector.
- [ ] **Monotonic across rounds/hands**: Verify that a new hand/round resets lower dimensions but increments a higher dimension (e.g., `handNumber`), so the composite vector is still forward.
- [ ] **Wrap handling**: If any dimension can wrap (e.g., turn index cycling back to 0), add a higher-priority dimension or binary handoff flag to disambiguate.
- [ ] **Skipped/completed players**: If players can be skipped (full scorecard, sitting out), verify the vector still advances on the skip transition.
- [ ] **Reset transitions**: Confirm that terminal→initial transitions (e.g., `complete` → `first_draw`) compare as FORWARD, not regressive.
- [ ] **Write regression test**: At minimum, test:
  - Normal intra-turn progression
  - Turn advance / wrap
  - Hand/round boundary reset
  - Skipped-player edge case (if applicable)

---

## 2. State Ownership Audit

### 2a. Layer definitions

| Layer | Source | Mutated by | Used for |
|-------|--------|-----------|----------|
| **Authoritative** | DB (realtime + poll) | `receiveAuthoritativeUpdate()` | Mutation logic, DB writes, bot decisions |
| **Optimistic** | Local action | `applyOptimistic()` | Bridging latency gap after local write |
| **Presentation / viewState** | Framework-computed | Automatic (auth or optimistic) | ALL UI rendering, ALL action-legality gating |
| **Local-only** | Component state | Direct setState | Active-player owned state (e.g., Yahtzee `localDice`) |

- [ ] **Single legality-state rule**: ALL action-legality checks (can the player act? is it their turn? which phase?) read from `viewState`, never from raw authoritative or stale local state.
- [ ] **No split-brain**: UI text, button enablement, and input handlers all consume the same state source.
- [ ] **Local-only scope**: Document which state is local-only and when ownership transfers back to authoritative (e.g., Yahtzee `localDice` → seed-once per turn, relinquished on turn advance).

### 2b. Immediate write promotion

- [ ] After every successful DB write, the written state is passed to `receiveAuthoritativeUpdate()` so it becomes the new authoritative baseline before any poll/realtime echo arrives.

---

## 3. Boundary Reset Audit

### 3a. What resets on each boundary

| Boundary | Must reset |
|----------|-----------|
| **Turn change** | Active-player local state, processing flags, input locks |
| **Round change** | Round-scoped overlays, animation triggers, per-round caches |
| **Hand change** | `ginSync.reset(null)` / equivalent, all hand-scoped UI state, opponent animation state, selected-card state, grouped/sorted caches |
| **Match/game change** | All of the above + session-scoped ephemeral state |

- [ ] **Sync framework reset**: Call `handle.reset(null)` (or new initial state) when `roundId` or equivalent context ID changes.
- [ ] **Component keying**: Verify components that cache state internally are keyed by `roundId` / `handNumber` so React unmounts stale instances.
- [ ] **No stale carryover**: Confirm no previous-hand cards, upcards, overlays, or animation flags survive into the new hand.
- [ ] **useEffect cleanup**: All boundary resets use `useLayoutEffect` keyed to the context ID, not timers.

---

## 4. Mutation-Path Audit

- [ ] **Validation source**: Action handlers validate legality against `viewState` (presentation layer).
- [ ] **Computation source**: Actual state mutation functions (computing next state for DB write) operate on the latest authoritative state to ensure functional correctness.
- [ ] **Bot/human symmetry**: Bot decision logic follows the same mutation path as human actions — same validation, same DB write, same `receiveAuthoritativeUpdate()` promotion.
- [ ] **No double-writes**: Each user action produces exactly one DB write. No "write scored state then separately write advance state" unless intentionally split (e.g., Yahtzee 2s scoring highlight) with clear documentation.
- [ ] **Atomic transitions**: Multi-step transitions (e.g., gin → scoring → complete → next hand) are chained deterministically. Each step writes to DB and promotes locally before triggering the next.

---

## 5. Observer / Animation Audit

- [ ] **Frozen presentation**: If opponent actions need animation time (e.g., card draw fly-in), use `freezePresentation()` with a bounded duration. Document the freeze window.
- [ ] **Active-player local ownership**: The acting player's transient state (dice, card selection) is owned locally and never overwritten by incoming authoritative snapshots until the turn officially advances.
- [ ] **Stale cache carryover**: After freeze expires, verify the presentation layer reflects the current authoritative state, not a cached pre-freeze snapshot.
- [ ] **Observer dice/cards**: Observers render from `viewState` via accessor functions (e.g., `getCurrentTurnDice`). They do NOT maintain independent local state for the active player's transient data.
- [ ] **Cached opponent state**: If caching opponent state for highlight/reveal purposes (e.g., `cachedOpponentDice`), clear the cache on turn/hand boundaries.

---

## 6. Debug / Instrumentation Requirements

### 6a. Toggle

- [ ] In-game `DebugLogToggle` component is present and functional.
- [ ] Toggle sets `localStorage.ptp_debug_events = "1"` and calls `refreshDebugEventFlag()`.
- [ ] Works mid-hand without page refresh or sync state reset.

### 6b. Minimum events to log

For every game adopting the framework, instrument at minimum:

| Event type pattern | When | Payload must include |
|--------------------|------|---------------------|
| `{game}:input:{action}` | Player clicks action button | phase, turnPhase/equivalent, actionCount, hand sizes |
| `{game}:optimistic_applied` | After `applyOptimistic()` | Full state summary |
| `{game}:db_write_start` | Before DB persist | traceId |
| `{game}:db_write_success` | After successful DB write | actionCount, phase |
| `{game}:db_write_failure` | On DB write error | error message |
| `{game}:snapshot_received:{source}` | Realtime or poll snapshot arrives | source (realtime/poll), phase, actionCount |
| `{game}:snapshot_accepted` | `receiveAuthoritativeUpdate()` returns forward/equal | prevVector, incomingVector, comparison |
| `{game}:snapshot_rejected` | `receiveAuthoritativeUpdate()` returns regressive | prevVector, incomingVector, comparison, reason |

### 6c. Trace grouping

- [ ] Every local action chain generates a `traceId` (via `newTraceId()`) that is attached to all events from input through DB write through snapshot acceptance.

### 6d. Querying

```sql
-- All events for a game, ordered
SELECT created_at, event_type, client_role, payload
FROM debug_events
WHERE game_id = '<game-uuid>'
ORDER BY created_at ASC;

-- Events for a specific trace
SELECT created_at, event_type, payload
FROM debug_events
WHERE game_id = '<game-uuid>'
  AND payload->>'_traceId' = '<trace-id>'
ORDER BY created_at ASC;

-- All rejected snapshots
SELECT created_at, event_type, payload
FROM debug_events
WHERE game_id = '<game-uuid>'
  AND event_type LIKE '%snapshot_rejected%'
ORDER BY created_at ASC;
```

---

## 7. Pre-Ship Smoke Tests

- [ ] **2-player full match**: Play to completion with no freezes or stale UI.
- [ ] **Hand boundary**: Verify next-hand deal renders correctly on both clients within 1s.
- [ ] **Mid-hand refresh**: One client refreshes mid-turn; verify it recovers to correct state.
- [ ] **Bot match**: Full bot-vs-human match completes without stuck states.
- [ ] **Debug trace**: Enable debug logging, play 3+ hands, query `debug_events` and verify all expected event types appear with correct payloads.

---

## 8. Recommended Next Game: Cribbage

**Why Cribbage is the safest next adoption:**

1. **Already has `hand_number` tracking** — follows the same DB-First hand/round pattern as Gin Rummy, so the progress vector design is directly transferable.
2. **Turn-based with clear phases** — dealing → crib discard → play → counting → scoring maps cleanly to a phase-ordinal dimension.
3. **Two-player primary** — same client topology as Gin Rummy, minimizing new edge cases.
4. **Existing event logging** — `cribbage_events` table already captures structured game events, reducing instrumentation effort.
5. **No transient local state complexity** — unlike Yahtzee dice (local ownership, scatter positions), Cribbage cards are dealt and static, reducing the observer/animation audit surface.

**Cribbage-specific vector recommendation:**
```
[handNumber, phaseOrdinal, actionCount]
```
Where phases: `dealing(0) → crib_discard(1) → cut(2) → pegging(3) → counting(4) → scoring(5) → complete(6)`

---

*Last updated: 2026-03-21*
*Derived from: Gin Rummy hard-lock diagnosis, Yahtzee turn-handoff diagnosis, framework-level progress vector fix*
