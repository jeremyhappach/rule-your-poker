# Golf production qualification preparation — 2026-10-21

This package prepares local artifacts only. No production write, integration
into main, push, deployment, admission activation or new credential is authorized
by this preparation task. The game and financial contract are unchanged.

## Pinned candidate and production observations

The candidate incorporates main `0d9469ecc24345175b3cb07052d16283a1c4f42c`,
preserving its Box Drop numeral correction. The release-note conflict was
additive and both workstreams remain documented.

Migration: `supabase/migrations/20261021011905_six_card_golf_v1.sql`.
Exact SHA-256:
`815408fbc2cf2a37948b87a91656fc7d56e1d546d28e8f45c48961fd1c73e121`.
The preparation does not modify this migration.

The preceding read-only inspection on October 21, about 08:15 CDT, found all
seven shared-function guard hashes matching production, pg_cron 1.6.4, logical
WAL, Realtime publication, required helpers and a fresh actual canonical
scheduler heartbeat. Golf had no production migration, tables, job, sessions
or results. Main and the READY production deployment were `0d9469ecc...`.
These observations must be refreshed at execution; they are not proof receipts.

## Offline tools and exact operation

From this worktree root:

```text
node dev/six-card-golf/production-proof.mjs
node --test dev/six-card-golf/production-proof.test.mjs
node dev/six-card-golf/production-proof.local-test.mjs
```

The first command only reads sources and writes ignored SQL/manifest artifacts
under `qualification.local/six-card-golf/production-candidate/`. It cannot
connect to a database. The local test has a fixed loopback host/port and requires
the existing isolated `golf_<digits>` database; it never seeds scheduler health.
`production-preflight.sql` is a separately reviewable, read-only inventory.

There are ten independently bounded proof units: core rules/privacy, six human
matches, all financial winner/tie cases and failure rollback, recovery/pause,
and six individual mixed-match cases (2/3/4 seats in each money mode).
Each mixed case retains the real terminal hold. Splitting avoids holding shared
DDL locks through six terminal waits in one transaction.

Every unit requires real live-service prerequisites and an actual completed
scheduler heartbeat no older than 15 seconds. A stale or absent heartbeat is a
failure; never substitute a timestamp, install a fake cron extension, invoke a
worker merely to fabricate health, or weaken the check. Internal direct recovery
calls in the authority fixtures test recovery logic, not scheduled execution.

Each payload:

- Pins exact migration bytes; candidate units include that migration, including
  its seven deployed-authority guards, publication and cron registration, inside
  the rollback transaction. None becomes visible to another connection.
- Requires pristine Golf: no existing Golf sessions/results, and either absent
  candidate authority or installed empty authority with both flags false.
- Uses REPEATABLE READ, 100 ms lock timeout, 15 s statement timeout and 20 s idle
  transaction timeout. Do not increase timeouts or retry endlessly on contention.
- Uses a unique manifest UUID namespace, checks collisions, and changes release
  flags only within the uncommitted transaction. This is not live admission.
- Hashes complete pre-existing rows for users, profiles, sessions, participants,
  dealer-games, rounds, results, snapshots, transfer batches and pending journals.
  It rejects modifications/deletions of those rows and unscoped inserts. Hashes
  stay in temporary database tables; no credentials or hidden cards are exported.
- Flushes deferred financial constraints before comparison, then rolls back and
  checks fixture residuals. Candidate authority/job must disappear; installed
  authority must retain its closed flags and exact reviewed fingerprints.
- Emits function and catalog fingerprints covering relevant definitions,
  grants, RLS, policies, constraints, indexes, columns and enabled triggers.

Only execute a complete unit through a runner with stop-on-error and guaranteed
ROLLBACK/connection close on any error or timeout. Never execute selected
statements past an error. Proof DDL can temporarily lock shared tables; use a
quiet qualification window, stop on contention, and retain the failure output.
Rollback does not undo ordinary sequence-number consumption or server logs;
no claim of a physically untouched database is made.

The local committed-corruption fixture disables an integrity trigger. That
specific section is deliberately excluded from production payloads. Its existing
local proof remains evidence; production must never disable integrity guards
or deliberately corrupt a committed match. Full-match/reducer conservation and
ordinary recovery/pause proofs remain included.

## Collect and validate actual evidence

For every executed unit, preserve its exact SQL hash and both returned evidence
rows. Assemble a JSON object with `units`, each containing:

```json
{
  "sql_sha256": "hash from the executed manifest unit",
  "candidate_evidence": {"unit": "actual returned object, copied in full"},
  "rollback_evidence": {"unit": "actual returned object, copied in full"}
}
```

The example describes the envelope, not fabricated passing output. Keep raw
execution logs alongside it. Validate with:

```text
node dev/six-card-golf/production-evidence.mjs qualification.local/six-card-golf/production-candidate/manifest.json candidate-evidence.json reviewed-candidate.json
node dev/six-card-golf/production-proof.mjs --installed --fingerprints reviewed-candidate.json
```

The evidence validator requires all ten exact units, matching SQL hashes and
fixture namespaces, successful rollback, consistent function/catalog fingerprints,
and at least one actual earned bot final settlement across the mixed cases.
It will not convert missing or partial output into a pass. Installed generation
requires validated candidate evidence for the pinned migration. Do not fabricate
that file to obtain installed payloads in advance. After installation, execute
and validate all installed units in the same way, using their separate manifest.

These proofs do not replace independent-connection races or real cron,
Auth/PostgREST, Realtime and browser qualification. The existing concurrency
script provisions a local database and seeds local health: never point it at
production. Production races need separately scoped committed test identities
and explicit cleanup within the live qualification lane described below.

## Explicit live-test and activation procedure

The current flags cannot support an ordinary live test while admission stays
closed: configure/Run Back require admission, and snapshots/actions require
enabled. Both flags true admit the existing active-account population (4,958
profiles at the read-only inspection), not just named testers. A rolled-back
fixture is invisible to separate browsers and cron connections.

**Recommendation awaiting a release decision:** authorize a temporary, private
qualification gate scoped to exact existing tester UUIDs AND exact test session
UUIDs, with an expiry and a server-side check at capability, configure/Run Back
and action/snapshot boundaries. Every human participant must be admitted by that
gate; bot seating remains ordinary. General release/admission flags remain false.
This is a proposed additional implementation, not a feature of the current
candidate or a bypass that these scripts install. No rule/stake/privacy or
financial guard may be relaxed. Do not create credentials or change profile
eligibility for testing. Expiry closes new admission while preserving already
admitted liabilities, authorized reads/actions and durable recovery to completion.

If approved, implement and prove that gate locally, register its exact migration
identity, repin the complete release package and regenerate candidate/installed
proofs. The current pinned SQL alone must not be represented as containing it.
Do not edit a reviewed hash or remove authority guards to accommodate drift.

Then use this order:

1. Recheck current main/deployed definitions, financial constraints, grants and
   migration history; pin the final application and complete SQL package.
   Preserve the Race Poker source/applied-version mapping. Never issue an
   unrestricted pending-migration push or history repair.
2. Pass the complete production candidate rollback proofs in both modes, then
   install the exact approved package with general admission closed. Publish the
   matching application through the repository workflow only when authorized.
3. Pass installed rollback proofs and verify exact migration history, private
   projection permissions, revision publication and recovery job/command.
4. Admit only the named qualification sessions/accounts. Start with two humans
   and fake money through real setup and Ante Up. Exercise whole turns, private
   pending draws, lost responses, reconnects, prolonged-play queue, nine holes,
   exact balance/ledger/result/snapshot agreement, Run Back fresh consent,
   connected Session Ended and cold routing. Then cover mixed bots and 3/4 seats.
5. Observe real cron run receipts and state progression with all browsers closed
   at an earned settlement boundary; record exactly one result and transfer.
   Verify interruption/retry, unresolved deliberate pauses and human timeout.
   Never advance via direct recovery invocation and call that scheduler proof.
6. Verify actor/peer/outsider Auth/PostgREST and Realtime access: concealed own
   cards stay hidden, pending draw remains actor-only, notifications contain
   revisions only, sign-out removes access, reconnect seeks current state.
   Run independently connected action/timeout/final-action/successor/settlement
   races using those exact test sessions. Keep genuine financial evidence in
   both modes before opening a shared gate; fake-only proof is insufficient.
7. Keep all committed qualification records identifiable by a reviewed manifest.
   Never delete existing accounts, reset real balances or alter historical
   sessions. Cleanup must use the established authorized synthetic-session
   mechanism, prove no orphaned records and retain audit evidence; if cleanup
   is not available, retain the isolated test records and report that explicitly.
8. After every applicable gate passes, activate only the explicitly authorized
   active-account scope, preserving stricter platform money-mode restrictions.
   Jeremy then performs production iPhone portrait/landscape smoke. Revoke the
   temporary admission grant; do not strand in-progress qualification matches.

If a step fails, close new qualification/general admission and preserve evidence.
Keep server authority and recovery for admitted liabilities. An application
rollback must remain compatible with in-progress Golf; do not blindly restore a
pre-Golf client or uninstall authority after matches exist. Prefer a compatible
forward correction. No historical score or balance repair is authorized.

## Exact remaining decision and evidence limits

Approve the narrowly scoped qualification gate and subsequent production
qualification phase, naming existing tester accounts/sessions and expiry.
That is the recommended way to preserve closed general admission while proving
the actual route. Using the current global flags instead would require explicitly
accepting a broader active-account qualification opening before those live checks;
this package does not recommend or silently authorize that alternative.

Local preparation passed five offline safety/evidence tests, the real local SQL
negative service gate and containment/rollback checks, TypeScript and production
build. The builder generated ten candidate units; none ran on production.
Positive live-service qualification and the proposed qualification gate remain
unimplemented/unexecuted. No production-safe independent-connection runner is
claimed. The original full local Golf rules/financial/browser evidence remains
valid for its recorded scope; it is not relabeled as live production evidence.
