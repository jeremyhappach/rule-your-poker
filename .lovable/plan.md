# Holm Framework Cutover

Holm already integrates `useGameStateSync` (`holmSync` in `Game.tsx`), but has not been through the full no-blind-spot cutover applied to Yahtzee / Horses / Gin Rummy. Holm rendering lives in `MobileGameTable.tsx` (6.9k lines) and orchestration in `Game.tsx` (8.9k lines), making this the highest-risk cutover so far. Phased, audit-first approach.

## Phase 1 — Render & Side-Effect Audit (read-only)

Goal: enumerate every Holm render path or side-effect that still reads raw authoritative state instead of `holmSync.presentationState`.

1. Grep in `MobileGameTable.tsx` and `Game.tsx`:
   - Direct `game.*` reads tagged `holm-game` for community cards, chucky reveal, pot, current turn, decision deadlines, decisions, autoFold flags.
   - Raw `players` reads driving Holm seat render (vs. presentation-derived player snapshots).
   - Effects keyed on `game?.*` instead of `holmView?.*`.
2. Classify each call site as:
   - **render** → must move to `holmView` / `holmSync.presentationState`
   - **mutation / write** → stays on raw authoritative (correct per framework)
   - **bot / watchdog / recovery** → stays on authoritative, document
3. Audit the showdown / payout sequence specifically:
   - `holmShowdownPhase`, `holmShowdownWinnerId`, `holmWinPotTriggerId` — confirm trigger IDs derive from presentation, not raw.
   - Winner-hand visibility during chip animation — already-fixed bug; confirm it now reads presentation.
   - `communityCardsCacheRef` / `showdownCardsCacheRef` lifted caches — verify they are gated on presentation identity, not raw round number.
4. Output a short inline report before any patching.

## Phase 2 — Progress Vector Hardening

Current: `[handNumber, phaseOrdinal, decidedCount, communityCardsRevealed]`.

1. Add `__syncHandNumber` stamp support to `HolmAuthoritativeSnapshot` (mirrors the Horses defect-class fix) so cross-hand transitions can never be canceled by a closure-captured "latest" value. `buildHolmSnapshot` stamps it from the authoritative round row.
2. Confirm `phaseOrdinal` correctly represents:
   - betting (active decisions outstanding)
   - processing (all-decisions-in, before reveal)
   - showdown (community reveal in progress)
   - completed (payout done)
3. Verify a `betting` snapshot for hand N+1 strictly dominates a `completed`/`showdown` snapshot of hand N (most-significant `handNumber` dim must already cover this — add a test).
4. Add tests for:
   - cross-hand identity advance (completed N → betting N+1)
   - regressive "stale all_decisions_in" rejection (an old snapshot saying everyone is in must not regress a fresh betting snapshot)
   - showdown reveal monotonicity (revealed: 1 → 2 → 3 → 4)
   - tie/split-pot terminal completion

## Phase 3 — Identity Reset & Boundary Discipline

1. Replace the in-`Game.tsx` manual `holmSync.reset(snapshot)` on roundId change with the framework's auto-identity-advance path so the reset uses `initialStateRef` (clean baseline) instead of the new snapshot. This is the same defect class as the Horses P0 #2 fix — a stale terminal snapshot must not be allowed to act as the new authoritative baseline.
2. Wire `identity` prop in `useGameStateSync` for Holm using `dealerGameId + roundId + handNumber` so identity advance fires automatically.
3. Keep the lifted-cache clearing logic (`communityCardsCacheRef`, `showdownCardsCacheRef`, `maxRevealedRef`, `cardIdentityRef`) on identity boundary — but key it off `holmSync` identity events, not the manual ref compare.

## Phase 4 — Optimistic Flow Hardening

For each action verify optimistic write → presentation render → DB confirm → no flip-back:
- **stay / fold** — confirm optimistic snapshot carries `decisionLocked: true` and is dominated forward by DB confirm.
- **rapid action changes** — verify pre-decision UI states (`holmPreFold`, `holmPreStay`) cannot leak past the framework's progress gate.
- **simultaneous client updates** — confirm `decidedCount` monotonicity holds across multi-client locking races.
- **showdown reveal cadence** — confirm `communityCardsRevealed` reveal progression is purely presentation-driven and animation timing never freezes outbound writes.
- **terminal payout** — confirm `phase=completed` snapshot is monotonically dominant and chip-animation overlays (`HolmWinPotAnimation`, `PotToPlayerAnimation`) read presentation only.

## Phase 5 — Recovery / Watchdog Audit

Apply Horses P0 #2 lessons:
1. Any `stuck-*` Holm watchdog or terminal recovery effect that gates authoritative progression writes behind `canInteractNow()` / presentation freezes must be ungated — only user-interaction writes get gated.
2. Confirm null `currentTurnPosition` after final-decision cannot strand the round; recovery resolver (if any) must re-verify DB and write without UI-interaction guard.
3. Confirm showdown reveal can complete even when presentation freezes for animations (forceCompleteShowdown should work).
4. Confirm next-hand creation cannot be blocked by lingering presentation state of the prior hand.

## Phase 6 — Diagnostics

Add events to `holmSyncDiagnostics.ts` mirroring the Horses/Yahtzee/Gin Rummy cutover:
- `holm-auth-turn-handoff-received` (accepted/rejected + reason + comparison + stampedHand)
- `holm-framework-identity-advanced` / `-identity-reset-fired`
- `holm-round-create-attempt` with caller-id
- `holm-stuck-all-decisions-in` watchdog firing

## Phase 7 — Test Matrix (manual repro by user)

After patches land I will:
1. Run `holmProgress.test.ts` and any new unit tests.
2. Run harness typecheck/build.
3. List manual scenarios for user:
   - human vs human normal hand
   - all-fold path
   - showdown payout path
   - tie / split pot
   - reconnect / stale snapshot recovery (open second tab mid-hand)
   - rematch / next-hand transition
   - cross-country lag simulation
   - `debug_sync_events` greps to validate

## Files Likely Changed

- `src/lib/gameStateSync/holmProgress.ts` — add `__syncHandNumber` stamp field
- `src/lib/gameStateSync/holmProgress.test.ts` — new cross-hand / stale-decisions / showdown reveal cases
- `src/pages/Game.tsx` — wire `identity` prop, remove manual reset, move identity-boundary cache clear onto framework callback
- `src/components/MobileGameTable.tsx` — replace any remaining raw-auth Holm render reads with `holmView`
- `src/lib/holmSyncDiagnostics.ts` — new event helpers
- `mem://architecture/holm/framework-cutover` — new memory summarising the cutover

## Out of Scope

- Chat indicator bug (separate backlog)
- timeout → auto-fold failure (separate backlog) — UNLESS the watchdog audit in Phase 5 surfaces it as a framework-gated path, in which case I will call it out for explicit approval.
- 3-5-7 cutover (next target after Holm)
- Desktop path (deprecated)
- Gameplay-rule changes

## Risk

Highest-risk cutover to date: Holm has betting progression, showdown reveal sequencing, payout animation gating, and lifted card-identity caches living outside the framework. Phase 1 audit-first keeps blast radius small; identity-reset change (Phase 3) is the highest-leverage fix because it directly mirrors the proven Horses P0 #2 defect class.

## Approval

Approve to proceed, or tell me to narrow/expand any phase.
