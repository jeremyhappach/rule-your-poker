# Remaining recovery-cost investigation — September 8

Historical phase record: this read-only investigation led to the subsequently
approved scheduler-reuse design, qualification and production rollout in
`RECOVERY_ROLLOUT_20260908.md`. The findings below describe the earlier
investigation boundary, not the current deployment status. Billing is unchanged.

## Findings

Production project `xvhmbuppghwmwpwrkzao` remains on Small. Cron job 33 runs
`SELECT private.advance_due_game_state()` every second. Ten consecutive
successful runs, 3459938–3459947 at 16:29:40–16:29:49 UTC, used ten distinct
backend PIDs. Existing five-minute counters also show approximately one new
database session per tick. The deployed owner, worker order and safety rotation
match the checked-in migrations.

Every tick evaluates eight admission categories in order, running each due
owner plus one rotating safety owner. Each admission check occurs immediately
before that owner's possible execution. Preserve that interleaving: an earlier
worker can change what a later worker must do within the same tick.

Fresh-connection read-only tests of all eight deployed checks:

| Trial | First pass | Second pass, same connection |
| --- | ---: | ---: |
| 1 | 20.587 ms | 10.550 ms |
| 2 | 26.760 ms | 12.969 ms |
| 3 | 25.181 ms | 11.920 ms |

An eight-cycle same-connection test measured 22.732, 10.721, 9.807, 9.563,
9.774, 10.595, 3.437 and 3.467 ms respectively. Every category was false
throughout. The final two cycles are approximately 85% below the first for
admission checks only. They are not an 85% whole-scheduler, resource, bill or
gameplay improvement. This test did not prove a connection-reusing runner,
separate commit-per-tick semantics, restart behavior or production safety.

Separate EXPLAINs of the eight plain SELECT predicates total 26.715 ms planning
and 6.536 ms execution. Those fresh-connection plans cannot be added to or
subtracted from a production tick as an exact decomposition. They support the
first-versus-warm evidence of substantial repeated preparation cost. Production
has `pg_stat_statements.track=top`, planning tracking off and function tracking
off; no settings or statistics were changed to obtain this evidence.

[PostgreSQL documents session-local PL/pgSQL plan caching](https://www.postgresql.org/docs/current/plpgsql-implementation.html).
[pg_cron documents per-job connections/workers and serialized instances of a job](https://github.com/citusdata/pg_cron#how-pg_cron-works).
Together with the live backend identities, these support loss of reusable
plans across fresh ticks. This does not identify the initiating cause of the
September 7 memory/I/O incident or the earlier egress overage.

## Alternatives tested, not shipped

### Single generic CASE plan — rejected

A session-local prepared statement combining the eight predicates, with
`force_generic_plan` confined to the read-only probe transaction, measured
26.479, 30.642 and 26.947 ms. Equivalent current-function control batches
measured 23.728, 23.981 and 24.968 ms. The prototype was slower. It is not a
recommended function rewrite or configuration change. Its known-task-only
comparison is not a full behavior/authorization proof.

### 3-5-7 guaranteed-no-op visits — retain as a smaller candidate

The unscoped worker selects 65 sessions, including 50 terminal sessions with
no current dealer-game UUID. `three_five_seven_recover_game` locks each game
before reaching its final `nothing_due` return for those identities. No
recovery-unit failure exists for these 50 sessions in the inspected snapshot.

A read-only candidate retains ante/in-progress work, terminal identities and
matching `1:<game UUID>` failure cleanup, then materializes those candidates
before testing retry deferral. It selects 15 sessions instead of 65. Selection
execution is 2.509–2.624 ms / 328 buffer hits versus 3.994–4.019 ms / 461 hits.
A non-materialized version offered no consistent improvement and is rejected.

This does not measure the saved worker-loop locks/calls or whole ticks. Any
implementation must also preserve explicitly scoped calls and pending terminal
work. Deployed call-site inspection finds only the canonical task runner;
repository calls outside it are in the 3-5-7 rollback proof. No historical
session was deleted, ended, repaired or manually recovered.

### Cribbage worker selectors — selective benefit only

The materialized-current-authority pattern was tested as plain SELECTs against
five selectors without altering either worker function:

| Selector | Current execution | Candidate execution |
| --- | ---: | ---: |
| Bot discard | 3.415 ms | 4.418 ms |
| Bot pegging | 3.925 ms | 4.923 ms |
| Ready counting | 8.057 ms | 1.704 ms |
| Complete settlement | 4.380 ms | 1.133 ms |
| Pending terminal counting | 5.568 ms | 0.991 ms |

Reject the two bot-selector variants; they worsen time and buffer work. The
three human/terminal selectors together fall from 18.005 to 3.828 ms in these
single-plan samples. Their action bodies, authorization, order, limits,
identities, retry deferral and settlement behavior were not changed or tested
by this query-only comparison. No temporary-file spill appeared in these plans.

At one safety visit per eight idle ticks, this selector-only saving corresponds
to approximately 1.77 ms/tick, or 4–5% of the earlier whole-loop mean. That is
an estimate, not a deployed measurement; it does not justify claiming the
plan's 80% whole-scheduler target has been reached.

## Existing live ticks

Twenty-four distinct completed ticks sampled at 16:25:09–16:25:43 UTC had
these total dispatcher durations grouped by safety slot:

- Holm: 28–30 ms (3 samples).
- Gin: 29–30 ms (5).
- Yahtzee: 37–46 ms (3).
- Horses/SCC: 26–29 ms (4).
- Session abandonment: 27–28 ms (2).
- Canonical timers: 35–37 ms (2).
- Cribbage: 54–58 ms (3).
- 3-5-7: 48–49 ms (2).

These are whole ticks, not isolated worker measurements. Admission was false
at the surrounding checks; no per-tick admission trace or controlled matched
workload was added. At 16:29:50 UTC liveness remained healthy, admission allowed,
with no active recovery failures or overdue timers.

## Recommended next boundary

Follow-up: Jeremy approved this bounded design/proof phase on September 8.
Its completed isolated evidence and still-unqualified production boundaries are
in `RECOVERY_RUNNER_DESIGN_PROOF_20260908.md`. The recommendation below records
the preceding profile's stop point, not a request to repeat that approval.

The approved cost plan explicitly requires reporting before expanding into
scheduler infrastructure when startup/preparation dominates. Stop here for
Jeremy's direction. Do not deploy the marginal query variants merely to show
another percentage improvement.

Recommend a bounded design and isolated proof of reusing a database execution
context across ticks. No particular runner design has been selected or proven.
That next phase must preserve:

- one scheduler and canonical dispatcher; no competing owner or work registry;
- one-second checks, existing due times and rotating safety discovery;
- a separate committed transaction per tick, with no long-held game locks;
- per-owner admission/action ordering, advisory locking and failure isolation;
- fresh authoritative state between ticks, pause/reconnect and exact identities;
- original watchdog/admission guarantees during crash, restart and deployment;
- replay-safe settlement, financial guards and all-seven-game recovery proofs.

Long transactions, queued overlapping cron runs, one-minute blind spots and a
second fallback scheduler are not acceptable shortcuts. The first deliverable
is a supported design and bounded proof, not production cron changes. If the
platform cannot meet these constraints, report that and retain the current
scheduler. No billing, capacity, transfer, backup or paid-tool change is included.

Raw definitions, query plans, SQL prototypes and counters are retained at:
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/remaining-recovery-profile-20260908.json`.
Probes invoked SELECT-only predicates; prepared statements and diagnostic
settings were transaction-local and rolled back/deallocated. No gameplay
mutator was invoked manually, and no persistent database schema was changed.
