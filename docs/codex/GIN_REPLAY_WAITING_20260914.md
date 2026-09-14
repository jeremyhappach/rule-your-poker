# Gin waiting lifecycle correction — September 14, 2026

Production migration: 20260914214838_gin_replay_waiting_lifecycle.
Source checkpoint: 0d941fb1b9f686f8a2a68d6de54a41c7d0d403e0.
Scope: Gin replay recording only; no replay UI, other-game recording, or gameplay/scoring rule changes.

## Root cause and correction

The Julius Peppers smoke hand passed its 20-step hand replay, 99–0 scoring,
$10 settlement and historical visibility checks. Subsequent setup decline
cleared game_type to NULL and returned the table to waiting. That owner had
no replay hook, and the existing shared hooks subsequently stopped admitting
the session. A session-end timestamp is neither required nor appropriate for
a waiting table.

Six existing locked authority owners now capture setup decline/configuration,
setup timeout, ante decision/timeout, and postgame participation resolution.
The 17 existing shared hooks retain Gin lifecycle admission while game_type is
NULL. They use the last durable replay identity, preserve actor identity before
nested service-role calls, and retain one atomic append per committed root.
Ante decisions carry ordered intermediate roster facts. A transition opening
the next hand is owned by its new opening checkpoint, which retains the
triggering source, actor and operands. Configuring another game records the
Gin handoff and clears enrollment in the existing UPDATE.

New openings stamp gin-lifecycle/2 alongside gin-replay/1. Old openings retain
their existing behavior; missing old waiting boundaries are not synthesized.
The complete seal still describes captured hand-boundary coverage, not
uncaptured session genesis. No session_ended_at is fabricated or required.
There are no added tables, columns, indexes, client calls, subscriptions or
asynchronous correctness paths. Critical facts remain inside gameplay commits.

## Validation

- 50 actual database exports reconstructed offline with exact score/financial
  reconciliation and historical privacy, after live gameplay rows were removed.
- Original 40 qualified cases plus queued sit-out, decline/reject/duplicate/
  late duplicate, leave/rejoin, fake- and real-money ante timeout, explicit
  ante sit-out, setup timeout, successor opening, other-game handoff, waiting
  termination, and protection of the old incomplete boundary.
- 13 headless tests, app typecheck and production build pass.
- Real-money fixture uses a deterministic test deal and synthetic scheduler
  heartbeat inside a rollback transaction; the production admission guard is
  unchanged. Fixture deletion bypasses only the money-history deletion guard
  inside that same rollback. No real session is changed by these proofs.
- Recovery executes atomically in a rollback proof: existing rows/opening are
  preserved, capture is disabled, and an explicit partial tail is exported.
- Production preflight matched all 25 owner hashes against the deployed base.
  Production has zero lock waiters, no replay publication, and no authenticated
  execution access to the new private helper. Original smoke remains 20 rows.

## Latency gate

Final idle-database comparison: 80 interleaved disabled/enabled samples for
each of five categories, 800 authoritative actions. Timing spans the
authenticated authoritative RPC and its actual COMMIT, including deferred
ledger work; network and fixture preparation are excluded. fsync and
synchronous_commit are on. An earlier run overlapped rollback validation and
is excluded from the gate; its reveal p95 increase was 10.80 ms.

| Action | p50 disabled / enabled ms | Added p50 ms | p95 disabled / enabled ms | Added p95 ms (%) | Max disabled / enabled ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| compound | 6.227 / 8.691 | 2.464 | 7.506 / 10.008 | 2.502 (33.33%) | 10.748 / 13.055 |
| ordinary | 5.643 / 6.774 | 1.131 | 7.009 / 8.622 | 1.613 (23.01%) | 11.714 / 10.212 |
| reveal_void | 6.239 / 10.378 | 4.139 | 7.492 / 12.808 | 5.316 (70.95%) | 9.815 / 15.816 |
| scoring | 124.159 / 127.968 | 3.808 | 135.971 / 138.809 | 2.838 (2.09%) | 188.567 / 438.413 |
| settlement_terminal | 134.028 / 137.805 | 3.778 | 149.899 / 153.834 | 3.935 (2.63%) | 266.090 / 313.383 |

All absolute p95 budgets pass: 10 ms ordinary/compound/reveal and 50 ms
scoring/terminal. Percentages are diagnostic only. One enabled scoring sample
reached 438.413 ms, consistent with sporadic scoring outliers noted in the
prior qualification; there is no repeated tail pattern. This bounded run
does not prove arbitrary session-length or concurrency behavior. The change
adds no indexes or full-journal scans; identity lookups use the existing
session/sequence and round keys. No unrelated scoring optimization was made.

Machine-readable results: supabase/tests/replay/gin-waiting-latency-20260914.json.
Rollback proof: gin-waiting-proof.sql plus gin-waiting-fixtures.sql.
Recovery: gin-waiting-recovery.sql; tested by gin-waiting-recovery-proof.sql.
The generator's originals are frozen deployed definitions, not live data.

Fresh production smoke is pending. Start a new Gin hand, then exercise
waiting through sit-out, setup decline or ante timeout; optionally leave/rejoin.
The older Julius Peppers boundary remains explicitly unfilled.
