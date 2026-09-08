# Recovery runner implementation and isolated qualification

Jeremy approved implementation/validation, then a disposable Supabase branch in
the poker app's existing organization with a $1 testing budget and deletion
after testing. Production deployment is not part of this phase.

## Temporary environment

- Parent production project: `xvhmbuppghwmwpwrkzao` (never the test mutation target).
- Branch name: `codex-recovery-runner-test-20260908`.
- Branch ID for cleanup: `8bb26b6c-68af-4d7b-a479-c5b06004bb2a`.
- Isolated project reference: `qhconpiawldeitzncdnh`.
- Created September 8 at 17:59:40 UTC, without production data.
- Quoted branch compute: $0.01344/hour, plus applicable metered usage.
- Cleanup: deletion succeeded at about 18:07:53 UTC, after roughly eight minutes.
  Only the parent's default main branch remains. Final metered charges are not
  yet available; the compute quote is not an invoice or a hard provider spend cap.

## Implementation and findings

The fixed-target SECURITY INVOKER procedure is in
`supabase/tests/prototypes/recovery_runner_candidate.sql`, outside the automatic
migration directory. It does not change cron, timeouts, or dispatcher code.
An initial actual-cron disable test exposed that libpq cancellation can leave
the backend executing an already-running CALL. The first candidate committed
five more fixture ticks after disable (59 became 64), even though cron recorded
the job canceled. The corrected candidate admits every tick only while the
canonical job's name, invoker, database, active flag and exact CALL command match.
A tick already admitted before disable may finish, as with the old single tick;
do not re-enable until its backend has drained. This guard is scheduler
admission, not another gameplay/financial owner.

The fixture is explicitly not the canonical dispatcher. It records transaction
IDs, committed ticks, connection identity, clock values and local context, with
controlled delay/error modes. It is used only in the disposable branch, which
contains zero game sessions. Existing copied legacy jobs were disabled there.

## Recorded scheduler evidence

- Initial candidate: 58 committed work transactions across two backends; the
  first batch completed 32 ticks. Start gaps were 1.000752–1.016117 seconds.
- Corrected candidate: first backend committed exactly 32 distinct transactions
  and a queued replacement continued. Observed gaps were 1.000339–1.016470
  seconds. This is an approximate cadence, not an exact wall-clock promise.
- Tick-6 injected error: committed attempts 1–5 survived; attempt 6 was absent;
  replacement backend began attempt 7 about 25 ms after the failed run ended.
- Slow-tick fixture: tick 6 took about 1.802 seconds; next start gap was 1.803409
  seconds, then returned to about one second, without catch-up bursts.
- Corrected disable: committed count remained exactly 25 after disabling; no
  runner backend or fixture advisory lock remained. This is a tested drained
  handoff, not permission to disable/re-enable without waiting for the old backend.
- Command replacement: changing the same job back to the original one-tick
  SELECT stopped the old batch at 22 committed ticks; its backend exited and
  subsequent single-tick runs succeeded. Restoring CALL resumed bounded batches.
- Explicit cancellation of the guarded CALL preserved its 15 committed ticks;
  a new backend started about 12 ms later and completed a full 32-tick batch.
- Actual cron connections report a two-minute statement timeout. A branch-only
  postgres/database override of eight seconds interrupted a 15-second stall in
  tick 6 after eight seconds total. Commits 1–5 survived; cron restarted about
  17 ms after failure and continued at attempt 7. The override was RESET.
- The whole-CALL timeout budget includes earlier ticks and sleeps; COMMIT does
  not renew it. A slow late tick therefore has less time than the old one-tick
  command. No production timeout override is proposed. Full-workload timeout
  acceptance remains a rollout gate, despite the proven fail/restart behavior.
- A statement timestamp stays fixed within a CALL while transaction timestamps
  refresh after COMMIT. The narrowly inspected deployed recovery/timer/deadline
  functions contained no `statement_timestamp()` use; this is not a complete
  transitive clock/dependency audit or a substitute for full-game proofs.
- Execute ACL: postgres allowed; anon, authenticated and service_role denied.
- All 24 Node model/source-guard tests passed. The fixture and native cron
  observations remain distinct from game/financial correctness proofs.
- Nine machine-checked assertions over the recorded native-cron evidence passed:
  full batch, restart, cadence, failed-tick rollback, disable/drain, timeout
  retention, command replacement, explicit cancel retention, and execute ACL.

The independent read-only review found no blocking implementation defect. The
runner is for the single scheduled job; arbitrary concurrent postgres CALLs
still rely on the unchanged canonical dispatcher's transaction advisory lock.

The branch security advisor flags
[mutable procedure search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
A procedure-level SET clause would forbid the required COMMIT. The candidate
instead uses SECURITY INVOKER, qualified object references and postgres-only
execution. This intentional exception remains documented for release security
review; the partially migrated branch's unrelated historical warnings were not
treated as current production findings or modified in this task.

## Full-game qualification blocker

Historical finding below: resolved by the subsequently approved isolated
bootstrap repair. All 11 rollback proofs now pass before/after the candidate,
and real cron recovered committed synthetic Gin sessions with failure isolation.
See `RECOVERY_BOOTSTRAP_20260908.md` for parity, fixture maintenance, cleanup and
remaining workload/cost gates. Production rollout is still excluded.

Branch provisioning stops after 222 migrations at version `20260706200750`.
The next production-history migration, `20260706213441`, begins with hard-coded
`cron.alter_job(job_id := 7, ...)` and job 9. The fresh branch instead has jobs
3 and 4. A rollback-only invocation of the first statement reproduces
`XX000: Job 7 does not exist or you don't own it`. The current dispatcher is
absent. No historical migration was changed and no attempt was made to declare
the partially migrated schema production-equivalent.

All-game authority/recovery proofs remain blocked on a separately scoped,
replay-safe test-database bootstrap. Scheduler fixture results cannot replace
winner/tie/replay/authorization/continuation/terminal game proofs. Production
deployment, billing/capacity changes and historical-data changes remain excluded.

## Handoff

At 18:07:54 UTC production job 33 still had its original active one-second SELECT
command. The candidate procedure did not exist in production. Liveness and
real-money admission were healthy, with no active recovery failures. No main
push, application release, production migration or capacity change was made.

Implementation is saved locally, but full validation is incomplete. Next scoped
work is a repeatable, schema-only test bootstrap that does not modify production
migration history; then resume game-safety and workload/cost qualification. This
blocker is captured in BACKLOG.md. Do not claim bill reduction or Free readiness.

Raw fixture results and assertion outcomes are retained at
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/recovery-runner-implementation-20260908.json`.
