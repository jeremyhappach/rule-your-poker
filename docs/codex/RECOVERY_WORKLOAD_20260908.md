# Recovery runner workload qualification

Scope: paired qualification in an approved disposable no-data Supabase branch,
using the existing $1 testing budget. No production scheduler, migration,
game data, billing/capacity change or main push is authorized in this phase.

Temporary branch: `codex-recovery-workload-20260908`.
Project: `yhlbjyiumzoaaieuzzzu`.
Branch ID: `9eb8b729-a620-46dd-9780-3af9863538b6`.
Created 18:57:06 UTC; quote $0.01344/hour compute plus metered usage.
Cleanup: deletion succeeded at 19:21:00 UTC, after about 24 minutes. A fresh
listing contains only the parent's default main branch. The two synthetic
users and one fake-money session (25 hands) were removed with the branch;
production records were untouched. Quoted compute is approximately $0.0054,
not a final invoice; metered charges are not yet available.

## Method

Reuse the verified schema-only reconstruction adapter, compare authoritative
definitions and permissions, and keep the same hardware and instrumentation
for original one-second SELECT and candidate bounded CALL windows. The
canonical dispatcher and all game owners remain unchanged.

The test-only heartbeat observer records the dispatcher's own rounded integer
duration, committed transaction identity, backend identity, outcome and cadence.
It adds the same recording overhead in each variant. Branch-only nested query
tracking provides separate statement counters; CALL elapsed time includes
intentional sleep and must not be interpreted as CPU or summed with children.
Do not reset production statistics.

Compare empty idle, valid open human game phases, and repeated synthetic
between-hand recovery. These are database workload samples, not a two-browser
latency, egress, frontend presentation or lower-tier capacity qualification.

The primary work/cadence comparison uses the first 96 committed ticks from
each phase (three complete candidate batches). Extra ticks remain in the raw
evidence but are excluded from that equal-count scorecard. Counter snapshots
span each full observed window; those totals use their actual sample count,
not the 96-tick subset. Failed/partial ticks or incomplete sample counts cannot
qualify a comparison. Two idle pairs run in A/B/B/A order.

The mixed test uses actual opening draw/discard RPCs with the synthetic
participant's claims, then deliberately accelerates a void-hand completion
fixture. This is not a complete played hand. Each next invocation must observe
the exact expected successor dealer-game and hand identity; the final successor
must also be verified. Original cryptographic randomness remains enabled.

## Results

All primary rows compare 96 original ticks with 96 candidate ticks. The two
idle pairs use A/B/B/A order on the same disposable instance. Extra observed
ticks are retained. There were 1,053 successful captured workload/slow-test
ticks overall, including 768 primary ticks, each in its own transaction.

| Database workload | Original ms/tick | Candidate ms/tick | Reduction |
| --- | ---: | ---: | ---: |
| Empty idle, pair 1 | 29.61 | 5.57 | 81.2% |
| Empty idle, pair 2 | 30.20 | 4.50 | 85.1% |
| Open two-human Gin table | 28.70 | 4.94 | 82.8% |
| Draw/discard plus next-hand recovery | 38.94 | 8.41 | 78.4% |

The primary candidate windows each used three backends for 96 ticks; the
original used 96 (96.875% fewer recovery backends). Normal inferred start gaps
were approximately 1.013–1.036 seconds originally and 0.999–1.031 seconds with
the candidate. These are observed approximate cadences, not an exact promise.
No duplicate transaction identity or failed/partial tick qualified a sample.

Independent nested statement counters support the heartbeat-duration result:
the idle dispatch call averaged 31.70–31.95 ms originally and 5.38–5.81 ms
with the candidate. Dispatch-associated shared-buffer hits fell from about
2,880–2,885 per tick to 185–215. WAL did not materially improve: original
532–577 versus candidate 534–556 bytes per tick across the full idle windows.
Do not equate elapsed execution time or buffer hits with measured CPU/memory.

Counter snapshots used `(dbid, userid, queryid, toplevel)`, with query IDs
serialized as strings. No counter reset or statement eviction occurred. The
query-statistics snapshot itself caused approximately 16–17 MB of temporary
spill per observed window, so global temporary-byte deltas are probe overhead,
not evidence of game spill. Global database/WAL/session totals also include
service activity and probes; dispatch-specific counters are the attribution
source. Inclusive CALL time contains sleeps and is not added to child time.

## Gameplay and delay checks

Each mixed window performed 12 opening draw/discard sequences (24 genuine RPC
actions with the participant's claims) and 12 accelerated void-hand boundaries.
Both participants acted. Every one of the 24 successors matched its exact
dealer-game/hand identity, appeared once, and belonged to a committed successful
cron tick. The final game was at hand 25, still fake-money and in progress.
There were zero outstanding task or session recovery failures.

- Draw mean/p95: original 37.14/45.18 ms; candidate 32.04/35.79 ms.
- Discard mean/p95: original 15.79/17.80 ms; candidate 14.21/16.14 ms.
- Armed-boundary to successful recovery heartbeat: original mean/max
  619/1,092 ms; candidate 551/1,012 ms (12 observations each).

These are small direct-database samples, not browser latency or complete played
hands. The same session accumulates history across A then B; mixed work was not
repeated in reverse order. No statistically broad latency claim is made.

A three-second lock on the real dispatch-state row, introduced around the late
part of each scheduled window, delayed one original tick to 2,300 ms and one
candidate tick to 2,309 ms. Both recovered without task failure or a catch-up
burst. The candidate completed its delayed batch in 33.36 seconds. All sampled
cron connections retained their existing two-minute timeout. The only failed
cron log entries at the checkpoint were three intentional `job canceled`
handoffs between benchmark windows, not workload errors.

This supplies bounded real-dispatcher headroom evidence alongside the earlier
failure/timeout/restart fixtures. It does not erase the documented behavior:
the whole CALL has one timeout budget, so a late tick has less remaining time
than the old standalone SELECT. Arbitrarily long stalls are not proved safe.

The existing seven-game pause/resume rollback proof also passed. Its first run
reached the final setup-control case, then rejected `create_session:maintenance`
because historical migration data leaves `maintenance_mode.enabled=true` in
a fresh branch. The successful rerun disabled that flag only inside its
rollback transaction; the stored flag was confirmed restored to true. This
fixture prerequisite was not a production configuration or product-code fix.

## Verification and review

The verified bootstrap's 15 batches replayed without a new repair. Before and
after the workload, the measured production-equivalent catalog categories
remained unchanged: 325 existing function definitions/owners, 1,018 columns,
247 constraints, 217 indexes and 135 policies. All 404 normalized permission
records matched after the branch-only alignment. The only extra public/private
routine is the candidate; measurement helpers live in a separate revoked schema.

Read-only review found two test-quality issues, both corrected: comparisons
must reject partial/failed or undersized samples, and subsequent drives must
assert the exact successor identity. Final SQL asserts all successors, including
the last one, against the transaction recorded by the actual cron observer.
All 33 Node tests pass (nine new analysis checks and 24 existing runner checks).
The earlier 11 before/after game-safety proofs remain documented separately;
the candidate and canonical owners were not changed during this phase.

The security advisor reports the previously documented
[mutable procedure search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
for the candidate. A procedure SET clause would prohibit its COMMIT; it remains
SECURITY INVOKER with qualified references and postgres-only execution. The
API roles were verified unable to execute it. No new probe-object advisory was
reported; unrelated inherited advisories were not modified.

At 19:21:29 UTC production job 33 still used its original active one-second
SELECT; the candidate was absent, heartbeat fresh, and recovery failures zero.
Production migration history still had 378 entries ending at `20260908152010`.
No main push, production migration, capacity or billing change occurred.

## Decision and next boundary

The candidate passes this bounded database workload qualification and is worth
a controlled production rollout/measurement. It has not met the plan's exact
same-Small production measurement requirement: this no-data branch has a
smaller/different dataset and configuration (observed shared buffers 256 MB,
max connections 60), and does not reproduce accumulated production history.
No representative browser, egress, memory/swap or smaller-tier trial was run.

Next proposed production scope: install the already-reviewed fixed candidate,
drain and switch only the existing canonical cron job, retain its cadence and
all game/financial owners, and measure matched windows on unchanged Small.
Restore the original SELECT on an ordinary recovery or latency regression.
That rollout still needs explicit production authorization; resizing, plan
changes and the other app remain outside it. Jeremy's two-human smoke is still
production acceptance. Do not claim a smaller bill or Free eligibility yet.

Raw queries, snapshots, tick identities, counters, review corrections, action
and successor evidence, initial maintenance rejection, successful pause proof,
advisories, production check and confirmed deletion are retained at
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/recovery-workload-20260908.json`.
