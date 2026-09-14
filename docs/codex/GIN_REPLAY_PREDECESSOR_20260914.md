# Gin predecessor completion checkpoint — September 14, 2026

Status: implemented and functionally verified; **not deployed**. The mixed-
workload reveal/void performance gate failed. An isolated diagnostic passed,
but does not supersede that failed gate. Production remains at
20260914214838_gin_replay_waiting_lifecycle and commit5e7f16d02.

## Scope and contract

Addison Russell's first hand ended at replay sequence35 with round.status
betting. The authoritative next-hand owner changed it to completed while
recording only the successor opening. This candidate records that actual
predecessor update before the existing next-hand opening, in the same
authoritative transaction. No old journal rows are updated or backfilled.

Only private.gin_start_next_hand_core changes, alongside one new private
helper. The existing UPDATE returns the actual predecessor row. One indexed
tail lookup and a diff of the round envelope produce gin.predecessor_completed,
with a stable source key, actor/system origin, predecessor/successor identities,
gin-continuation/1 operands, and a complete closing checkpoint. The separate
successor opening is still appended by its existing owner. Those are two
checkpoint transitions in one commit. Other actions remain one append each.
There are no schema/index/client changes, current-game rules recalculation,
card projection, new subscriptions, or asynchronous correctness work.

The helper preserves the prior seal and financial/score/card facts, and only
changes the recorded round envelope and continuation disposition. Uncaptured
or partial predecessors are not promoted. Duplicate and late requests return
through existing guards before reaching this helper. Already-completed smoke
sessions remain untouched.

## Functional and recovery proof

- Candidate DDL and all fixtures first ran inside a rollback transaction.
- 74 database exports pass both before and after applying the candidate to the
  disposable database. The original 50 remain, plus 24 two-hand exports.
- New cases: scored and voided predecessors, system continuation, authorization
  failure, duplicate and late duplicate calls, terminal continuation rejection,
  exact completed-round/Gin-state comparison for both hands.
- A forced error in successor opening rolls back both the predecessor journal
  append and its authoritative row update, as well as successor creation.
- Public and both participant packages remain identical after live game rows
  are deleted inside the rollback fixture.
- Nine combined two-hand packages reconstruct with the deployed contract in
  an isolated JavaScript context with no network/database/filesystem access.
  Both authoritative ending round statuses are completed; scores and financial
  edges reconcile across the handoff.
- 13 focused tests, installed TypeScript app check, and Vite production build
  pass. The default tsgo entrypoint was unavailable; the existing tsc was used.
- Existing gin-waiting-recovery-proof.sql passes with this candidate: recovery
  preserves journal rows, appends a partial tail and disables capture. The new
  private helper remains revoked and unused after recovery.
- After removing the temporary benchmark opening hook, the focused 24-export
  proof passes again.

Reproduction assets are in supabase/tests/replay/gin-predecessor-*.sql,
build-gin-predecessor.mjs, gin-predecessor-originals.json and
verify-gin-predecessor.mjs. Original definitions are frozen deployed SQL, not
production player data. No production migration file is created until the
qualified candidate can be applied and its actual migration version recorded.

## Performance — deployment gate remains closed

Full mixed run: 80 interleaved disabled/enabled samples for each of six
categories, 960 actual RPC-plus-COMMIT timings. A temporary branch-only hook
suppresses successor opening in the disabled arm; outside the timed region,
assertions prove zero measured baseline appends, one enabled append for each
ordinary action, and two enabled checkpoints at continuation. No such bypass
belongs to the production candidate. fsync and synchronous_commit were on.
Fixture work and client/network overhead are excluded. No database validation
ran concurrently with this benchmark.

| Action | p50 off / on ms | Added p50 | p95 off / on ms | Added p95 (%) | Max off / on ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| compound | 11.661 / 14.242 | 2.582 | 17.179 / 19.888 | 2.709 (15.77%) | 17.609000 / 20.592000 |
| continuation | 29.784 / 34.504 | 4.720 | 43.047 / 48.384 | 5.337 (12.40%) | 53.043000 / 52.019000 |
| ordinary | 10.675 / 11.943 | 1.268 | 15.544 / 16.735 | 1.191 (7.66%) | 18.964000 / 33.105000 |
| reveal_void | 11.812 / 22.541 | 10.729 | 17.447 / 33.936 | 16.488 (94.50%) | 19.248000 / 35.192000 |
| scoring | 150.691 / 162.571 | 11.880 | 161.043 / 175.665 | 14.622 (9.08%) | 172.732000 / 193.405000 |
| settlement_terminal | 171.263 / 184.709 | 13.446 | 191.073 / 207.264 | 16.191 (8.47%) | 194.848000 / 214.275000 |

Continuation passes the stricter 10ms budget at +5.337ms p95.
Reveal/void fails it at +16.488ms. The latter path is unchanged by this
candidate. Scoring/terminal remain below their 50ms added-p95 budgets.

One bounded isolated reveal/void diagnostic (80 pairs) measured:
p50 6.537 /10.832ms; p95 7.104 /11.534ms; added p95 4.430ms (62.36%);
max9.655 /12.116ms. Both baseline and enabled calls were faster than in
the mixed run. No causative deployment change or environmental mechanism has
been established for that difference. It is not valid to discard the mixed
failure merely because the isolated run passed.

At diagnostic inspection, cron jobs were disabled and no competing active
client query or lock wait was present; pg_net's background worker was active.
This snapshot does not establish what caused timing variation during the run.
No long-session or broad concurrency claim is made.

Next bounded work: determine why the existing reveal recorder exceeds the
absolute budget under mixed workload, then qualify the complete candidate
before production deployment. Do not broaden into other games or scoring
refactors. Machine-readable results retain both runs, including the failure.
