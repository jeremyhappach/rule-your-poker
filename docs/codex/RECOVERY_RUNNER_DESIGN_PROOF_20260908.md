# Recovery runner reuse: design and isolated proof

Status: design/proof completed September 8, 2026. Candidate for implementation;
not a deployed runner or a completed production-safety qualification.

Jeremy approved this bounded phase after the second recovery-cost profile.
Production dispatcher, cron job, persistent schema, game data, billing and
capacity remain unchanged. No migration or application deployment is included.

## Finding

Reusable execution context retains the measured admission-query benefit across
separate committed transactions. Reuse does not require keeping a transaction,
game lock, authoritative snapshot or transaction-local context open between ticks.

In one backend, ten passes over the same eight read-only admission checks, with
an explicit transaction and COMMIT per pass, measured:

`26.120, 11.347, 10.176, 10.623, 9.817, 11.274, 3.479, 3.946, 3.977, 3.909 ms`.

All eight due flags were false in every pass. Backend 116830 used ten distinct
transaction IDs. This is one diagnostic sample, not a whole-dispatcher benchmark,
CPU measurement, active-game result or monthly-cost forecast. Cache warm-up is
not immediate, and it recurs at each new backend.

## Candidate: bounded reuse inside the existing interval job

The deployed platform is PostgreSQL 17.6 with pg_cron 1.6.4 in libpq mode
(`cron.use_background_workers=off`). Existing active job 33 runs as postgres in
database postgres, every `1 second`, with command
`SELECT private.advance_due_game_state();`.

Preserve that job identity and one-second schedule. A future migration would
replace only its command with a top-level CALL to a private procedure. Each
invocation would perform 32 dispatcher ticks in the same backend, committing
each one independently. The initial batch size is a candidate, not a tuned or
approved production parameter.

The procedure must be SECURITY INVOKER and must not have a procedure-level SET
clause; either SECURITY DEFINER or a SET clause prevents transaction control.
Use fully qualified names, no untrusted callback or dynamic dispatcher target,
and an explicit execute ACL for the actual scheduled invoker, currently postgres
(not an assumed role named cron). Do not change the job's username implicitly.
Do not expose it as a client RPC; PUBLIC, anon, authenticated and service_role
must not receive execute.
The existing dispatcher's security boundary and authorization remain unchanged.

Illustrative body only; this is not a migration or executable rollout script:

```sql
-- Inside a private SECURITY INVOKER procedure, without a SET clause:
FOR tick IN 1..32 LOOP
  started_at := pg_catalog.clock_timestamp();
  PERFORM private.advance_due_game_state(); -- unchanged canonical owner
  COMMIT;                                -- publish this tick, release its locks
  PERFORM pg_catalog.pg_sleep(greatest(0,
    1 - extract(epoch FROM (pg_catalog.clock_timestamp() - started_at))));
  COMMIT;                                -- end the sleep transaction as well
END LOOP;
```

The sleep is the scheduler cadence, not a gameplay transition timer. Keep it
after the final tick too. A slow tick uses no additional sleep; the next tick
anchors to its actual start rather than replaying missed time slots in a burst.
The second COMMIT prevents the sleep transaction's timestamp or snapshot from
carrying into the next dispatcher call.

Retain per-owner admission immediately before its action, rotating safety work,
the dispatcher's transaction advisory lock, failure isolation, exact identity
checks, pause behavior, canonical due times and all financial/settlement owners.
There is no second scheduler, work registry, client counter or progression owner.

Pinned pg_cron source admits at most one pending interval rerun while a job is
running. It serializes invocations of that job and retains the pending rerun on
completion/error. Thus a long interval invocation does not accumulate one queued
job per second; a pending replacement can start after completion when capacity
is available. This is source inspection plus a model, not an installed-cron
restart test. Connection failures or exhausted capacity can still delay a run.

## Failure, timeout and observability boundaries

- Let an uncaught error terminate the CALL. Its current transaction rolls back;
  earlier committed ticks remain committed. Do not catch errors around COMMIT
  in a PL/pgSQL exception block, which creates a subtransaction.
- Preserve the live ten-second heartbeat freshness threshold and all existing
  real-money failure/timer guards. Do not mark a batch healthy on its own or
  weaken the admission threshold to hide runner failures.
- The observed management connection has a 120-second statement timeout; no
  postgres role/database override was found. The actual cron connection's
  effective timeout still needs an integration check. A top-level CALL's timeout
  covers the entire invocation, including sleeps; commits do not reset that
  budget. A normal 32-second batch fits 120 seconds, but a slow late tick has
  less remaining time than a fresh single-tick statement. This is a material
  unqualified difference, not permission to raise or disable production timeouts.
- The invocation is tick-count bounded, not unconditionally wall-clock bounded:
  slow dispatcher calls extend it until an effective timeout/interruption applies.
- Keep cron logging enabled. Its run records become batch records; use the
  existing committed per-tick heartbeat/duration and failure evidence for health.
  Top-level CALL execution time in pg_stat_statements includes deliberate sleep
  and cannot be compared directly to old SELECT time as a compute-cost measure.
- Restart, cancellation, disabling/updating the existing job, in-flight command
  replacement, deployment handoff and rollback require actual integration proof.
  Do not add a competing fallback scheduler or assume model timing is a guarantee.

## Proofs performed

| Check | Result and boundary |
| --- | --- |
| Top-level DO transaction control | COMMIT produced a new transaction ID, cleared transaction-local context and released a probe-only transaction lock. |
| Cache reuse across committed passes | The ten-pass admission sample above retained its warm-query benefit after COMMIT. No recovery action ran. |
| Temporary procedure, 12 timed ticks | Passed twice, including the final fresh-after-sleep timestamp assertion. Twelve distinct work transactions; all start gaps asserted between 0.95 and 1.5 seconds; each work commit cleared local context and released its fixture lock. This separate timing proof records predicates but does not require all due flags to be false or reproduce the ten-pass cost sample. |
| Prior commit, rollback and duplicate fixture | A temp-table row survived a later transaction rollback; duplicate insert did not duplicate it. This is generic transaction behavior, not financial settlement proof. |
| Cross-request cancellation attempt | Incomplete: the second connector request saw no matching active probe. No external backend was canceled. The probe reached its explicit expected-cancel-missing assertion. Connector concurrency was not established. |
| Self-cancellation | Three empty committed ticks, then cancellation of only the probe's own PID while holding its probe-only lock. Expected SQLSTATE 57014 occurred; a following connection acquired the released lock. Not a crash or cron restart test. |
| Interval/cadence model and source guards | All 17 Node tests passed. Includes single pending rerun, no overlap, early/late error, capacity delay, disable, overrun and final-tick sleep. The model is not production integration evidence. |

SQL writes were limited to temporary fixtures and diagnostic session/transaction
settings. The timed procedure/table were explicitly dropped, and the fixtures
have no persistent game or financial identities. No gameplay mutator was invoked
manually. The lock keys are proof-only, not the live dispatcher lock.

At 17:13:36 UTC the final read-only check confirmed job 33 still active with its
original one-second SELECT command, healthy liveness/admission, no active recovery
failures, and zero remaining probe procedures or fixture tables. A bounded
read-only independent review clarified the invoker ACL and the separate scopes
of the admission-cost sample and timed transaction proof.

Reproducible files:

- `supabase/tests/prototypes/recovery_runner_commit_probe.sql`: run as one
  top-level statement, not inside an outer transaction. Success returns no rows;
  failed assertions raise an error. It reads live admission predicates only.
- `supabase/tests/prototypes/recovery_runner_cancel_probe.sql`: self-targeting
  interruption; expected result is SQLSTATE 57014, not a successful empty result.
- `supabase/tests/prototypes/recovery_runner_model.mjs` and `.test.mjs`:
  `node --test supabase/tests/prototypes/recovery_runner_model.test.mjs`.

Raw environment, SQL, results and failed-attempt evidence are retained outside
the repository at
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/recovery-runner-design-proof-20260908.json`.

## Remaining implementation/qualification gate

This phase establishes a viable candidate, not authorization to switch cron.
The next proposed phase is implementation plus controlled qualification:

1. Implement the private fixed-target procedure and repeatable rollback/reset
   proof in a matching isolated database. Verify actual cron CALL semantics,
   effective timeout, single pending rerun, cancellation/restart, lock release,
   committed heartbeat visibility, and update/disable/rollback handoff. No tool
   or paid environment may be installed or provisioned without authorization.
2. Resolve the whole-CALL timeout budget before rollout. Test normal batches,
   slow early/late ticks, failure before/after commit, and startup/capacity delay.
   Preserve fail-closed real-money behavior and documented liveness limits.
3. Run direct all-seven-game authority/recovery proofs: winner, tie, duplicate,
   replay, late replay, authorization, continuation and terminal cases; pause,
   disconnect and exact dealer/hand/round identity boundaries must remain intact.
   The temporary duplicate-row fixture does not replace these proofs.
4. Only within an approved implementation/rollout scope, apply the migration
   after proofs pass, hand off the same cron job, and verify the rollback path.
   Do not mutate historical sessions or call recovery manually on them.
5. Measure matched whole-dispatcher active work, CPU, memory, WAL, connection
   churn and user-visible latency on unchanged capacity; finish the existing
   two-client game/admission/terminal smoke and browser qualification gates.

An ideal 32-tick batch uses roughly 1/32 as many cron connections, but startup,
warm-up, failures and real workload affect results. This is a structural estimate,
not a measured production reduction. Free-plan suitability and any resize or
billing change remain separate decisions. The existing ~$40 monthly bill has
not changed as a result of these probes.

## Primary references

- [PostgreSQL 17 PL/pgSQL transaction management](https://www.postgresql.org/docs/17/plpgsql-transactions.html)
  supports top-level CALL/DO commits and documents exception-block restrictions.
- [PostgreSQL CREATE PROCEDURE](https://www.postgresql.org/docs/current/sql-createprocedure.html)
  documents SECURITY DEFINER and SET-clause transaction-control restrictions.
- [pg_cron 1.6.4 source](https://raw.githubusercontent.com/citusdata/pg_cron/v1.6.4/src/pg_cron.c)
  supplies the inspected interval pending-run, admission and completion behavior.
