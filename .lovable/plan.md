# Yahtzee Framework Cutover

Yahtzee already integrates `useGameStateSync`, but unlike Gin Rummy and Horses/SCC it has not been through the full no-blind-spot cutover. This plan brings it to parity.

## Scope

`src/components/YahtzeeGameTable.tsx` (~2.2k lines), `src/lib/gameStateSync/yahtzeeProgress.ts`, `yahtzeeProgress.test.ts`, `src/lib/yahtzeeRoundLogic.ts`, `src/lib/yahtzeeSyncDiagnostics.ts`, `src/components/YahtzeeOverlays.tsx`, plus any bot-controller / watchdog paths the audit surfaces.

## Phase 1 — Render & Side-Effect Audit (read-only)

Goal: identify every remaining raw-authoritative read driving render or side-effects.

1. Grep `authoritativeYahtzeeState`, `yahtzeeState` (raw prop), `game.*` reads inside `YahtzeeGameTable`, `YahtzeeOverlays`, and any score / dice subcomponents.
2. Classify each call site:
   - render → MUST move to `viewState` / `presentationState`
   - bot driver / authoritative progression write → keep on `authoritativeState` (correct per framework)
   - watchdog / recovery → keep on `authoritativeState` but document
3. Produce a short report inline in the chat before patching.

## Phase 2 — Progress Vector Validation

Current vector: `[phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed]`.

1. Stamp every incoming authoritative snapshot with `__syncRoundId` / `currentRound` so cross-round transitions cannot be canceled by closure-captured "latest" values (same defect class as the Horses handNumber bug). Add `__syncRound` to `YahtzeeStateForProgress`.
2. Re-run `yahtzeeProgress.test.ts`; add coverage for:
   - cross-round identity advance (round N final score → round N+1 first roll)
   - rapid hold-toggle within a single roll
   - all-but-one player complete → final player roll
3. Verify `useGameStateSync` identity reset reseeds from `initialState` (Horses fix already landed in framework — confirm Yahtzee benefits).

## Phase 3 — Optimistic Flow Hardening

For each action verify: optimistic write → presentation render → DB confirm → no flip-back.

- `roll` — confirm optimistic snapshot carries fresh `rollKey` and is dominated forward by DB confirm.
- `hold/unhold` — verify `holdSeq` (or equivalent) is on the progress vector; if absent, add a lower-significance dim or rely on stamped roll identity.
- `score` — re-verify the "turn flip-back flash" scenario (the historic bug). Confirm `handoffPhase` dimension still blocks the regressive snapshot.
- `bot turn` — confirm bot driver derives EXCLUSIVELY from authoritative state (already done at line 949).
- `endgame` — confirm phase=complete snapshot is monotonically dominant.

## Phase 4 — Recovery / Watchdog

Apply Horses P0 #2 lessons:

1. Audit any `stuck-*` watchdog or terminal recovery effect for `canInteractNow()` gating on authoritative progression writes — remove those gates (only user-interaction writes should be gated).
2. Confirm null-turn deadlock cannot strand the game; if a resolver exists, ungate it and add fresh DB re-verification before write.
3. Add `stuck-null-turn` invariant if not already firing (already present in `yahtzeeSyncDiagnostics.ts` — verify wiring).

## Phase 5 — Diagnostics

Add `yahtzee-framework-` event emissions matching the Horses/Gin Rummy cutover for forensic timelines:
- `yahtzee-auth-turn-handoff-received` (accepted/rejected + reason + stampedRound)
- `yahtzee-framework-identity-advanced` / `-identity-reset-fired`
- `yahtzee-round-create-attempt` with caller-id (if applicable)

## Phase 6 — Test Matrix (no automation — manual repro by user)

I will not be able to run multiplayer / cross-country / reconnect tests myself. After the patches land I will:
1. Run `yahtzeeProgress.test.ts` + any new unit tests
2. Run typecheck/build via the harness
3. List the exact manual scenarios for the user to repro, with the new diagnostic event names to grep for in `debug_sync_events`

## Files Likely Changed

- `src/lib/gameStateSync/yahtzeeProgress.ts` — add `__syncRound` stamp support
- `src/lib/gameStateSync/yahtzeeProgress.test.ts` — new cross-round / hold-toggle / final-player cases
- `src/components/YahtzeeGameTable.tsx` — stamp incoming snapshots; replace any raw-auth render reads; ungate any terminal recovery; add diagnostic emissions
- `src/lib/yahtzeeSyncDiagnostics.ts` — new event helpers
- Memory: append a `mem://architecture/yahtzee/framework-cutover` entry summarizing the cutover (mirrors `gin-rummy/framework-cutover` and `horses-scc/framework-cutover`).

## Out of Scope

- 3-5-7 cutover (explicitly deferred to next round)
- Any gameplay-rule changes
- Desktop path (already deprecated per Core memory)

## Risk

Largest risk is touching `YahtzeeGameTable.tsx` (2.2k lines) where the optimistic/presentation wiring is dense and the historic flip-back bugs were subtle. Phase 1 audit-first keeps the blast radius low.

## Approval

Approve to proceed, or tell me to narrow/expand any phase.
