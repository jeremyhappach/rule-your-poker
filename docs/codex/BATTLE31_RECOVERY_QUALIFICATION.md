# Battle 31 recovery and release package — October 21, 2026

Historical checkpoint 0446: superseded for current integration, gates and package
hashes by [release corrections](BATTLE31_RELEASE_CORRECTIONS.md).

Status: locally implemented and qualified; no production changes, push, deployment
or admission activation. Approved `battle-31/1` rules are unchanged. The earlier
research/no-changes response was incorrect for the continuation and is superseded
by this checkpoint. No renewed rules approval is needed.

## Exact scope and reconciliation

Worktree: `C:/Users/jerem/.codex/worktrees/battle31-v1/rule-your-poker`, branch
`codex/battle31-v1`. Starting checkpoint:
`af34f37cb30d1314b7820491ac4976fc6c85e01a`.

Current-main reference:
`0d9469ecc24345175b3cb07052d16283a1c4f42c` (includes Race Poker and the latest
Box Drop presentation corrections). The shared registration source is rebuilt
from that main's Race Poker registration, with only additive Battle 31 lists and
bootstrap. A direct reverse comparison proves all Race Poker branches, admission
gates, participant constraints and frozen-stake handling are retained exactly.
Canonical finance and consent functions are guarded, not replaced.

This is source reconciliation, not branch integration. No merge, rebase or
cherry-pick occurred. Client overlap paths are retained in
`dev/battle31/evidence/main-reconciliation.json`: Game, setup/Ante Up, catalog,
continuation, financial shell, retention and liveness still require coordinated
integration before publication. The newer Box Drop UI was not overwritten.

## Recovery correction

The previous loop selected 20 due sessions before acquiring blocking command
locks. A locked session could stall the invocation and roll back earlier work on
timeout. Terminal recovery had no batch limit or complete session-identity filter.

`private.battle31_recover` now processes at most 20 gameplay and 20 terminal
sessions per invocation. Round/session/match locks use `SKIP LOCKED`. Participant
row locks are also acquired with `SKIP LOCKED` before the limit; otherwise a
player-only locked queue head could consume every slot indefinitely. A defensive
`NOWAIT` participant check protects the final command/postgame call.

The selected session/game/dealer/round, revision, phase and actor are revalidated
before gameplay dispatch. Terminal work checks the same ownership relationship
and terminal lifecycle. Existing command, bot projection, settlement and postgame
owners remain authoritative. No rules, stakes, deadlines, credentials, security
configuration or tester-access exception changed.

## Executed evidence

- `recovery-contention.json`: 42 independently admitted sessions in each money
  mode. Twenty-one locked rounds ahead of healthy work do not consume the 20-row
  batch. Session/match/player locks are skipped. Twenty-one player-only locked
  sessions also permit the healthy tail to progress. Terminal tests cover locked
  sessions and 20 player-only locks before an unlocked tail. Each invocation is
  bounded by a 1.5-second test statement timeout; initial healthy batches took
  13 ms and 5 ms in the retained run. These are local measurements, not an SLA.
- The same proof runs the actual Box Drop recovery owner while Battle 31 locks
  remain held, checks stale session identity/pause exclusion, and races two Battle
  workers. Forty-two canonical results per mode and 8,400 total fixture chips per
  mode remain after replay. This is contention isolation evidence, not a claim
  that every possible unrelated database lock can never delay a transaction.
- `package-proof.json`: 15 checks for missing platform registration, canonical
  drift, partial installation, scheduler-name collision, injected late failure,
  busy shared tables, fresh install, exact repeated install, installed function/
  ACL/schema/scheduler/publication drift, preservation of gates, and current-main
  registration preservation. Failure cases roll back all game objects and job
  registration. Fresh installation leaves both Battle 31 gates false.
- `recovery-regressions.json`: installed-package financial rollback proof in both
  money modes; privacy/auth/consent/stake, winner/tie/abort, canonical chips/ledger/
  snapshots, failure after chip writes, duplicate/late replay, continuation and
  terminal cases. Existing independent-connection action/timeout races, pause,
  zero-client completion and human/bot settlement passed. Exact package replay
  preserves settled fixture counts, receipts, chip totals and gate values. The
  regression database's admission gates were closed afterward.
- `tsc -p tsconfig.app.json --noEmit` passed. Five focused Vitest files passed all
  36 tests: Battle 31 model, audio manager, timer authority, presentation retention
  and canonical local terminal presentation. No frontend source changed in this
  pass. Earlier browser and full-build evidence is retained, not claimed rerun.

All evidence above is under `dev/battle31/evidence/`. All database work used
disposable loopback clones. Fixtures synthesize recovery-health timestamps and
are unsuitable for hosted production qualification.

## Migration package

`supabase/battle31/release.sql` is a generated, atomic DO-statement migration.
The builder is `dev/battle31/package-release.mjs`. Source and package SHA256 values
and the five expected canonical preimage hashes are in `release-manifest.json`.
The qualified package SHA256 is:

`f7a83f5782e3a987efc9f085ec4435eaacaca50ec0ff28778b635218437977b4`.

Fresh installation verifies the reference functions, refuses partial state,
installs with closed admission, and registers the revision publication and a
dedicated one-second recovery job with its existing three-second statement limit.
An existing job is accepted only if its schedule, command, database, owner and
active status match; it is never silently overwritten. An installation receipt
fingerprints functions/ACLs, table structure, constraints/indexes, policies,
triggers and registration. Exact repeat verifies that receipt and makes no data
or gate changes. Drift fails closed rather than applying stale shared functions.

The source is packaged, but no migration-history filename was invented. The
Supabase CLI is absent locally; create the history entry with the approved release
host's CLI when that release is authorized. Do not run the old raw source modules
over an existing installation or bypass the guard on production drift.

## Remaining release blockers

1. Coordinate client integration against then-current main and requalify the
   combined route/catalog/continuation behavior; recheck shared SQL if main changes.
2. Assign migration history identity and verify actual deployed canonical hashes,
   constraints, permissions and closed-admission installation/financial authority.
3. Prove real hosted pg_cron execution and scheduler health. Local cron is a
   metadata stub. Publication membership was tested with `wal_level=replica`, so
   actual Supabase Realtime/logical replication transport remains unqualified.
4. Hosted JWT/PostgREST/RLS, zero-client recovery and terminal continuation checks;
   physical iPhone portrait/landscape, network interruption and audio smoke.
5. Separate release/publication and admission authorization. No production write,
   push or deployment is part of this local checkpoint.
