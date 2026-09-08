# Controlled production recovery-runner rollout

Jeremy approved the production rollout, matched measurement and restoration of
the original scheduler on a recovery/latency regression. Billing, capacity,
other projects and historical game-data repair remain outside scope.

Baseline project: `xvhmbuppghwmwpwrkzao`, unchanged Small configuration
(512 MB shared buffers, 90 connections). Existing canonical job 33 runs once
per second. The 325 existing public/private routines are fingerprinted before
deployment; the candidate procedure is initially absent.

The fixed candidate is unchanged from isolated qualification. No dispatcher,
game rules, financial owners, timers, RLS or public RPC are replaced. Install
it first without switching cron, measure the original scheduler, then disable
and drain the one canonical job before switching it to the qualified CALL.

Nested query tracking is temporarily enabled only for the existing postgres
role in this database during both measurement windows, then RESET to the
verified previous default. Statistics are never reset. Read counters without
query text to avoid the diagnostic spill observed in the disposable branch.
No temporary measurement table/trigger or synthetic gameplay is added here.

Rollback procedure: disable the canonical job, verify its exact old CALL backend
has exited, acquire the existing dispatcher advisory lock, and restore the
original SELECT command with the job active. If needed, cancel only that exact
old backend and verify drain; committed earlier ticks remain intact. No game
or historical financial data is edited. Temporary query tracking must be
restored whether the rollout succeeds or rolls back.

The Supabase CLI is unavailable in this workspace (already established). Use
the supported migration API and mirror its returned authoritative migration
version/name locally rather than inventing a timestamp or installing tooling.

## Preparation

Migration `20260908192845_prepare_committed_recovery_runner` installed the exact
qualified procedure and enabled temporary nested-query measurement, without
switching cron. Its installed body matches the tested candidate byte-for-byte
after newline normalization; it is postgres-owned, SECURITY INVOKER, with no
procedure SET clause. Postgres may execute it; anon/authenticated/service_role
may not. The original job remains active for the baseline beginning 19:28:47 UTC.

Review corrections: switch/restore helpers explicitly wrap the transaction-local
timeout, canonical advisory lock and job mutation in BEGIN/COMMIT. Success uses
`recovery_runner_tracking_cleanup.sql`; rollback also resets only the owned
tracking override. The preflight checkpoint is local tag
`codex/recovery-runner-before-20260908`, pointing to `35e927721`.

## Cutover and baseline

Original SELECT baseline: 19:28:47.695807–19:33:59.987081 UTC, 312.292 seconds,
308 completed calls, 40.005 ms execution per tick. Statistics reset epochs and
statement deallocation counts did not change; recovery heartbeat was fresh,
completed, with no task/unit failures at both boundaries.

The canonical job was disabled and its exact active backend was confirmed
drained before migration `20260908193417_enable_committed_recovery_runner`.
The same job now runs the qualified CALL at the original one-second schedule.
The installed read-only liveness/privilege contract passed. The post-cutover
window begins at 19:34:28.583931 UTC, on unchanged Small hardware.

The security advisor flags the invoker procedure's mutable search_path. This
is intentional: PostgreSQL prohibits COMMIT inside a procedure with a SET
clause. Object/function references are qualified and EXECUTE is denied to
PUBLIC and API roles; the scheduled postgres invoker is the sole allowed role.
See [Supabase's search-path advisory](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
Existing unrelated advisor findings are not changed in this rollout.

## Production comparison and cleanup

Counter identity is database 5, postgres role 16388 and query ID
`-3152103405064032454`: top-level SELECT before, nested dispatcher after.
Both windows use the same temporary nested-query setting and unchanged Small
hardware. The windows differ in length, so comparisons normalize by their
actual completed call counts; these are not equal-duration or equal-count runs.
No statistics epoch, query-row epoch or deallocation count changed.

| Measurement | Original | Optimized |
| --- | ---: | ---: |
| Window duration | 312.292 s | 329.689 s |
| Completed dispatcher calls | 308 | 329 |
| Execution per tick, excluding CALL sleep | 40.005 ms | 13.499 ms |
| Shared-buffer hits per tick | 3,839.75 | 1,293.61 |
| WAL bytes per tick | 1,079.95 | 1,074.25 |
| New scheduled backends in window | 308 | 10 |
| Failed scheduled batches | 0 | 0 |

Execution and buffer hits fall 66.3%; recovery backend creation per tick falls
97.0%. WAL is approximately unchanged. The candidate's nine finished batches
in its window last 32.046–32.053 seconds (intentional sleep included); its tenth
batch was still running at the boundary. Health samples and both boundary
snapshots show completed/fresh recovery, zero task/unit failures and zero
consecutive partial failures. This is a production background-work comparison,
not direct CPU, memory, request-latency or monthly-bill measurement. The 80%
whole-scheduler execution target is not met by this production comparison.

Whole-database counters include unrelated services and this investigation:
sessions increase 322/24 and temporary bytes increase about 63.5/84.8 MB.
Those figures are not attributed to the dispatcher or claimed as memory/I/O
savings. The measured query has zero disk-read blocks in both windows.

Migration `20260908194000_restore_recovery_query_tracking` removes the scoped
override. At 19:40:19 UTC a fresh connection confirms tracking `top`, no
postgres/database override, unchanged 512 MB shared buffers, 90 connections
and two-minute statement timeout. The installed runner body still matches the
qualified candidate and the read-only production contract passes after cleanup.
The optimized scheduler remains enabled; no rollback was needed.

## Release validation

The production fingerprints preserve all 325 pre-existing public/private
routine definitions; only `private.run_game_recovery_batch()` is added.
The read-only production contract verifies the canonical job, procedure ACL,
completed heartbeat and empty recovery failure registries. All 28 runner/model/
rollout tests pass. `npm run build` passes the existing TypeScript check,
1,472 application tests, 48 harness tests and Vite production build, with the
existing bundle/import warnings. The preferred `bunx tsgo --noEmit` could not
resolve tsgo (registry 404); no dependency was installed and the existing
project TypeScript check provided validation instead.

No production synthetic game was created and no historical session was
repaired. Jeremy's two-person gameplay smoke remains acceptance truth:
start a game, play cards on both clients, finish the session and return to the
lobby. This rollout does not establish browser latency, low-memory capacity,
egress allowance, Free-plan eligibility or any reduction in the current bill.

Raw counter/configuration/definition evidence is retained outside the checkout:
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/recovery-rollout-20260908.json`.
