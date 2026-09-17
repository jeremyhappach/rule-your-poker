# Tonight's temporary live timing capture

Approved September 16 with a 30-minute execution budget. Observation expires
September 17 at 12:00 UTC (07:00 Central). Replay and missing-card diagnostics
continue after this timing window. No game rules, journal bodies, completeness
seals, financial owners, indexes or subscriptions change.

## Recorded measurements

- Gin RPC dispatch to response headers (includes network and server commit).
  Ordinary action wrappers additionally record parsed response time. A matching
  rendered action count plus two animation frames records a paint opportunity,
  not animation completion or an independently verified physical display.
- Six replay boundary helpers report cumulative elapsed work in two response
  headers: opening, transition, transfer annotation, postgame, shared begin/end.
  Helpers include checkpoint/delta construction and journal inserts. These
  durations exclude COMMIT/deferred work, caller-side context setup and work
  outside the measured helper bodies. The controlled replay-disabled/enabled
  qualification remains the measure of total incremental replay overhead.
  Independently scheduled server jobs have no browser response and are not
  covered by the browser timing stream.
- Holm/3-5-7 samples measure geometry binding, card scan, comparison and history
  maintenance. Supported browsers also report long tasks. Unsupported engines
  do not supply long-task measurements. Each browser/hand emits a mounted
  coverage receipt; actual scan samples prove the monitor performed checks.
- Build, client, viewer, session, round, action type/count, foreground status
  and timing values are allowed. No card faces, action card operands, auth
  tokens or raw responses enter these records.

`live-play-timing-v1` batches use existing `debug_events`, outside gameplay.
At most 128 samples/batch, eight retained batches, three delivery attempts,
two batches per flush; normal flush cadence is 15 seconds. Sampling stops at
expiry. Queue delivery is best effort and scoped to the same signed-in viewer.
Missing-card incidents retain their independent existing queue and retry policy.

## Qualification and migration

Production migration `20260917001256_gin_live_replay_timing_observation` pins
the six deployed owner hashes before replacement and preserves their bodies
apart from optional timing calls. The new helper is private and not executable
by authenticated clients. Malformed optional timing metadata is fail-open.
Existing response headers are retained; real browser tests verify CORS exposure.

Rollback proof covers rejected/duplicate actions, void, knock/layoff, undercut,
gin, bots, continuation, terminal and shared waiting paths. Twenty-eight actual
exports reconstruct offline, reconcile scores/edges, preserve historical
visibility and remain readable after live rows are removed. Rule proof passes
again after deployment. Production health check found no lock waiters.

Interleaved instrumentation disabled/enabled comparison (replay enabled in
both arms), 14 retained samples per arm/category after two warmups:

| Action | Disabled p95 ms | Enabled p95 ms | Added p95 ms |
|---|---:|---:|---:|
| Ordinary | 8.594 | 9.174 | 0.580 |
| Compound | 11.853 | 12.475 | 0.622 |
| Reveal/void | 15.022 | 16.887 | 1.865 |
| Scoring | 252.995 | 282.751 | 29.756 |
| Settlement/terminal | 277.147 | 278.194 | 1.048 |

This bounded instrumentation check measures authoritative calls plus forced
deferred constraint work within a rolled-back transaction; it excludes actual
COMMIT and network. It does not replace the earlier commit-inclusive replay
qualification or establish statistically strong tail behavior. All absolute
10/50 ms budgets pass. No unrelated scoring optimization was made.

Application tests: 238 files / 1,627 tests; harness: 10 files / 150 tests.
Focused tests prove expiry, sample caps, UUID-preserving retries, same-viewer
delivery, no gameplay retry and card-operand exclusion. Typecheck and production
bundle pass. Phone-width preview returns 200 with no JS page errors.
Initial development-server browser navigation timed out before login/game
creation; that failed evidence is retained. Production-bundle two-client checks
pass for Holm, 3-5-7 and Gin: both viewers deliver timing; each card game records
exactly one injected missing-card incident; browser Gin records contain actual
server replay durations (CORS verified). A final Gin repeat also requires both
RPCs' paint-opportunity records: same-count confirmed projections must retrigger
the observation effect after an optimistic render. It passes. Synthetic sessions are blasted, then
their retained journal/diagnostic rows are explicitly removed by exact UUID.

## Recovery and tonight's use

Client fallback is commit `d2276af2c7727f2f355a810d4e9ef43aeb277ca1`.
`supabase/tests/replay/live-timing-recovery.sql` restores the exact six prior
definitions and drops only the optional timing helper. It leaves every replay
row and authoritative game record untouched. Automatic expiry is also a safe
way to stop observation without changing replay capture.

Both players must reload the published build before play. Verify records from
both actual phones after they enter the table; synthetic-client delivery is not
proof either phone refreshed. Missing-card coverage does not depend on wartime
UI and cannot guarantee capture of a killed browser or GPU-only failure.

Evidence: `artifacts/live-timing-*`, `test-results/live-timing/`, and
`supabase/tests/replay/live-timing-overhead-20260916.json`.
