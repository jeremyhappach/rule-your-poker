# Combined async release — local checkpoint, October 28, 2026

Approved scope: styled invitation configuration/acceptance; repeated children
from Ptown Words, Run21, TriTowers, Quintzee and Box Drop; active human opponents;
and creator-only Delete for both players at every fake-money match status.
Ship these together. This checkpoint is not published or production-qualified.

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
round; focused final validation is recorded in local logs.

## Remaining release gates

1. Latest main `a79c40497` is reconciled, preserving its SCC/Horses incident
   changes. Only additive release/index documentation conflicted; both entries
   were retained. Integrated source validation is recorded separately from the
   earlier 3,136-test run. Coordination hold was cleared; no new product approval
   is required for the existing scope.
2. Build and run hosted rollback qualification against current authority,
   including actual canonical accounting triggers and deferred constraints.
   Install the guarded migration closed, then rerun installed proofs.
3. Deploy/verify the bundled recovery worker and complete the full combined
   code release through serialized main publication; verify exact SHA READY,
   public manifest, publisher and persisted release signal before activation.
4. Activate multi-game capability only after worker/code/database qualification;
   Jeremy performs physical-device, sound and terminal-flow smoke.

To stop new admission after activation, close the existing release admission
gate while preserving recovery for accepted matches. Do not disable recovery or
roll the client back to Words-only with accepted mixed matches outstanding.

Local work stops at the repository execution-budget checkpoint with release
gates incomplete. This is not a release approval request or a production success
claim. Continue the remaining qualification under the existing approval.
