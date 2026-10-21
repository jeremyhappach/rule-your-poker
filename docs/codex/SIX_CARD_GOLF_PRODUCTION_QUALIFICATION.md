# Golf production qualification preparation — 2026-10-21

This package prepares local artifacts only. No production write, integration
into main, push, deployment, admission activation or new credential is authorized
by this preparation task. The game and financial contract are unchanged.

## Pinned candidate and production observations

The revised candidate incorporates main
`6b15f4eb060df319df13d576948c343920a23b21`, preserving released Battle 31,
Race Poker v2, 11 Up bots/Ready and other games. See the exact local evidence in
[reconciliation](SIX_CARD_GOLF_RECONCILIATION.md).

Migration: `supabase/migrations/20261021011905_six_card_golf_v1.sql`.
Exact SHA-256:
`95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.
The still-unpublished migration now includes the approved exact-account/session
qualification gate and canonical autoplay control projection/reclaim. Its eight
shared-authority guards include `public.set_automatic_play`; this additional
guard is locally verified. Read-only production inspection at 20:58 UTC on
October 21 matched all eight revised preimages; recheck at eventual execution.

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

There are eleven independently bounded proof units: core rules/privacy, six human
matches, all financial winner/tie cases and failure rollback, recovery/pause,
six individual mixed-match cases (2/3/4 seats in each money mode), and scoped
qualification/expiry/autoplay/reclaim/RLS checks.
Each mixed case retains the real terminal hold. Splitting avoids holding shared
DDL locks through six terminal waits in one transaction.

Every unit requires real live-service prerequisites and an actual completed
scheduler heartbeat no older than 15 seconds. A stale or absent heartbeat is a
failure; never substitute a timestamp, install a fake cron extension, invoke a
worker merely to fabricate health, or weaken the check. Internal direct recovery
calls in the authority fixtures test recovery logic, not scheduled execution.

Each payload:

- Pins exact migration bytes; candidate units include that migration, including
  its eight deployed-authority guards, publication and cron registration, inside
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

The evidence validator requires all eleven exact units, matching SQL hashes and
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

The qualification gate is implemented and locally qualified, default closed.
`private.golf_qualification` contains exact existing `game_id`, existing `user_id`
and `expires_at` triples. Foreign keys reject unknown identities; active-account
eligibility remains mandatory. No authenticated or service-role grant writer is
exposed. Every human in a new session roster must hold an unexpired exact grant;
bots use ordinary supported seats. Null-session/global discovery stays closed.
Capabilities, configure/Run Back, snapshots/actions and revision RLS enforce scope.
Both general release flags remain false and both grant tables start empty.

Admission freezes human access in `private.golf_qualified_matches` before consent
can cross grant expiry. Expiry or grant removal prevents new matches/Run Back;
it does not strand consent, committed liabilities, reads/actions or recovery for
an already admitted match. Frozen access cannot admit a successor match. This
exception never removes normal participant, identity, privacy or stake checks.

The later privileged grant operation is an explicit, reviewed transaction:
verify the exact existing session and all active human UUIDs against the approved
manifest, verify the two global flags remain false, then insert one row per
approved `(game_id,user_id,expires_at)` in `private.golf_qualification`. Use a fixed
UTC expiry from the manifest, require it to be in the future, and verify the
returned rows before commit. Do not create accounts or change profile eligibility.
No production grants have been written by this local task.

The later smoke scope is now resolved: Hap
(`d7dc1928-3727-4351-b0ff-0e80c81c2953`) and Happach Gmail
(`fb835d1f-db2f-4de4-84e2-ce0074512e46`), with bots, in exact fake-money sessions.
Both identities were verified against active admin/Auth records. Each grant
expires 24 hours after actual enablement, with that timestamp recorded in the
reviewed manifest. The window has not started. Verify `real_money=false` and
canonical money-mode protections before admitting the session. Other accounts
and real-money admission remain closed; do not turn on general Golf flags.

Then use this order:

1. Recheck current main/deployed definitions, financial constraints, grants and
   migration history; pin the final application and complete SQL package.
   Preserve Battle 31 source `20261021202023` / hosted `20261021202045` and
   Race Poker/11 Up source-to-hosted-version mappings. Never reapply Battle 31.
   Never issue an
   unrestricted pending-migration push or history repair.
2. Pass the complete production candidate rollback proofs in both modes, then
   install the exact approved package with general admission closed. Publish the
   matching application through the repository workflow only when authorized.
3. Pass installed rollback proofs and verify exact migration history, private
   projection permissions, revision publication and recovery job/command.
4. Apply only the reviewed exact-session/account expiry grants described above.
   Use the approved owner accounts with bots and fake money through real setup
   and Ante Up. Required multi-client checks must stay within those accounts;
   never add another tester implicitly. Exercise whole turns, private
   pending draws, lost responses, reconnects, prolonged-play queue, nine holes,
   exact balance/ledger/result/snapshot agreement, Run Back fresh consent,
   connected Session Ended and cold routing. Then cover mixed bots and 3/4 seats.
5. Observe real cron run receipts and state progression with all browsers closed
   at an earned settlement boundary; record exactly one result and transfer.
   Verify interruption/retry, unresolved deliberate pauses and human timeout.
   Real-money human timeout must pause without autoplay. Fake timeout must set
   canonical `auto_fold` and `sit_out_next_hand`; check the self Auto-play checkbox,
   peer robot beside the score, reload persistence and uncheck/reclaim. Reclaim
   clears both flags through canonical `set_automatic_play` and does not resume
   a paused table. Holes retain the frozen roster; deferred sit-out applies at
   match completion, not between holes. Reclaimed players remain eligible.
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
8. After every applicable gate passes and the revised package is released under
   authorization, enable only the two-account, exact-session, 24-hour fake-money
   scope above. General and real-money admission remain closed.
   Jeremy then performs production iPhone portrait/landscape smoke. Revoke the
   temporary admission grant; do not strand in-progress qualification matches.

If a step fails, close new qualification/general admission and preserve evidence.
Keep server authority and recovery for admitted liabilities. An application
rollback must remain compatible with in-progress Golf; do not blindly restore a
pre-Golf client or uninstall authority after matches exist. Prefer a compatible
forward correction. No historical score or balance repair is authorized.

## Exact remaining decision and evidence limits

The scoped gate and current-main reconciliation are complete locally. This pass
requires return of the revised package before release. The two accounts are
selected, but exact fake-money session identity and enablement/expiry timestamps
must be recorded during the later authorized phase. Do not substitute global
admission for scoped qualification. Recheck completion of preceding releases.

Eleven candidate units are generated; none has run on production. Positive live
Auth/PostgREST/Realtime and actual pg_cron qualification remain unexecuted. The
local browser service directly invokes recovery and is explicitly not cron proof.
No production-safe independent-connection runner is claimed; the later committed
test-session race procedure remains required. See the implementation checkpoint
for executed local checks; none is relabeled as production acceptance.
