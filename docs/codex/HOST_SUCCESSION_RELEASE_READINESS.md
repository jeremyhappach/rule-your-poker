# Host succession release readiness — 2026-11-02

**2026-11-03 supersession:** Jeremy authorized production release without a
staging environment or preview. The following describes the earlier checkpoint,
not an additional approval requirement. The release combines current remote main
`46a7b1f6e` and resequences the unapplied migration to `20261103143632`. Current
checks and publication receipts are recorded in `HOST_SUCCESSION_RELEASE.md`.

**NOT READY for production installation.** The code is locally qualified; hosted
transport/schema parity and the installation window remain unqualified. No push,
merge, deployment, production SQL, live-session mutation or infrastructure change
was performed. Project/branch metadata was inspected read-only.

Product candidate: `48ac2026bc9a49b5d9855dbcf933b77f2edfd9fd` on
`codex/host-succession-inactivity`. Source and migration are unchanged by this
readiness follow-up. Fetched `origin/main` and local main were
`6411bb674a592d49cc6ed87fc0ae49a56a2f5361`, the candidate's direct parent.

## Exact installation prerequisite

“Existing tables must finish” means the **whole session**, not merely its current
dealer-game. The migration executes this predicate after acquiring
`SHARE ROW EXCLUSIVE` locks on `public.games` and `public.players`:

```sql
SELECT EXISTS (
  SELECT FROM public.games
  WHERE status NOT IN ('session_ended', 'completed')
) AS installation_blocked;
```

`true` raises `session_membership:finish_existing_tables_before_install` before
creating candidate objects. The schema makes `games.status` non-null. The check
does not consider presence, player count, money mode, chips, pot or `is_paused`.

| Existing state | Blocks installation? |
| --- | --- |
| Empty waiting session, even with no clients or players | Yes |
| Paused waiting or active session | Yes |
| `game_over` awaiting continuation/another dealer-game | Yes |
| Any other nonterminal `public.games` status | Yes |
| `completed` or `session_ended`, even with a stale pause flag | No |
| Active async match only in `private.delayed_matches` | No |

Async matches are separate from live table sessions. In the checked-in
`supabase/delayed/authority.sql`, `private.delayed_finalize` creates its public
accounting game, settles it and changes it to `session_ended` in one transaction.
Ordinary committed reads therefore see no intervening nonterminal accounting
game. Any stale/legacy nonterminal public row still blocks, regardless of game
type. An in-flight async finalizer can contend for the locks and cause a bounded
installation failure. Active async matches do not need to be cancelled or settled
early. This is a source finding; hosted schema parity remains unverified.

An authorized release operator must inspect the predicate/counts on the intended
target and hold new live-table admission while existing sessions finish normally.
The authoritative in-transaction gate is still required: an earlier zero count
is not a reservation. There is no automatic admission switch added here. An empty
or stuck nonterminal row requires separate investigation/authorization; never
force its status, close a game or change balances merely to pass installation.
The production blocker count was not queried in this task.

## Completed local checks and hosted gap

`node dev/session-membership/proof.mjs` passed **20 check groups** on
2026-11-02 at 21:39 UTC in a uniquely named disposable localhost PostgreSQL clone.
The clone was dropped afterward; the fixture database was not modified. Its
omitted prerequisites were restored from checked-in definitions, so this is not
a claim of a full current hosted schema replay.

Coverage includes continuous tenure, seat rearrangement, host departure,
leave/rejoin, existing disconnect grace, sitting-out host eligibility, inactive
accounts, bot exclusion, simultaneous departures, concurrent departure versus
eviction, three-game and configured one-game thresholds, partial games,
participation reset, safe dealer reassignment, duplicate continuation, successor
pause/end permissions, old-host rejection, transfer authorization and private
counters. Both money modes use synthetic accounts and actual nonzero canonical
transfers; results, chips, account entries and snapshots are preserved. Injected
failures prove the transition rolls back atomically.

The unchanged product candidate previously passed 62 focused client tests,
application TypeScript checking and a Vite build. Two mounted React clients test
announcement wording, version dedupe, deferred delivery, stale/regressive frames
and reconnect baseline. Two independent PostgreSQL connections test concurrency.
These are not hosted browser/Realtime tests.

Read-only hosted inventory found `ptown-poker-prod` with only its default main
branch, an unrelated recipes production project and one inactive, unclassified
project. No available authorized non-production target exists in that inventory.
No credentials were created or retrieved, project restored, paid infrastructure
provisioned or deployment made.

**Remaining hosted gap:** execute the above scenarios through actual staging
Auth, PostgREST/RLS, Realtime and at least three browser clients using synthetic
accounts, plus a bot. Verify exactly one accepted announcement per connected
client, reconnect baselines, and permissions after concurrent host/seat changes.
Run the SQL proof against a disposable staging database with the actual current
schema and recovery owners. The smallest way to close this is to designate an
already provisioned isolated Supabase staging project and matching frontend,
with existing synthetic accounts. None is currently available/authorized; if none
exists elsewhere, staging provisioning needs separate authorization. Do not use
production as the substitute. Production smoke follows separate release approval.

## Current main and parallel work

Only read-only comparisons were performed; no branch merge, rebase or other
worktree mutation occurred. Three-way file comparisons used ignored temporary
files in this worktree.

| Work | Comparison and remaining interaction |
| --- | --- |
| Sound Pass 2, `6411bb674` | Already current main and this branch's base; no pending sound integration. Sound behavior is unchanged. |
| Pause/resume, `fc3b9aa4b20908f0da354683f2275a383ae19921` | Shared `Game.tsx` changes combine without textual conflict; `CURRENT_RELEASE.md` conflicts. Its added pause controls use `isCreator`, compatible with this branch's authoritative-host predicate. Combined browser permission/paused-announcement validation is still required. |
| Activity-aware recovery, `4dd3df1266a64971d3be8ce4716af4e2e679bf65` | Based on older `dbc57dbe85f75265d4d5d60d5f67ce5e7fb24659`. Text conflicts in `CURRENT_RELEASE.md`, `DECISION_LOG.md` and `REPO_MAP.md`; `INDEX.md` combines. Its SQL candidates do not replace this candidate's host/end/transfer owners, but both observe games/players and invoke continuation, so combined deadline/eviction/concurrency proof is required. |

Recovery's own `RECOVERY_CONTROL_V2_20261101.md` marks production cutover blocked
by controller-loss deadline equivalence and incomplete/failed financial suites;
it has no qualified production cutover payload. Host succession must not silently
depend on or activate that branch. A clean textual comparison is not runtime proof.
The pause branch also retains its separate qualification/release requirements.

## Migration order, refusal and recovery

Candidate: `20261102210516_session_host_succession_and_inactivity.sql`, after current
main's `20261102154632_async_push_cycles_activity.sql`; neither compared feature
branch adds a conflicting timestamped host migration. SHA-256:
`0a76007b8fdb069b3215387a8cc2ccc3ef0bfa37b309c5a55ce76df04bac54b3`.

Prerequisites include the existing host/version/participation schema and guard
from September 5, `capture_recovery_context`/`restore_recovery_context` from
`20260905025936`, and the end/transfer replay wrappers in
`20260914214838_gin_replay_waiting_lifecycle.sql`. The migration verifies the two
RPC replacement seams and fails with `end_authority_drift` or
`transfer_authority_drift` if their source no longer matches. This catches those
specific incompatibilities, not every possible schema drift. Target migration
history and exact owner definitions must be checked during staging qualification
and again before the separately authorized production install.

Run the **whole migration in one transaction** with the migration-history entry
committed atomically. Do not submit its statements individually under autocommit.
It uses `SET LOCAL lock_timeout='3s'` and holds the table locks through commit.
Local proofs verify empty/paused/active/game-over refusal, terminal-row acceptance,
late failure at each RPC seam, and concurrent writer lock failure (`55P03`). Every
failed transaction leaves the prior schema, settings, authority definitions and
history intact. The deployment runner's transaction/history behavior still needs
qualification on the chosen staging target.

Before installation, capture the exact deployed definitions of
`private.guard_and_stamp_session_host()`,
`public.request_session_end(uuid,uuid,bigint)` and
`public.transfer_session_host(uuid,uuid,bigint)`, plus the prior frontend artifact.
Before commit, any failure rolls back the whole transaction. After commit, prefer
a forward fix. A code restoration is a new reviewed migration, performed while
admission is held and live sessions are naturally drained: remove the seven
candidate triggers and restore those exact three captured definitions alongside
the matching client. Leave private tenure/cohort/receipt tables, settings and
migration history intact and dormant. Do not reverse committed seat/host changes,
delete financial history or restore an old database over newer financial events.
If draining is impossible, stop for a separate recovery decision.

`dev/session-membership/readiness.mjs` rehearses that restoration in a rollback-only
local transaction. It asserts exact original owner definitions, retained private
tables and unchanged full-row hashes of games, players, profiles, results,
snapshots, transfer batches and account postings after a nonzero synthetic
settlement. This is a proof, not a production rollback command or authorization.

## Recommended release order

1. Keep sound at the already integrated main baseline. Qualify pause/resume
   separately; if releasing both, integrate its qualified client changes first,
   resolve the release-note conflict and validate the combined host permissions.
   Pause/resume is not a host-succession installation dependency.
2. Close the isolated hosted validation/schema/runner gaps for the exact combined
   candidate. Obtain separate production authorization.
3. Hold new live-table admission, let existing sessions finish, recheck installed
   prerequisites and the authoritative gate, then atomically apply the host
   migration and publish its matching client before reopening admission. Stop on
   refusal; never force session completion. Verify host, dealer, announcement and
   financial preservation smoke before reopening.
4. Keep activity-aware recovery outside this release until its own blockers are
   resolved and its interaction with installed host/inactivity triggers is proved.
