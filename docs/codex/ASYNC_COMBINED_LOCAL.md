# Combined async release — local checkpoint, October 28, 2026

Approved scope: styled invitation configuration/acceptance; repeated children
from Ptown Words, Run21, TriTowers, Quintzee and Box Drop; active human opponents;
and creator-only Delete for both players at every fake-money match status.
Ship these together. This checkpoint is not published or production-qualified.

**Authorization reassessed:** the missing-owner-context hold is cleared for the
existing combined fake-only release. The supplied authenticated owner history
includes the request for all three additions to release together, plus Quintzee,
Box Drop, creator-only deletion and human-only discovery. Root supplied its
independent `user_message.read_messages` verification provenance for the initial
scope/release requests: request `1a1573c1-413b-4499-a47a-9b36d04a9986`, verified
October 28 at 23:44:56 UTC, complete/nondeleted records by the same authenticated
user. This new evidence resolves the earlier routing prompt's missing context;
acceptance of routing alone was not the basis for clearing the hold.

The approved continuation covers hosted qualification, qualified closed migration,
worker deployment, combined publication and guarded five-game activation after
all release gates pass. No new owner approval is needed for that unchanged scope.
No actual production action has been attempted or newly denied in this task.
This informational reassessment executes none. Any actual future action denial
must be stopped and reported, not bypassed. All financial, cleanup and exact-SHA
release gates below remain mandatory.

## Financial and lifecycle contract

Acceptance freezes each child's stake and versioned configuration without
reserving funds, moving chips, creating financial history or checking available
balance. Immutable authoritative child results distinguish normal completion,
draw and forfeiture and contain signed zero-sum outcomes. Parent match-to-date
is provisional. Only the parent finalizer aggregates all expected results and
invokes the unchanged canonical accounting owners in one transaction. Existing
negative-balance behavior remains intact. Zero net has a receipt without a
transfer batch. Child detail is retained for audit/disputes.

The parent row lock and unique settlement receipt provide exactly-once effect;
the underlying chip helper is not independently idempotent. Concurrent last
children serialize at the parent; a post-chip failure rolls the whole operation
back. Replay returns the committed receipt. No child-level financial transfers.

Delete is a recoverable immutable tombstone, authorized only for the creator of
a fake-money match. Unfinished parents become cancelled; settled status and all
prior receipts/results remain. Both lists and notifications hide the match and
gameplay rejects it. Deletion creates no settlement and reverses none. It shares
the parent lock: deletion winning prevents settlement; settlement winning is
retained before hiding. No customer match was deleted during qualification.

Preserve 36-hour availability, Last Call at 24 hours, child-only forfeiture,
persisted random starters and persistent parent notices. Shared gameplay clocks
remain distinct from availability; an earlier gameplay deadline is resolved
before availability expiry. Async banks remain excluded. Async remains fake-only;
live Words real money and ordinary synchronous accounting remain unchanged.

## Owners and activation

- `AsyncInvite.tsx` and `Delayed.tsx`: capability-driven lineup, acceptance,
  provisional home, creator confirmation and removal navigation.
- `server/delayed`: shared Run21 rules and existing SQL TriTowers/Quintzee/Box
  rule cores, private board projection, revision/segment/request validation.
- `api/delayed.ts`: verified Auth identity and service-only commit boundary.
- `supabase/delayed/combined-*.sql`: human admission, immutable removal,
  service-only core/commit, coordinated recovery and safe projections.
- `supabase/functions/delayed-recovery`: single-use dispatcher claim, bounded
  recovery and completion acknowledgement. Existing Words recovery remains.
- Migration `20261028232744_async_combined_five_games.sql`: 18 exact deployed
  preimage guards; multi-game activation defaults closed. Not installed.

Human eligibility uses active profile plus canonical Auth UUID. Current bot
profiles have no Auth user; name heuristics are not used. The existing schema's
32-child ceiling is retained as an engineering bound, not a newly asserted owner
policy. Admission and acceptance both enforce the server capabilities.

## Local evidence

Disposable database `async_five_1793229967398`, reconstructed from the earlier
Words fixture with read-only deployed shared-rule definitions. Fixture preimages
under `dev/async-combined` are not production migration payloads.

Passing proofs: interim zero financial writes; signed nonzero and zero-net
settlement; negative chips; canonical ledger conservation; concurrent last
children; injected failure/rollback/retry; 32 obligations; authorization; six
deletion statuses and both deletion/settlement race orders; human pagination and
direct bot denial; all five admissions; shared normal/timeout gameplay and bonus
boundaries; opponent privacy; recovery token replay denial; measured incident
deadline and celebration shifts. Recovery HTTP is stubbed only inside local
rollback proof. No hosted migration or production data mutation occurred.

Browser proof used actual shared views and committed actions for the four new
adapters, completed-round presentation, reload, five-game invitation/acceptance,
both-viewer deletion updates, and 320/390/1440 layout checks. Latest passing match
`07d2cdc5-809a-4936-9d46-85045e400a3b` is synthetic/local. Screenshots and outputs
are in `qualification.local/async-combined`.

Validation: 453 source files / 3,136 tests passed with four workers; 241 harness
tests, nine adapter tests, application typecheck and production bundle passed.
The initial unrestricted parallel source run timed out; the bounded full rerun
passed. Standalone node-tsconfig checking reports existing unrelated alias/Mega
settings errors; API/worker bundles and local runtime proofs are separate evidence.
Final review corrected Box Drop's completed-round label to its retained result
round; final browser proof and application typecheck passed afterward. Following
main reconciliation, the first integrated run finished with 3,143 passes and six
timeouts in the existing Run21 local authority tests. Its log is retained as
`qualification.local/async-combined/integrated-source-tests.log`.

## Local timeout investigation and controlled qualification

Investigation started from `9cdbb6121f83f8c9aca2cb20082111ea287c8238` without
changing runtime code, test assertions or test timeouts. Run21 authority, engine,
bot and the affected test file are unchanged from the published Words base.
These tests simulate entire multi-round competitions, including the bot's
expected-value calculation, journal copies, replay and settlement. The fixture
advances a manual game clock while authority background timers use wall time.

Evidence retained under `qualification.local/async-combined`:

- `authority-isolated-1.log`: unchanged single-worker file, 14 passes/four
  timeouts while another compiler process was present; 142.08 seconds.
- `authority-isolated-2.log`: unchanged rerun reproduced the frozen-105 timeout;
  stopped after reproducing it to avoid letting further timeout work accumulate.
- `authority-diagnostic-frozen105.log`: isolated failing case passed in 947 ms.
- `authority-diagnostic-all.log`: temporary timing instrumentation, 18 passes in
  27.57 seconds. The two long cases used about 10.5 CPU seconds each and completed
  in 11.2/11.4 wall seconds. This instrumented run is diagnostic evidence, not a
  substitute for the original suite.
- `authority-isolated-3.log`: unchanged file, all 18 passed in 91.17 seconds;
  long cases completed in 39.9/43.2 seconds, below their existing 60-second limits.
- `authority-manual-driver.log`: temporary automatic-timer-disabled comparison,
  18 passes in 37.13 seconds; the frozen-105 case still approached five seconds.
  Disabling timers was therefore not established as a complete correction.
- `integrated-controlled.log`: original, unmodified suite with `--maxWorkers=2`,
  no overlapping typecheck/build: **455 files / 3,149 tests passed**, 223.30 seconds.
  Run21's 18 cases passed in 39.78 seconds, including all six former failures.

The supported diagnosis is wall-clock performance sensitivity in an existing
simulation proof, rather than a reproduced gameplay/accounting assertion defect.
Concurrent compilation was observed, but no single external process was proven
to explain every slow run. Vitest's timeout wrapper rejects without cancelling
the test body; the fixture does not consume its abort signal, so a timeout can
leave simulation work overlapping later cases. This is a possible amplification
mechanism, not evidence of a new delayed-game state owner defect.

No speculative product fix, timeout increase, skipped test or failure waiver was
introduced. Temporary diagnostic copies were removed. All failed-run logs remain
available; the controlled integrated pass is the acceptance evidence for this
local phase. Future CI timing failures still require investigation.

Sequential integrated validation then passed: application typecheck
(`controlled-typecheck.log`), nine delayed adapter tests
(`controlled-adapters.log`), 241 harness tests (`controlled-harness.log`), and the
production bundle (`controlled-bundle.log`). The self-contained recovery-worker
bundle also passed, 16,891 bytes; it was not deployed. Runtime/test source is
unchanged from `9cdbb6121`; this follow-up changes only qualification documentation.
No hosted database write/proof, migration install, deployment, push or activation
was attempted, and no customer state was touched.

## Remaining release gates

1. Latest main `a79c40497` is reconciled, preserving its SCC/Horses incident
   changes. Only additive release/index documentation conflicted; both entries
   were retained. Integrated source validation is recorded separately from the
   earlier 3,136-test run. Before any release, verify then-current main and
   serialized publication ownership again. The missing-owner-context hold is
   resolved as documented above; qualification and publication gates remain.
2. Inspect deployed migration history and build/run hosted rollback qualification
   against current authority,
   including actual canonical accounting triggers and deferred constraints.
   Install `20261028232744` closed only if unapplied and qualified, then rerun
   installed proofs and verify all synthetic fixtures are removed.
3. Deploy/verify the bundled recovery worker and complete the full combined
   code release through serialized main publication; verify exact SHA READY,
   public manifest, publisher and persisted release signal before activation.
4. Activate multi-game capability only after worker/code/database qualification
   and exact release evidence agreement. Verify ordinary eligible-human admission,
   scheduled recovery and synthetic cleanup. Jeremy performs physical-device,
   sound and terminal-flow smoke. No customer deletions, wagers, account/session
   corrections, real-money async or async banks are included.

To stop new admission after activation, close the existing release admission
gate while preserving recovery for accepted matches. Do not disable recovery or
roll the client back to Words-only with accepted mixed matches outstanding.

This remains a local checkpoint with production gates incomplete. No production
success or authorization is implied by passing local tests.
