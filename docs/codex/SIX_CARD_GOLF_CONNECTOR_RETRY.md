# Golf connector retry — October 21, 2026

Release remains blocked: **14 of 16 hosted candidate units passed**. The
three-player mixed real-money unit failed at fresh Run Back with
`real_money_liveness_unavailable:scheduler_heartbeat_stale`; the four-player
mixed real-money unit was not run. No Golf installation, main integration,
push, deployment or account grant occurred. The 24-hour smoke window has not
started. No new PostgreSQL credentials are needed for the connector path.

## Reconciled baseline and unchanged product

The candidate incorporates released main
`55a896b1f84fcd31d32a1a135622af99fca1a3c9`, including 11 Up smoke controls
installed as hosted migration `20261021221415`. Production was verified READY
at deployment `dpl_9zW6AZqfvdw19eBYnDnDouXB5ikH`,
`https://ptown-poker-fg1axjcwp-jeremy-8e2b.vercel.app`, with that main SHA.
All eight shared-authority preimages matched the existing Golf guards.

Golf migration source remains byte-identical:
`supabase/migrations/20261021011905_six_card_golf_v1.sql`, SHA-256
`95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.

Approved rules, prolonged-play policy, privacy, financial contract, deliberate
pauses, admission and money-mode gates are unchanged. The unrelated Cribbage
snapshot change remains outside this work.

## Connector correction and fixture reconciliation

The connector now sends prerequisite checks and indexed temporary baseline
capture as top-level statements, followed by candidate rehearsal/assertions in
the intentional rollback block. Everything stays in one connector request and
one repeatable-read transaction. Limits remain 15 seconds per statement,
100 milliseconds for locks and 20 seconds idle in a transaction. No cross-request
session affinity is assumed.

All sixteen units, full bidirectional existing-record comparisons, financial
assertions, definition/catalog fingerprints, bot-finish metrics and both evidence
receipts remain mandatory. Temporary helper functions/sequence are explicitly
removed after successful rehearsal rollback.

Production enables Make It Take It. A bot win or shared tie can therefore enter
canonical dealer selection before Run Back. The mixed test fixture now invokes
the existing prepare/advance owners and waits the actual three-second
presentation hold. No setting, product owner, clock or health guard was changed.
Hosted mixed-fake-3 and mixed-fake-4 each exercised one such dealer draw.

## Executed evidence

- Corrected connector local test passed same backend/snapshot, repeatable read,
  propagated failure, rejected preservation changes, rollback, temporary-state
  cleanup and live-service prerequisite rejection. Its 8.1-second preparation
  plus 8.1-second rehearsal passed in **16,232 ms** under the unchanged
  15-second per-statement limit.
- Six production-package tests passed, including the complete matrix and evidence
  rejection requirements.
- Local installed-authority and released-game regression proofs passed on the
  new baseline: **409 existing function/permission entries** preserved except
  the two intended additive Golf registrations; Battle financial cases, Race
  rules/financial/v2 controls and 11 Up Ready controls passed. The local baseline
  contains no defaults, so it does not establish hosted defaults preservation.
- Full build passed TypeScript, **2,629 application tests**, **241 harness tests**
  and production compilation. This build preceded the final test-fixture-only
  dealer-draw correction; no product code changed afterward.
- Hosted candidate passes: core, financial, recovery, qualification; human
  fake/real 2/3/4; mixed fake 2/3/4; mixed real 2. Each passing unit returned
  existing-record preservation and rollback receipts with matching fingerprints.
  Mixed fake 2 and 3 each recorded an actual bot finish.
- The qualification unit initially hit the 100-ms lock timeout. Rollback was
  checked and one bounded retry passed. This initial failure remains recorded.
- Mixed real 3 failed; mixed real 4 was not attempted. These partial receipts
  cannot satisfy the complete release validator.

Machine-readable receipts, the exact generated manifest, failure detail and
readbacks are in
[`hosted-retry-20261021.json`](../../dev/six-card-golf/evidence/hosted-retry-20261021.json).
The full connector error, generated SQL and local logs remain in ignored
`qualification.local/six-card-golf/`.

## Exact remaining blocker

At fresh Run Back, `public.golf_configure` updates the session to
`ante_decision`. The existing
`private.enforce_real_money_liveness_admission` trigger rejected that transition:

- Check time: **2026-10-21 22:42:14.238538 UTC**.
- Visible scheduler completion: **22:42:01.139137 UTC**, age **13.099401 s**.
- Deployed freshness requirement: **10 seconds**.
- SQLSTATE: **55000**. No overdue timers, session failures, active failed tasks,
  or consecutive partial scheduler failures were reported.
- Failure occurred after **14,963 ms** of connector wall time, not as a
  statement-timeout error.

Repeatable read keeps the initial committed heartbeat visible as the fixture
plays and waits through terminal/dealer-selection holds. However, cron history
also shows a canonical `advance-due-game-state-1s` call from **22:42:05.176336**
to **22:42:37.221198**, succeeding after roughly **32 seconds**, spanning this
failure. Other game recovery jobs succeeded during the interval. Therefore this
evidence does **not** isolate the stale snapshot as the sole cause or prove
uninterrupted canonical dispatcher freshness. The cause of that overlapping
long dispatcher call is not established by this attempt.

A later read at **22:45:02.097591 UTC** found the actual canonical heartbeat
completed at **22:45:01.545002 UTC**, duration 5 ms, zero consecutive partial
failures. Independent residual checks found no Golf authority, migration or job
and zero campaign users, profiles or games. Failed rehearsal rolled back.

The smallest remaining work is a bounded qualification-protocol investigation:
establish whether the rehearsal contributes to dispatcher delay and obtain full
Run Back coverage with genuine current liveness while preserving repeatable-read
containment and the approved limits. Do not fake/refresh health, bypass guards,
shorten canonical holds, change isolation, omit Run Back or waive a unit to pass.
No production product bug or completed release is claimed.

After all candidate units pass, installed-authority proofs, live authenticated
transport/Realtime and independent-client races, actual Golf cron zero-client
settlement/continuation, matching app/database publication, and scoped admission
verification still remain required. Only then may the reserved Hap/Gmail
24-hour play-money smoke scope open; real money and other accounts stay closed.
Jeremy's production/physical-iPhone acceptance remains pending.
