# Golf hosted qualification — October 21, 2026

Release is blocked by an incomplete mandatory candidate proof. No Golf migration
was installed, main was not changed, and no client or smoke access was published.

## Identity and fresh baseline

- Authorized application candidate: `f2f2d20b68f893664440a8f12836b1b6d79e6b6f`.
- Remote main and READY production client: `6b15f4eb060df319df13d576948c343920a23b21`.
- Production deployment: `dpl_PypuWBhy4DMPPnkUdkdukj6p9sgQ`, serving `holm357.com`.
- Uninstalled source migration: `20261021011905_six_card_golf_v1.sql`.
- Unchanged SHA-256: `95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.

The owner promoted Golf ahead of Double Solitaire and the pending 11 Up fixes.
Thread inspection confirmed Battle's access work, Double and Timers remained
local-only. Recent Vercel deployments were READY, with no competing release.
Fresh Supabase inspection verified the intended production project, all eight
authority preimages, real pg_cron, logical WAL, Realtime publication and a fresh
canonical recovery heartbeat. No stale DNS-failed parity was used.

## Executed proofs and exact blocker

Six final-manifest candidate units passed on hosted authority, with preserved
existing-record comparisons and verified rollback:

- Core rules, privacy, card conservation, queues and bot observation equivalence.
- All financial winner/tie cases and injected failure rollback, both money modes.
- Recovery and deliberate-pause authority.
- Exact-session qualification, expiry, autoplay, reclaim and RLS.
- Full two-human and three-human nine-hole matches in fake-money mode.

The four-human fake-money unit reached its final existing-record comparison and
failed with SQLSTATE `57014`, `canceling statement due to statement timeout`.
The failing query was the full-row comparison of `public.game_results` within
`pg_temp.golf_unchanged()`. It is not a passing unit. This does not establish a
gameplay or financial regression, but the required preservation evidence is
incomplete. Qualification stopped rather than increasing timeouts, bypassing
containment or installing a partially qualified package.

Three real-money human-match units and six mixed-bot units remain unexecuted in
the final manifest. Installed proofs, live Auth/PostgREST/Realtime, independently
connected races and actual scheduler-driven committed recovery remain outstanding.
Direct recovery calls inside rollback fixtures are not scheduler qualification.

Structured results, exact original/wrapped SQL hashes, fingerprints and final
rollback evidence: `dev/six-card-golf/evidence/hosted-attempt-20261021.json`.
The complete raw timeout is retained under
`qualification.local/six-card-golf/hosted-failure-20261021.json`.

## Qualification-only corrections

The connector exposes only the last result set. The new `hosted-unit.mjs`
adapter retains actual candidate evidence in PL/pgSQL variables across an
intentional subtransaction rollback, executes the original residual checks, and
returns both results together. All unexpected exceptions propagate. Its local
test proves rollback, failure propagation and live-service prerequisite rejection.
The manifest separately records source-unit and executed-wrapper SHA-256 values.

The first human fixture failed because production's existing Auth trigger creates
profiles and derives default usernames from the first eight UUID characters.
Scoped fixture UUIDs share that prefix. Hosted fixtures now supply unique full-UUID
usernames and activate only their newly created profiles. The Auth trigger is not
disabled or modified; all fixture accounts are rolled back.

The original six-human-match bundle exceeded the 15-second limit. It was split
into six independent units, matching the already separate mixed cases: 16 units
now cover the same full matrix. The evidence validator requires all 16. The
existing-record check now materializes each table's current row hashes once and
indexes the temporary baseline, preserving both directions of the comparison.
Local deletion, unscoped-write and rollback tests pass. Three-player hosted
qualification then passed; four-player containment still timed out. No statement
or lock timeout was increased, and no migration or gameplay bytes changed.

The smallest next task is a bounded hosted proof-runner correction. The MCP
adapter executes a complete unit in one enclosing statement, unlike a dedicated
connection that can collect each original statement's result separately. An
approved direct PostgreSQL connection would allow the original per-statement
limits and both evidence results without this enclosing-statement constraint.
No such connection binding was available in the current task environment. An
alternative must retain full coverage, rollback and existing-data comparisons;
passing local tests alone cannot waive the hosted gate.

## Rollback and access status

At `2026-10-21T22:02:20Z`, an independent read confirmed:

- Zero fixture users, profiles and sessions across all attempted namespaces.
- No Golf authority table, recovery job, defaults row, migration, session or result.
- The shared ante and frozen-stake definitions match their original hashes.
- Remote main remains `6b15f4eb060df319df13d576948c343920a23b21`.

Rollback may consume sequence numbers and produce server logs; this is not a
claim that production received no SQL. No historical session or balance repair
was performed. The unrelated Cribbage snapshot remains unstaged and untouched.

The reserved future smoke scope remains Hap
`d7dc1928-3727-4351-b0ff-0e80c81c2953` and Happach Gmail
`fb835d1f-db2f-4de4-84e2-ce0074512e46`, with bots, fake money only. Everyone else
and real money remain closed. No grants exist, activation/expiry are unset, and
the 24-hour window has not started. Existing admitted-match expiry protections
remain in the unchanged package. Owner smoke instructions become actionable only
after complete qualification and release.
