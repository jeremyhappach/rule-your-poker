# Chucky / Crib competitive release candidate — November 7, 2026

Status: all automated release gates passed. Migration 20261107184515 is installed with both admission gates closed. Recovery worker v4 is deployed and its authenticated HTTP smoke returned 200 with zero failures. Activation follows verification of the published client commit.

Worktree: C:/Users/jerem/.codex/worktrees/chucky-crib-competitive-release/rule-your-poker
Branch: codex/chucky-crib-competitive-release
Base: c80837f6e (main). The user's dirty Golf worktree was preserved.

## Implemented candidate

- AsyncInvite removes only the success toast; existing navigation, durable retry identity and error rendering remain.
- Chucky removes standard/6/7 result tones and the extra crack explosion. Glass and ascending/descending score audio remain. A committed busted round uses the existing Run21 failure cue, keyed by the unique board round ID so different live players cannot suppress each other's cue.
- Both catalog descriptors support Other / Multiplayer with 2–7 humans. Async eligibility comes from deployed capabilities. Defaults and invitation admission remain server gated.
- Competitive adapters call the installed Crib Lab /2 and Chucky /3 rules. No scoring or dealing formulas were copied into mode clients.
- Live sequencing follows the Mega competitive settlement/session pattern: frozen consent, canonical chips/ledger/result/snapshots, typed authenticated intents, pause clocks, revision subscriptions, terminal hold and postgame continuation. Async reuses existing invitation, turn, review, settlement and recovery owners.
- SQL candidate lives under supabase/originals-competition. prepare-live.mjs uses exact inspected deployed owners. The current cancellation and playable-deadline changes are retained.

## Passed evidence

- 93 focused tests across invitation success/failure/retry, audio hook, current game rules/presentation, Async adapters, catalog and review presentation.
- Application TypeScript check and Vite development-mode build passed. Existing chunk-size/Browserslist notices remain.
- Real browser + actual Arcade service/SQL: normal, six-card and seven-card wins retain counts without extra tones; three cracks retain glass and descending counts without extra explosion; positive bank count; one busted-round cue; silent reload; completed run / leaderboard. See dev/originals-competition/evidence/sounds.json.
- Rollback financial matrices for both games, fake and real money: winners/ties, actual chips and balanced transfers, injected failure after chip writes, one result/snapshot, duplicate/late replay, outsider/stake rejection, terminal/continuation.
- Actual Async service + PostgreSQL for both games × both money modes: invite, accept, six started rounds, five handoffs, unattended core-rule completion, settled result and late replay. Synthetic clock advancement leaves cards/scores authoritative.
- Independent-connection live action/final-state races and Async start races passed for both games × both money modes.
- Candidate installation + financial/lifecycle/gameplay proof also passed in a single rollback on the deployed database. The final query confirmed private.originals_release was absent after rollback. No production data/schema persisted.

## Final release qualification

- Full Game.tsx browser fixture uses two authenticated clients, PostgreSQL session/rules/financial owners, and table/revision/transfer events. Both games pass Other selection, consent/start, legal actions, six earned rounds, settlement, terminal hold, canonical Session Ended without gameplay artifacts, and fresh ended-session reload to Lobby.
- Crib Lab's nonzero winner transfer reaches the canonical chip presentation cursor. Ties, real/fake-money matrices, replay/concurrency, continuation and zero-client recovery are covered by the financial/service/race proofs.
- Final combined Async browser smoke passed for both games and both players. The test covers failed-send feedback, successful retry without a success toast, selection, acceptance, legal actions, six rounds/five handoffs and both players' game result/finale review.
- Packaged installation is idempotent; candidate and installed rollback proofs pass on the hosted database. The proof leaves admission closed and no synthetic sessions persist.
- Application TypeScript, 44 focused tests after the final client corrections, and a production Vite build pass (in addition to the checkpoint's 93 tests). Existing build size/Browserslist notices remain.
- Publication sequence: release tag originals-competitive-2026-11-07, fast-forward main, Vercel READY verification, then enable the already-proven mode gates. Physical production-device smoke remains Jeremy's acceptance step.

The resumed pass corrected the shell registry and durable chip cursor participation for both games, preserved the competitive fold receipt, and stopped labeling an observing Crib Lab player as disconnected. Fixture fixes preserve actual request boundaries: match Realtime event kinds, flush deferred transfer journals after each RPC, serialize PostgreSQL integer-array arguments correctly, and maintain the simulated recovery heartbeat. No product timers or financial bypasses were introduced.

Reproduction commands (installed dependencies only):

- node dev/originals-competition/qualify.mjs
- node dev/originals-competition/service-proof.mjs
- node dev/originals-competition/races.mjs
- node dev/originals-competition/browser.mjs
- node dev/originals-competition/browser.mjs --full
- node dev/chucky-showdown/browser.mjs chucky_showdown_v3_1794054002 --release-sounds

qualification.local/originals/context.json identifies the disposable local database. setup.mjs creates a new clone from the existing Chucky v3 template, installs the already-deployed Crib v2 baseline and current captured owners. Browser/proof mutations roll back; independent-connection fixtures use a separate local clone that is dropped.
