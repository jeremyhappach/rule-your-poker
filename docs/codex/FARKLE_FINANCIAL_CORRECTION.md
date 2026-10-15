# Farkle containment and correction — October 15, 2026

**Released: all mandatory gates pass, migration 20261015212154 is installed, Vercel is READY with the exact published SHA, and production Farkle admission is open.** The final regression run passes 2,360 tests across 313 files, with zero failures. The 100 financial/recovery assertions, 72 focused tests, typecheck, build and retained two-browser lifecycle evidence all pass.

Jeremy explicitly approved containment, scoped authorization and deadlock corrections, qualification, and conditional migration/deployment. He subsequently approved installing missing local test tooling. No further implementation or publication approval is needed within that scope; the release prerequisites still apply.

## Production containment

At 19:00 UTC, the only production mutation was `UPDATE private.farkle_release SET creation_enabled=false WHERE singleton`, serialized against creators using the existing exclusive advisory transaction lock `(19092026,1)`. The only deployed readers of this gate are `private.farkle_resolve_config_v1` and the dealer-game INSERT guard `private.farkle_config_guard_v1`. No view reads it. Existing action, settlement, timer recovery, and postgame owners do not depend on this flag.

Six isolated tests prove new setup and Run Back rejection, existing +5/−5 settlement, trusted timer settlement, postgame cleanup, and continuation into Horses with admission closed. A production **read-only** call to the actual configuration resolver returned `P0001: farkle:creation_disabled`; no synthetic production session was created.

At 19:23:19 UTC, creation remained false, cron job 33 remained active every second, and the canonical dispatcher had completed less than one second earlier with zero consecutive partial failures. Run21's independent job 38 remained active. All 20 Farkle round hashes and the retained result-set hash were unchanged from containment. No existing production session, balance, result, snapshot or financial history was written by this work.

The post-restart attempt rechecked production read-only at 19:48:02 UTC: creation remained false, both recovery jobs remained active, and the canonical dispatcher's latest completion was 19:48:01 UTC with zero consecutive partial failures. This attempt made no production mutations.

After browser qualification, the 20:02:56 UTC read-only check again found creation false, both recovery jobs active, and the latest canonical completion at 20:02:55 UTC with zero consecutive partial failures. The resumed qualification made no production mutations.

## Authorization correction

The original human RPCs validated participant identity and session membership but did not read fresh `profiles.is_active`. UI login checks could not revoke database authority from an already authenticated inactive account.

The candidate adds private `farkle_require_active_actor_v1` and invokes it at these human command boundaries:

- `farkle_apply_action` and `farkle_advance_postgame`, including replay requests.
- `configure_dealer_game`, scoped to incoming/current Farkle; this covers Run Back.
- `submit_ante_decision`, `advance_ante_phase`, `set_game_paused`, `set_automatic_play`, and `set_session_player_intent`, scoped to current or exact referenced Farkle identity.
- The private claim owner rechecks ordinary authenticated commands as defense in depth. The sealed deferred financial trigger retains authority to finish an already authorized transaction if the account is deactivated before COMMIT.

The service-role distinction remains the existing trusted signed-role/server-recovery boundary. Browser access to private helpers remains revoked. Membership, actor UUID, controller, identity, sequence, frozen stake, replay and settlement guards are preserved. Profile status is read from the server; browser self-reactivation is rejected by the existing `guard_profile_authority` trigger.

An independent-connection test commits administrator deactivation **after** a valid real-money final action returns but **before** its deferred journal COMMIT. The corrected trigger commits one balanced settlement, and trusted postgame cleanup succeeds. Inactive new commands are rejected. A real-money human timeout still pauses without choosing a bank action; fake-money zero-client recovery still completes. These are deliberate existing money-mode policies, not a new permission to gamble for a disabled human.

## Deadlock correction

The baseline race was reproduced with actual production function bodies and real row locks:

1. The player action owns the round, then requests the session and participant.
2. Recovery owns the timer, then requests the same round.
3. The action's round trigger requests the timer, completing the lock cycle.

Evidence retains backend PIDs, `pg_locks`, blocking PIDs, exact game/dealer/round/player UUIDs, and `40P01` detail/context. Both action and recovery aborted in the captured reproduction. Balances remained zero; no result, snapshot, batch, pending transfer or handoff survived. The existing durable retry later settled exactly once with no clients.

The candidate moves timer acquisition into a per-candidate subtransaction. Farkle recovery first acquires round and session locks with NOWAIT, then locks/rechecks the still-due timer with SKIP LOCKED. Contention rolls back those partial acquisitions and leaves the timer due for a later scheduled invocation. This matches the action's ownership order, retains all necessary locks and atomic financial guarantees, and adds no retry loop. Other timer handlers and business rules are unchanged. The same forced race now lets the player finish while recovery skips contention without failure; independent duplicate-action and two-worker races also pass.

## Qualification matrix

### Corrected terminal handoff acceptance (owner clarification)

A completed Farkle dealer game is not a completed session. The previous two-browser failure explicitly set `pending_session_end=true`; its authoritative status was `session_ended`. It establishes only the ended-session HUD defect, not ordinary continuation behavior.

The existing database participation and dealer-eligibility policy remains authoritative. Eligible sessions continue to `game_selection` or `dealer_selection`; insufficient participation, no eligible dealer, and explicit pending session end follow their existing server branches. No new session-ending rule is authorized. `SessionEndedTablePhase` is admitted only for actual `session_ended` after terminal presentation; a fresh mount of that status goes to the lobby.

The full-app proof must separately capture both browsers and terminal/route traces for: (1) ordinary two-human Farkle continuation and next setup, including Run Back and dealer rotation; (2) one remaining eligible participant; (3) no eligible dealer; (4) explicit session termination; (5) Run21 fullscreen through neutral setup into a table game; and (6) Run21 fullscreen through neutral setup into another fullscreen game. Make-it-take-it policy must remain intact. Continuing sessions retain History and session controls; ended connected sessions retain results, HUD and local Back to Lobby. Run21 is qualification-only unless a concrete defect is established. All six pass locally; matching frontend publication was verified and admission reopened.

These statuses describe the **local candidate**, not deployed corrected behavior.

| Gate | Status | Evidence |
|---|---|---|
| Safe containment / existing matches | PASS | Six closed-gate cases; actual production resolver rejects creation; recovery healthy |
| Active non-admin participant | PASS | Ordinary setup, ante, action, final settlement, continuation and Run Back |
| Inactive action / settle / Run Back | PASS | Both money modes reject commands with `42501`; authoritative state unchanged |
| Mid-game deactivation / pending settlement | PASS | Inactive timeout safe; independently committed deactivation before journal COMMIT preserves authorized settlement |
| Trusted zero-client recovery | PASS | Final boundary, whole fake-money competition, bot path, worker termination and fresh worker retry |
| Authoritative winner and stake | PASS | No client-supplied payout/scores; invalid stake and frozen-config tampering rejected |
| Canonical +5 / −5 balances | PASS | Actual player chips; 4-player +15/−5/−5/−5 and 7-player +30/six −5 also checked |
| Exactly one balanced transfer/result | PASS | Canonical journal, result, snapshot, receipt and handoff assertions |
| Matching final snapshots | PASS | Exact UUID-indexed balances match results and batch closing balances |
| Atomic failure rollback | PASS | Result, snapshot, terminal, journal and actual COMMIT fault injection |
| Duplicate / stale / concurrent / late replay | PASS | Independent connections; successor identity isolation; no second payment |
| Winner / multiplayer tie / all-tie | PASS | Equal-turn ties continue without payment until one authoritative winner |
| Pause / resume / timeout / disconnect | PASS | Real humans pause; same competition resumes; disconnected fake humans recover |
| Recovery/action deadlock | PASS | Captured baseline `40P01`; corrected forced race and two-worker concurrency pass |
| Postgame and Run Back database lifecycle | PASS | Exact receipt dedupe; fresh successor; trusted cleanup after deactivation |
| Historical integrity | PASS | Rejected browser rewrites; unchanged production round/result hashes; only gate mutated |
| Schema, triggers and privileges | PASS | 179 baseline routine hashes match fresh production; 341 constraints, 167 triggers, 258 indexes retained; 31 column grants restored; existing routine privileges unchanged |
| Full-app two-browser terminal/history | PASS | Corrected local production build: both clients retain results, Session Ended announcement, HUD, History and Back to Lobby |
| Browser continuation / Run Back / fresh mount | PASS | Continuing sessions reach neutral setup and Run Back; ordinary rotation passes; fresh ended mount goes to lobby |
| One eligible participant / no eligible dealer | PASS | Existing server resolver returns `waiting` in both seated-human fixtures; both clients retain a single HUD; no false Session Ended |
| Run21 fullscreen → neutral → table/fullscreen | PASS | Two independent full-app cases start Farkle and Run21 successors through normal setup; one persistent shell, no duplicate felt/HUD or missing-shell frame |
| Other games / broad regression | PASS | 313 files / 2,360 tests; zero failures; all original assertions retained |
| Typecheck and production build | PASS | Installed TypeScript `tsc` passed; Vite build passed; `tsgo` absent, not installed |
| Corrected production authorization/recovery | PASS | Migration 20261015212154; all 11 routine hashes match; existing ACLs and 443 other routines unchanged; recovery healthy |
| Unrestricted admission | PASS | Reopened after all qualification, deployed routine, Vercel READY, live SHA/bundle and recovery health checks |

The database bundle contains **100 passing assertions, five recorded race/retry observations, and zero harness errors**, plus the explicit before/after race and metadata proofs. The post-WSL rerun again passed all 100 assertions with zero harness errors; its corrected forced race and durable retry are retained separately in `rerun-evidence.json`. A random final-queue Farkle exposed a proof-harness assumption that completion always occurs on Bank; the harness now preserves the exact server Roll receipt when that Roll completes the competition. Product scoring was unchanged.

The broad-suite failures are: 34 `DealerGameSetup.runBack` tests missing the `auth.onAuthStateChange` mock; one stale `setAnteDialogIdentity` source assertion in `gameTimerAuthority`; and one existing Holm proof lacking the transaction form required by `systemSettingsRollbackProofIsolation`. Relevant source/test files match HEAD. They are recorded for separate correction, not silently changed in this financial task.

## Initial full-app failure (retained historical evidence)

Jeremy installed WSL; `wsl --version` now reports 3.0.3. Docker Desktop 4.95.0 starts its Linux engine (29.8.2). Reused Supabase CLI 2.121.0, Node 24.19, PostgreSQL 17.10 and installed project/browser dependencies. Only the required Supabase container images were downloaded in this resumed attempt; no additional project dependencies or OS tools were installed. Earlier installation failures remain historical evidence in the two tooling logs and `post-restart-evidence.json`.

Created the unlinked `farkle-full-stack` project, API `http://127.0.0.1:57321`, database port 57322. Restored the deployed application schema without production participant/session/financial rows: 453 routine hashes matched before applying the candidate locally; existing constraints, indexes, policies, grants, trigger definitions, publications and six FULL replica identities were restored. The actual canonical cron procedure runs under its required job name `advance-due-game-state-1s`. Two fresh, active non-admin users authenticated through real local Supabase Auth; the browser uses the ordinary production configuration path (`testOnly=false`, stake 5, target 100, equal turns).

The first dev attempt exposed missing local replica identities and the exact scheduler job-name prerequisite. Those harness issues were corrected. A subsequent dev run had trace-HTML-triggered Vite reloads, so its UI observations were not used as final release evidence. Rebuilt the application with loopback environment values and ran it through `vite preview`, with no file watcher. No product source was edited. All browser HTTP requests in the final run stayed on loopback.

The final production-build test session is `02677a21-c79c-47b8-b78c-b2d65728529b`, dealer game `72e47e87-2cd1-49bb-8bb4-c22f7bc53519`, round `65a54115-b434-412d-9796-1983a8fc2ffd`. The local fixture arranged `pending_session_end=true` through the existing scoped owner claim before completion; every Roll, Hold and Bank used the real UI/RPC path. Six actions completed the competition. Assertions confirmed canonical winner +5 / loser −5, one result, one transfer batch, no pending transfer changes and exact final snapshots. Authoritative session status is `session_ended`.

**Both connected clients then show the correct Results panel but no HUD/tab rail, History control, Session Ended announcement or Back to Lobby control.** The Back to Lobby assertion times out after 45 seconds. Screenshots confirm the missing controls. No browser exception occurred; the only HTTP errors were expected denials of `admin_account_balances` for the ordinary test users. The earlier dev-only observation of a peer stuck on Final Turn did not reproduce in the production build and is not asserted as the final blocker.

This establishes a failure at the Farkle gameplay-to-shared-terminal HUD handoff, after database settlement. Relevant owners are the Farkle/neutral slot selection in `src/pages/Game.tsx:14509`, the shared terminal mounts at `src/pages/Game.tsx:15473`, and `SessionEndedPaneAction`, which requires the existing `[data-hud-row="pane"]` destination. The precise missing-mount cause still needs scoped diagnosis; no speculative lifecycle patch was made. The next correction must preserve the canonical HUD/tab rail through Session Ended, then repeat terminal/history, fresh-mount and continuation/Run Back acceptance. The independent continuation case did not run after the mandatory terminal failure.

Final evidence: `browser-production-evidence.json`, `browser-production-results.json`, and `browser-production-client-0.png` / `browser-production-client-1.png`. The full trace remains in ignored `qualification.local/farkle-full-stack/browser-production-build-output/`. Earlier dev evidence is separately retained. The original candidate and proof bundle remain unchanged.

## Corrected handoff qualification

The failed explicit-end fixture had actual status `session_ended`, not ordinary dealer-game completion. The exact missing owner was the Farkle fallback in `Game.tsx`: it returned `NeutralInterstitial`, which renders felt spacing/seats and registers tabs but does not mount `ShellHudGrid`. The existing Session Ended button portals into the HUD pane, so losing that host also removed Back to Lobby. Farkle now falls through to the existing canonical `MobileGameTable` outside its exact live/presenting round, as the shared neutral/terminal path already does. No server lifecycle condition, session-ending rule, shared shell geometry or other game component was changed.

Five independent two-browser Farkle scenarios pass against the actual local Supabase Auth/PostgREST/Realtime stack and a production build: ordinary continuation with Run Back; explicit ordinary dealer rotation with make-it-take-it disabled; one eligible participant; no eligible dealer; and explicit session end. A further fresh continuation run explicitly enables make-it-take-it and asserts the winner's dealer position before Run Back; the rotation run asserts the next lower occupied seat, wrapping. In the one/no-eligible fixtures, humans remain seated, so `private.resolve_postgame_participation` correctly returns `waiting`. Explicit termination retains the Session Ended announcement, results, HUD, History and Back to Lobby on both clients; Back to Lobby changes only the choosing client's route, and a fresh ended-session mount goes to the lobby. Every fixture confirms +5/−5 chips, one result/batch, no pending transfer changes and exact snapshots.

`handoff-browser-evidence.json` records UUIDs, state, routes and per-frame surface counts. Corresponding `handoff-*.png` screenshots show both clients. Raw browser traces remain ignored under `qualification.local/farkle-full-stack/handoff-v2-output/`, `handoff-v3-output/` and `handoff-v4-output/`; they contain local authentication material and must not be committed. Early harness-only selector failures are retained separately: existing labels use lowercase `farkle`; they do not establish product failures.

Both Run21 full-app cases also pass (`run21-handoff-evidence.json`): Run21 fullscreen → terminal payout → authoritative close → table-mode neutral setup → Farkle, and the same path into another Run21 fullscreen match. The inspected presentation-mode resolver switches from committed fullscreen identity to table mode as the authoritative close clears that identity; the persistent shell and slot survive. Per-frame traces from both browsers have no missing shell, post-entry shell replacement or duplicate felt/HUD/fullscreen surface. Board, score and controls retire; the same players, balances and session UUID persist. Normal dealer setup configures both successors. No Run21 or shared shell source was changed. The deployed `run21_server_close` definition still matches the captured local source (MD5 `e57f2fcd24eee243f38c9696c7ac1e54`).

Run21 qualification uses its existing frozen `always_105` fake-money harness to keep three-round gameplay bounded, with real UI placements, Give Up/Take Win, authenticated production handler, canonical settlement and close. The deployed discovery contract expects its project hostname, so the browser's virtual API origin is intercepted and forwarded exclusively to the local Supabase API at port 57321, including WebSockets. Both browser and server credentials are local. No production network request or synthetic production row is required. Local harness settings are restored after each case. Both-client fullscreen/neutral/successor screenshots are retained as `run21-to-*.png`; raw traces stay in ignored `run21-handoff-v5-output/`.

The financial/recovery rerun again passes 100 assertions with five race/retry observations and no harness errors (`handoff-financial-rerun.json`). TypeScript and the production build pass; 72 focused shell, terminal, Run Back and Run21 component tests pass. The three known regression files were rerun: 13 tests pass and the same 36 fail. Missing Auth mocks, a stale source assertion and the existing Holm rollback-proof transaction form remain outside this correction's product scope. No migration or publication may be claimed while that mandatory regression gate remains failed.

Production was inspected read-only at 20:46 UTC: Farkle creation is false, canonical recovery completed in 5 ms with zero consecutive partial failures, and jobs 33/38 are active. No production session, history or financial row was written during this resumed qualification.

## Cleanup

The earlier financial rerun database `farkle_audit_empty_1792094109570` was dropped before the lifecycle clarification. The fresh handoff rerun database `farkle_audit_empty_1792096975400` was also dropped and its absence verified at 20:45:53 UTC (`cleanup-handoff.json`); PostgreSQL was stopped. Both local production app servers and the project-specific Supabase stack are shut down after qualification, with the synthetic fixtures retained only in its stopped local backup. No listeners remain on 5177, 5178, 57321, 57322 or 55439, and no project container remains running. Docker Desktop was also stopped; final verification is recorded in `handoff-services-cleanup.json`. Installed tooling, existing PostgreSQL data files and evidence are preserved; no additional tooling was installed in this handoff attempt. No production history or existing production session was modified.

## Delivery state before frontend publication

- Branch: `codex/farkle-financial-integrity`.
- Exact unchanged base commit: `2059a816ab8b0f3ad789210c3abeb86a6af34332`.
- Candidate: `supabase/farkle/financial-correction/20261015/candidate.sql`; SHA-256 `f38c212b9170c729ad26fffee90ecade00a35dee2cbe2046b158a6e18078f185`.
- Correction migration: **20261015212154 applied and verified**. Frontend commit/push/READY verification is the remaining release step.
- Creation: **closed pending frontend READY verification**. The active-account and recovery lock-order corrections are installed; existing match/history records are preserved.
- Evidence: original `evidence.json`, `rerun-evidence.json`, `handoff-financial-rerun.json`, `handoff-browser-evidence.json`, `run21-handoff-evidence.json`, both-client screenshots, production read-only snapshots, regression recheck and cleanup receipts. Raw authenticated traces remain ignored. No production credentials are included.

After correcting and passing the failed/missing gates: create the migration through the installed CLI, verify original-definition preconditions, review contention/compatibility, apply the candidate, recheck deployed definitions and scheduler, selectively commit and push through the approved high-risk workflow, verify deployment, then reopen admission. Owner smoke still needs active two-human gameplay, visible +5/−5 payout/history on both clients, ordinary continuation/Run Back, terminal Session Ended and fresh-mount lobby behavior.

## Final regression correction and migration — 21:22 UTC

All three failing qualification files matched baseline HEAD before this work, so the failures predate the Farkle implementation:

- DealerGameSetup.runBack.test.tsx: 34 mounts crashed when the real useRun21Access hook subscribed to Auth. The mock now supplies getSession, onAuthStateChange and unsubscribe with a signed-out session; it grants no capability. The actual hook remains in use, and its four existing denied/stale/sign-out/identity security tests pass.
- gameTimerAuthority.test.ts: the source assertion expected the old unconditional object expression. Production uses anteGameType ? exact identity : null. The assertion now verifies that gate and exact dealer/game identity; authoritative deadline, pause, resume, rejection and no-polling assertions remain.
- systemSettingsRollbackProofIsolation.test.ts: it inspected a Holm extension as if it were a standalone script. The test now invokes the existing assembler and checks its executable artifact, the entire extension, exactly one BEGIN/ROLLBACK, and absence of COMMIT. The assembler's stdout option avoids generated repository files; output is byte-identical to the executed proof.

The three original files now pass all 49 tests; four additional existing Auth tests pass (53 total). Full npm run build passes typecheck, 2,119 source tests plus 241 harness tests (313 files, 2,360 total), then Vite production compilation. No skipped/expected-failing tests or silenced exceptions were added.

The actual Holm proof runs on the isolated full schema. Required synthetic users and the two harness-setting rows are inserted inside its transaction. The first isolated execution lacked the target-rule setting row and rolled back; supplying that local prerequisite made the unchanged proof pass. It proves 32 same-ID draws, 32 solo and 32 tied showdowns, canonical conservation/results, replay/recovery, real-money harness isolation and admin authorization. ROLLBACK restored auth/profile/role, session/round/player, results/snapshots/ledger/transactions, settings and defaults fingerprints. No Holm financial failure was found.

The Farkle rerun again passes 100 assertions and the 72 focused tests pass. Browser evidence is retained: these qualification-only changes do not affect the previously tested product build. The qualified SQL candidate hash remains unchanged. Before migration, all 453 deployed routine definitions/ACLs matched the captured source. The migration accepts only original/qualified function hashes, requires closed admission, uses the existing creator advisory lock, a 5-second lock timeout and a 30-second statement timeout, and makes no table/index/trigger/history changes. Original and repeat application passed locally inside rollback. The server assigned version 20261015212154; the CLI-created file was aligned to that recorded version.

After migration, all 11 qualified definitions match, existing production ACLs are identical, and 443 unrelated functions remain unchanged. All 20 Farkle rounds and 32,808 result rows retain their exact hashes. Recovery completes with zero consecutive partial failures and both jobs stay active. Read-only production checks accept an existing active account and reject a missing account. Production has no inactive profile available for a direct inactive probe; the installed function is byte-identical to the locally proven inactive-account implementation, and no production account was mutated to fabricate one.

Evidence: release-validation.json, release-financial-proof.json, release-holm-proof.json, release-migration-proof.json, release-production-before.json, release-production-after.json and release-cleanup.json. Existing Supabase advisor findings were observed before migration; this routine-only correction does not alter their tables or permissions. The existing RLS advisory for gameplay_transfer_pending_changes is documented by the [Supabase advisor](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled); no unrelated security/schema change was made.

## Verified production release — 21:29:57 UTC

Product correction 887bdb4e4d03e6c74f412178cc140bf621d8b0e0 was pushed on the task branch, fast-forwarded to main and published through the approved push helper. Tag farkle-financial-correction-qualified-20261015 records that checkpoint. Vercel deployment dpl_8QB6Lgab8dZrxfbQXWpPhsjvf5kZ is READY. The public build manifest and entry bundle match the exact SHA and production Supabase URL, with no isolated testing API embedded.

After those checks, the existing advisory-locked release gate reopened creation. The transaction first rechecked all 11 qualified routine hashes, both active recovery jobs, fresh successful recovery with zero consecutive partial failures, and the expected closed gate/defaults. A read-only configuration resolver then returned production testOnly=false without creating a session.

The final read-only receipt confirms admission open, healthy recovery, unchanged qualified routines, 443 unchanged unrelated routines, and exact unchanged hashes for all 20 existing Farkle rounds and 32,808 result rows. No synthetic production session or financial transaction was created. Existing sessions and other games were not modified. See release-deployment.json and release-cleanup.json.

Disposable proof database removed; Supabase, native PostgreSQL and Docker Desktop stopped; no listener remains on 5177, 5178, 57321, 57322 or 55439. No tooling was installed during this final qualification. Unrelated user changes are preserved. No automated release blocker remains. Owner production gameplay smoke remains pending, as required by the repository acceptance contract.
