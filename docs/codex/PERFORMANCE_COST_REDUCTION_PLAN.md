# Poker performance and cost-reduction plan

Date: 2026-09-08. Status: first SQL correction deployed; broader cost objective incomplete.

Execution evidence: `PERFORMANCE_COST_REDUCTION_20260908.md`. Billing changes
remain outside the current approval.

First result: 22.6% lower idle dispatcher execution, below the 80% target.
Matched browser qualification is blocked by the documented Cribbage action
attribution limitation. No bill or capacity reduction is claimed. Jeremy's
usage estimate is 5–7 hours/week with the app usually left open between games;
sustained idle-tab traffic must be included in the next bounded measurement.

## Outcome

Find the least expensive Supabase configuration that reliably supports
Jeremy's normal two-human game sessions. Aim for Free if measured capacity,
usage limits, and recovery tradeoffs permit it. Do not treat a $5 reduction
or a faster result on Small as proof that this objective is complete.

This plan authorizes no billing changes, project transfers, deletion,
production game repair, new paid tooling, or product implementation by itself.

## Evidence already established

- Poker now uses Small / 2 GB after the September 7 incident; application
  build `838ac54ad` is unchanged. See `INCIDENT_20260907.md`.
- The July chat-boundary recorder amplified requests; September 5 evidence
  includes 3,510 calls in two minutes. The September 6 retirement is deployed.
  Its authenticated counter remained at 469,224 in the September 8 sample.
- August authority migrations added frequent server recovery. August 20
  consolidated the jobs; September 1 added per-owner admission and a rotating
  safety sweep. The deployed dispatcher still checks eight categories every
  second, runs due owners plus one safety owner, and writes its heartbeat.
- At 13:46 UTC September 8, the last hour contained 3,545 successful recovery
  jobs, 197.75 seconds total execution, and 55.8 ms mean duration. A separate
  75.1-second sample contained 74 dispatches and 4,012.7 ms execution while
  the sampled Cribbage, voice-presence, and debug-event counters did not move.
  All eight due checks subsequently returned false. This establishes idle
  overhead, not the initiating cause of the prior memory/I/O spike.
- `voicePresenceHeartbeat.ts` calls `auth.getUser()` and upserts presence
  every four seconds. Its lease is used for real session abandonment, so it
  must not be mistaken for disposable voice-only diagnostics.
- The account's prior Free-plan warning was for excess egress. Lower CPU use
  alone will not establish Free eligibility.

## What changes the bill

Current estimate: $25 Pro + ~$15 poker Small + ~$10 recipes compute - $10
included compute credit = ~$40/month, before tax and usage overages.
The connected account has two active projects and an older inactive project.

| Configuration | Approximate ongoing organization cost | Condition |
| --- | ---: | --- |
| Current: poker Small, recipes unchanged | $40/month | Already applied |
| Poker Micro / 1 GB, recipes unchanged | $35/month | Smaller-compute trial passes |
| Poker Micro, only poker billed in Pro | $25/month | Separately approved handling of recipes; e.g. eligible transfer to Free |
| Both apps eligible for Free | $0 base subscription/compute | Quotas, capacity, and lost paid features accepted |

Optimization does not automatically lower a fixed compute/plan bill. A
verified resize or plan change is required. Do not pause, transfer, or
otherwise change `house-recipes-prod` merely to achieve the table's lower
numbers. Returning the whole organization to Free affects both apps.

## 1. Establish one reproducible baseline

Keep Small and the application build fixed. Reuse existing test identities,
fake-money isolation, and browser observers; no extra production telemetry.

- Measure matched five-minute windows: no app clients, two clients idle in
  the lobby, and two clients parked in a valid human-untimed game phase.
  Repeat to distinguish stable overhead from noise.
- Run the same bounded two-human fake-money Cribbage scenario three times,
  including parameter submission, card play, hand completion, and next-dealer
  setup. Retain at least 100 ordinary actions across runs when practical;
  explicitly report sample counts and incomplete runs.
- Record database calls, execution/planning where available, row changes,
  WAL volume, connection churn, lock waits, response bytes, and both clients'
  action-to-authoritative-progress times. Pair with CPU, memory availability,
  swap activity and I/O wait. Separate intentional animation dwell from
  command latency; separate injected network failures from ordinary play.
- Use before/after counter snapshots, keyed by `dbid`, `userid`, `queryid`,
  and `toplevel`. Do not reset production statistics. Exclude our probes and
  mark counter resets/evictions; one query ID can have multiple role entries.
- Break out poker versus recipes egress by service and billing period. Derive
  monthly projections from expected play hours plus idle background use,
  not from an idle-only test or pre-retirement traffic alone.

Deliverable: one short baseline report identifying the largest measured
avoidable costs and the exact first correction. Do not benchmark every game
exhaustively before addressing a demonstrated common bottleneck.

## 2. First correction: inexpensive idle recovery

Owners: `private.advance_due_game_state`, `game_recovery_task_is_due`,
`run_due_game_recovery_task`, `game_recovery_dispatch_state`, and the existing
canonical timer registry. Source references are
`20260901085259_admit_due_recovery_work.sql` and
`20260905025009_isolate_recovery_sessions_and_restore_context.sql`;
deployed definitions outrank those references.

Profile admission queries, the empty safety runner, bookkeeping, and job
startup separately. Use read-only EXPLAIN ANALYZE on verified SELECTs;
profile mutating recovery only in rollback-safe synthetic proofs, never
by repeatedly executing it against historical real-money games.

Preferred correction: retain the sole one-second scheduler and health
contract, but make a truly idle tick inexpensive. Use a small indexed
eligibility check and narrow authoritative work selection; avoid repeatedly
loading irrelevant game state. Change queries/indexes only where plans show
the cost. Combine redundant bookkeeping only if it measurably matters.

The eligibility definition must include pending timers, bots, terminal
handoffs/settlement, retries, abandonment watches, and disconnected or legacy
work. Absence of browser heartbeats is not proof that no work exists. Preserve
bounded safety discovery for work missing a timer entry. Do not disable job
history/failure evidence merely to make a metric look smaller.

Do not lengthen gameplay deadlines, weaken the real-money health guard, add
a second scheduler, or introduce a new work registry without proving why the
existing ownership cannot meet the objective. If startup rather than queries
dominates, report that result before expanding into scheduler infrastructure.

Target: at least 80% lower normalized idle recovery execution time on the
same Small instance, with a corresponding resource reduction and no cost
shift into a different worker. This is an engineering target, not a promised
result; missing it requires an explanation, not a silently lowered threshold.

## 3. Next correction only if the baseline warrants it

Rank these by observed cost and handle one coherent change at a time:

1. Presence/auth overhead: eliminate redundant identity network lookups or
   duplicate writers while preserving the server-stamped lease, user changes,
   sign-out, reconnect, RLS, and abandonment timing. Do not simply disable or
   slow the four-second lease.
2. Excess response/realtime data: remove proven duplicate state fetches and
   subscriptions; narrow payloads to what the canonical consumer needs.
   Retain private-card masking, identity/revision guards, and reconnect reads.
3. Remaining hot action/trigger queries: profile the Cribbage publish path and
   cross-game guards only if evidence identifies them as significant. A
   timeout landing in a function is not proof that function caused it.

Do not rewrite the application, migrate providers, add a caching service,
disable safety instrumentation wholesale, or optimize from source size alone.

## 4. Prove savings and preserve gameplay

Repeat the identical baseline on Small before changing hardware. Report
absolute costs and percentage changes, not just a green test or a faster
dashboard. Require unchanged existing action/recovery budgets and no
material latency regression across repeated matched runs.

Because recovery is shared, require focused all-seven-game coverage of:
due timers, zero-client recovery, pause/resume, missed realtime events,
reconnect, duplicate and late action replay, isolated task failure, next-hand
and next-dealer transitions, exactly-once settlement, and Session Ended.
Use dedicated fake-money sessions; automated tests must not wager real money.

Reuse and extend:

- `supabase/tests/game_recovery_scheduler_rollback_proof.sql`
- `supabase/tests/canonical_game_timer_rollback_proof.sql`
- `supabase/tests/recovery_session_isolation_rollback_proof.sql`
- `supabase/tests/seven_game_pause_rollback_proof.sql`
- `e2e/liveness/allGames.twoClient.spec.ts` and existing terminal/chaos tests
- `e2e/humanChaos/support/continuousObserver.ts` and progress evidence

SQL proofs must pass before and after a scoped migration; direct PostgREST
proof covers any changed RPC boundary. Preserve historical repros and clean
only the run's own synthetic data. Typecheck and focused tests precede one
build/publication; Jeremy's production smoke is final acceptance.

## 5. Turn proven savings into a smaller bill

Before any downgrade, check all current plan limits and paid-feature use,
both projects' projected usage, connection/replication constraints, backup
and restore readiness, and the dashboard's actual charge/credit preview.

- Free readiness target: projected usage no higher than 80% of each relevant
  Free allowance. For the currently published limits that means under 4 GB
  monthly uncached egress and under 400 MB database size per project, subject
  to the correct organization/project quota scope. Check cached egress,
  storage, Realtime, Auth, and functions separately as applicable.
- Observe representative real use and idle periods after optimization.
  Do not extrapolate Nano memory sufficiency from Small's allocated cache.
- Propose an explicitly approved smaller-tier trial with no active money
  game at restart. Micro is an optional ~$5 interim saving, not the $0 goal.
  A controlled Free/Nano trial is the actual proof of Free suitability.
- Define the preapproved restore-to-known-good action and cost before that
  trial. Test a full-length two-client fake-money session, setup/terminal
  paths, and disconnect recovery; inspect sustained behavior, not just the
  first few minutes after a reboot with fresh burst capacity.
- Fail the trial on recurrence of pool/statement/cron-startup timeouts,
  ordinary recovery-health failures, sustained swap/I/O pressure with stalls,
  or existing action-budget failures. Restore the known-good capacity within
  the approved recovery scope, then report the smallest tier actually proved.
- Free removes paid backup/log-retention benefits and can pause inactive
  projects. For a real-money app, agree on a verified backup/restore method
  and these tradeoffs before abandoning Pro. Free is not a promised outcome.

## Execution and approval boundary

Planning changed only this document and its links. Jeremy subsequently
approved implementation on September 8; the first correction targets the
measured Cribbage recovery admission query. No billing or capacity change
is authorized by that implementation approval.

Start with baseline and the first measured scheduler correction after
implementation approval. Use one primary agent, existing tooling, and one
coherent high-risk branch/migration at a time. No default subagents or new
dependencies. Keep the first diagnosis/patch-design block bounded to about
30 minutes excluding explicitly timed benchmark runs; report evidence and
the smallest next decision if the anticipated correction proves wrong.

An approved correction includes its SQL proofs, client changes if needed,
validation, review, commit, normal Git integration/push, and one publication
check. Further optimizations are conditional on the scorecard, not blanket
permission to refactor. Resizing, cancellation, transfers, backup exports,
and a paid rollback require their concrete operational scope to be approved.

## Current vendor references

- [Compute pricing and credit](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- [Compute sizes and restart constraints](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Free/Pro allowances and features](https://supabase.com/pricing)
- [Egress sources](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Project-transfer eligibility](https://supabase.com/docs/guides/platform/project-transfer)
- [Downgrade timing and credits](https://supabase.com/docs/guides/platform/manage-your-subscription)

Prices are estimates, not a spending cap. Supabase documents unused prepaid
subscription time as account credit on downgrade, not a refund to the card;
already-incurred usage can still be billed. Recheck at the actual plan change.
