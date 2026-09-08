# Isolated recovery test bootstrap repair

Approved scope: repair the disposable test setup and resume game-safety proofs;
do not modify production migration history, scheduler, capacity or game data.

Temporary branch `codex-recovery-bootstrap-20260908`:

- Project ref: `rnedxsgvzneejcsjuolb`.
- Branch ID: `8b1cd6d2-7ee5-47f8-8b4e-1cea36a968f6`.
- Parent: `xvhmbuppghwmwpwrkzao`.
- Created September 8, 18:32:39 UTC, without production data.
- Quote: $0.01344/compute-hour plus metered usage, within the existing $1 budget.
- Cleanup: deletion succeeded at 18:45:24 UTC, after about 13 minutes. A fresh
  branch listing contains only the parent's default main branch. All four
  synthetic users and two committed fake-money test sessions were removed
  with the disposable database; no production records were deleted.
- Quoted compute for this branch's lifetime is approximately $0.003. Final
  metered charges are unavailable; this is not an invoice or provider spend cap.

The adapter is test-only and outside the migration directory. It resolves the
two stale July cron IDs by exact job names and consolidates outer transaction
boundaries. It does not replace game rules or modify source migration records.
All cron jobs must be disabled in the replay transaction before commit so legacy
outbound jobs cannot start while the schema is being reconstructed.

## Bootstrap repair and repeatability

The automatic no-data replay stopped after 222 migrations, before version
`20260706213441`. The test adapter is
`supabase/tests/prototypes/isolated_replay.mjs`; its input is the authoritative
ordered migration history, not inferred replacement schema. It prepared the
remaining 156 migrations through `20260908152010`, yielding 1,630 statements.

There are exactly four narrowly scoped adaptation types:

- In `20260706213441`, resolve old cron IDs 7 and 9 by their exact original job
  names. Do not substitute the fresh branch's arbitrary numeric IDs.
- In `20260812022452`, omit only the production-session-specific `DO $repair$`
  block. Its hard-coded historical Holm session cannot exist in a no-data
  branch. Retain the separate `DO $migration$` rule patch.
- In `20260818141237`, omit the embedded fixture between its named SAVEPOINT
  and RELEASE only after observing the original ROLLBACK TO SAVEPOINT.
- Consolidate top-level transaction controls for transactional replay batches;
  do not alter transaction text inside function bodies.

The full replay exceeded the service's request-body limit without modifying
the database. Fifteen bounded transaction batches then completed. An initial
batch-three attempt rejected the historical Holm repair's missing-session
precondition; its transaction rolled back. After adding the exact omission,
the already-applied two-batch prefix was verified unchanged before resuming.
No original local or production migration was rewritten or marked applied.

For another approved disposable branch: verify its non-default project identity
and no-data scope, read the current authoritative history, run this adapter and
its tests, submit bounded batches through the migration API, disable all cron
jobs inside every batch before commit, then compare schema and permissions.
Stop on an unexpected source pattern or schema mismatch. This is a test-only
reconstruction procedure, not a general migration repair or production restore.
The provider's original provisioning status remained `MIGRATIONS_FAILED` even
though the manually reconstructed database was `ACTIVE_HEALTHY` and validated.

## Authoritative parity

Before running the candidate, the disposable database matched production for:

- 325 custom public/private function definitions and owners.
- 1,018 table columns, 247 constraints and 217 indexes.
- 135 row-level-security policies.
- 404 normalized function/table/view/sequence/schema permission records.

Fresh-branch defaults initially differed on 95 permission-bearing objects.
Branch-only REVOKE/GRANT statements aligned those grants with production,
including grant options. Production permissions were not changed. Final checks
after all proofs retained zero differences in these categories except the
one deliberately added candidate procedure. API roles cannot execute it.
These are the measured catalog categories, not a claim that every PostgreSQL
catalog or provider setting was compared.

## Safety results

All 11 rollback SQL proofs pass both before and after installing the runner:

1. Cribbage authority.
2. Gin Rummy authority.
3. Yahtzee authority.
4. 3-5-7 authority.
5. Holm postgame authority.
6. Horses and Ship Captain Crew action authority.
7. Recovery session isolation.
8. Canonical game timers.
9. Canonical recovery scheduler.
10. Real-money fixture exclusion.
11. Secure randomness and Cribbage card integrity.

The ancillary real-money fixture proof initially failed before the candidate
was installed. Its synthetic Chucky hand duplicated J-hearts in another hand;
J-clubs preserves its value while satisfying the existing integrity check.
The test now explicitly checks that integrity. Seeded fixture parity uses
rollback-only deterministic entropy adapters, matching the existing dice-proof
pattern. The separate, unchanged cryptographic-randomness proof passes against
the actual secure functions. A stale Horses direct-client-write compatibility
expectation now asserts canonical RPC-only rejection. No production game rule
or guard was weakened to make a fixture pass.

The scheduler proof accepts either exact approved command, but still requires
one active canonical job at one-second cadence. Read-only review caught a
NULL-unsafe test assertion; it now uses `IS DISTINCT FROM`. A direct NULL
rejection check and the full scheduler proof passed after correction.

All 35 Node tests pass: 11 bootstrap tests and 24 existing runner model/source
checks. No application source changed, so no frontend rebuild was needed.

Rollback fixtures exercise actual owners but are not visible to another
transaction. A separate committed-session test therefore used the real
canonical dispatcher under actual pg_cron CALL batches:

- The malformed Gin deadline stayed at hand 1 with a session-scoped `22007`
  failure; its healthy peer advanced to hand 2 and heartbeat stayed fresh.
- After repairing only that synthetic deadline and retry eligibility, a later
  scheduled tick advanced the failed session to hand 2 and cleared its failure.
- Both sessions finished the test at hand 2, with zero unit/task failures.
  Consecutive actual CALL runs completed successfully in about 32 seconds.
  No manual recovery call was used to advance these committed fixtures.

This proves the committed-session path for Gin, not interactive smoke of every
game. The seven-game rollback proofs and native-cron evidence remain distinct.

## Delivery boundary

The bootstrap blocker and SQL game-safety qualification are resolved. Existing
whole-CALL timeout/workload acceptance and paired whole-loop cost measurements
remain rollout gates; this phase does not establish monthly savings or Free
eligibility. The candidate remains outside the automatic migration directory.
No production deployment, main push, billing or capacity change was performed.

At 18:45:39 UTC production job 33 still ran its original active one-second
`SELECT private.advance_due_game_state();`. The candidate procedure was absent,
the dispatcher heartbeat was fresh with zero unit/task failures, and migration
history still contained 378 records ending at `20260908152010`.

Raw parity snapshots, migration manifest/adaptations, original fixture failures,
successful proof outputs, committed-session queries/results, production checks
and confirmed branch deletion are retained outside the repository at
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/recovery-bootstrap-20260908.json`.
