# Chucky / Crib competitive release candidate — November 7, 2026

Status: UNRELEASED. Both admission gates remain closed. No migration, Edge Function deployment, main integration, push or production activation was performed. Existing approval covers continuation; this is a qualification checkpoint, not a new approval gate.

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

## Release blockers / next bounded pass

1. Finish browser qualification. The combined Async run exercised Crib Lab through six actual rounds and then stopped in Chucky waiting for a transient fold frame, while its durable fold count advanced. The fixture now waits for the durable remaining-fold control; rerun the complete matrix and capture evidence. Failed invitation feedback/retry and selection/acceptance were exercised en route, but the complete browser matrix is not yet green.
2. Latest live fixture stopped before rendering with useAnnouncements outside CanonicalAnnouncementProvider. Mount the actual PersistentTableShell/financial owners rather than bypassing the guard. Finish live table and full Game-route smoke for both games: nonzero chip transport, terminal hold, Session Ended, fresh ended-session reconnect, and continuation/runback. The standalone live fixture is not full-shell evidence. It was corrected to select Other by its visible label and to request session end after setup/consent rather than before configuration.
3. Package/register an idempotent migration, deploy the recovery worker and verify installed/worker behavior before activating gates. No schema application is authorized without the remaining required proof passing. The candidate financial rollback has already passed; do not rediscover its owners unless hashes differ.
4. One final build/check after any corrections, internal diff review, complete the existing approved Git/main push workflow and verify Vercel. Jeremy's production smoke remains acceptance truth.

Reproduction commands (installed dependencies only):

- node dev/originals-competition/qualify.mjs
- node dev/originals-competition/service-proof.mjs
- node dev/originals-competition/races.mjs
- node dev/originals-competition/browser.mjs
- node dev/originals-competition/browser.mjs --live
- node dev/chucky-showdown/browser.mjs chucky_showdown_v3_1794054002 --release-sounds

qualification.local/originals/context.json identifies the disposable local database. setup.mjs creates a new clone from the existing Chucky v3 template, installs the already-deployed Crib v2 baseline and current captured owners. Browser/proof mutations roll back; independent-connection fixtures use a separate local clone that is dropped.

Stopped under AGENTS.md tool-call circuit breaker. The reference Mega financial pattern was sufficient for the proven database portion; adapting the two game presentations requires the actual canonical shell fixture and remaining multi-client browser qualification. Resume that bounded phase under the existing approval, without another architecture audit.
