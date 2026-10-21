# 11 Up bot release package — local only

Implementation candidate: `3b0d01eb9ac6418dfd78765de7ee2f34aca8d119`.
Implementation base remains `44dbd5a7d4de4635b258f731558fe346473d82b9`.
Reconciled in the isolated branch with current local main
`88c798396bd0202551e36dcf4cd9efa39c9ef555` on 2026-10-21. The original
candidate was `f1a441cb34d03a16195eae489d0180ee70057ffb`. Git combined the
client changes automatically; the release-note conflict was resolved by retaining
both entries. No product-code changes beyond those candidates were needed.
Box Drop owns the serialized production release; this package does not claim
that slot or authorize any production action. Main and other worktrees were
not modified. Recheck for newer main changes when the release slot is assigned.

## Package identity and registration

The deterministic transaction is composed by
`dev/eleven-up/bots-release-package.mjs`: `BEGIN`, canonical fake-money bot-policy
preflight, the approved `bots.sql`, `bot-recovery.sql`, then `COMMIT`.
It uses UTF-8, LF and no BOM. Exact transaction SHA-256:

`dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d`

Individual normalized source hashes are in
`supabase/eleven-up/release-manifest.json`. Operational rollback SHA-256:

`135d411329fc38a072591c517baaa8510d73ab45ebea651a9b9ae24f48521b74`

Registered migration: `supabase/migrations/20261021002901_eleven_up_bots.sql`.
Official Supabase CLI 2.121.0 created the empty file with
`supabase migration new eleven_up_bots`; the package generator then populated it.
The exact file bytes match the transaction hash above. Both package checks now
read the registered file and reject any difference from the qualified sources.

The CLI was installed only under ignored
`qualification.local/eleven-up-bots/cli` from the official npm registry, pinned
to 2.121.0. No shared dependency or global installation changed. Its initial
telemetry write outside the task directory was denied; the documented
process-local `SUPABASE_TELEMETRY_DISABLED=1` opt-out allowed local registration
without global settings, credentials, login or production access.
See [official CLI installation and telemetry options](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Changes and preservation

Installation adds the private policy, bot due column/index/trigger and the
qualified recovery owner, and replaces only the two explicit bot exclusions
with fake-money-only admission. It does not change public RPC signatures,
rules versions, gameplay deadlines, scoring, settlement formulas, participant
counts, Arcade, score/history/leaderboard definitions or canonical bot creation.
The existing one-second recovery job is reused; no worker deployment is needed.

**Installing this transaction enables new fake-money bot matches at commit.**
There is no separate activation flag. A future release approval must explicitly
cover migration/admission and matching client publication. Do not interpret
local package approval as permission to apply it to production.

## Local validation

Only dedicated synthetic database `eleven_up_bots_1792536250433` on
`127.0.0.1:55439` is used. No production connection or data mutation occurred.
The inherited local-template differences, including two restored canonical
source functions, remain documented in `ELEVEN_UP_BOTS.md`.

- `node dev/eleven-up/bots-proof.mjs --release-package`: exact transaction body
  inside rollback containment; 30 randomized legal rounds; canonical Add Bot,
  duplicate UUID, waiting-seat exclusion, real-money bot refusal, pause/resume,
  timeout recovery, complete bot game, replay and continuation; 36 financial
  cases covering both money modes and 2–7 seats, ties, balanced ledger, exact
  snapshots and injected post-chip-write rollback.
- During an admitted bot game, operational rollback rejects a new bot setup
  while the admitted match keeps playing and settles. Reapplication restores
  only the reviewed admission behavior.
- `node dev/eleven-up/bots-release-verify.mjs`: actual transaction installation,
  read-only verification booleans, repeated install, repeated rollback and
  reapply. All unrelated function definitions are unchanged after normalizing
  line endings. A later unrelated shared-adapter sentinel survives surgical
  rollback; the rollback does not restore a stale full shared function.
- Reconciliation regression uses `bots-reconcile.mjs` to install Race Poker's
  accepted source-level local harness into the dedicated database, without its
  production deployment/cron operations. Race Poker rules, consent, financial
  and injected-failure proofs pass with bot admission open and rolled back.
  All Race Poker definitions survive unchanged; only the intended 11 Up branch
  in shared consent changes. This is not a production schema/cron qualification.
- Independent-connection bot-action and duplicate/concurrent settlement proofs
  pass in both modes (human-only real-money fixture). The retained synthetic
  real-money history stays only in the dedicated database under canonical
  history retention; no production data is involved.
- 131 focused client tests across 13 files cover 11 Up, Race Poker, shared dealer
  setup/Run Back/defaults and catalog eligibility. TypeScript (`tsc -p
  tsconfig.app.json --noEmit`) and production Vite bundle passed.
  Actual-SQL browser bot play, reload, human controls, settlement and six layouts
  passed on one warmed retry after an initial navigation timeout. The command
  transport briefly disconnected and recovered. Physical iPhone and
  production-installed verification remain pending.

Durable package evidence: `supabase/eleven-up/release-evidence.json`.
Raw local results: `qualification.local/eleven-up-bots/release-proof.json` and
`release-install.json`. These are synthetic local proofs, not production smoke.

## Proposed serialized production sequence — requires separate approval

1. Wait until Box Drop's release is complete and the release owner explicitly
   assigns the slot. Fetch current main again. Review changes to dealer setup,
   catalog, `private.megatouch_begin`, canonical bot creation and recovery since
   the recorded base. Stop on conflicts or unexpected ownership changes; never
   overwrite a newer shared function with the old qualification snapshot.
2. Verify the registered migration hash, reconcile in isolation, rerun the relevant
   local package proofs and client checks for the actual release candidate,
   and record/tag that candidate under the repository release procedure.
3. With explicit production-read approval, execute `release-preflight.sql` and
   save the complete result as the release's rollback snapshot. Compare current
   definitions/indexes/admission to the reviewed source. Verify migration history:
   Race Poker's recorded installed version is `20261021002421`, while its source
   artifact is `20261020190908_race_poker_v1.sql`. Do not bulk-push pending files
   or replay Race Poker because of that filename difference. Resolve any history
   mismatch through the release owner before applying only the approved 11 Up
   artifact; no history repair is authorized here. Separately verify that
   `cron.job` has active `eleven-up-recovery`, schedule `1 second`, and the
   existing `private.eleven_up_recover()` command. Production schema/recovery
   differences are a stop condition, not permission to patch infrastructure.
4. After approval explicitly covering migration/admission and client publication,
   apply the registered transaction through the normal migration mechanism.
   A transaction error must roll back; do not partially replay statements.
   Verify the migration-history entry and exact applied artifact hash.
5. Execute `release-verify.sql`: every boolean must be true. Compare pre/post
   frozen rules, action, settlement, score-record and other-game definitions;
   only the expected bot/configure/shared-consent/recovery changes are allowed.
   Run separately authorized installed-authority rollback qualification before
   considering the release qualified. Do not run financial load tests or create
   persistent production qualification fixtures under this package approval.
6. Integrate and publish the matching client through the approved main push
   helper only when separately authorized. Confirm the deployment's exact SHA
   and READY status, then owner smoke from `ELEVEN_UP_BOTS.md`: fake-money bot
   setup/consent, reload, pause, completion, Run Back, bot waiting/removal boundary,
   and Session Ended; verify real-money bot refusal and human-only real-money
   play. Physical iPhone portrait/landscape acceptance remains Jeremy's gate.

## Rollback procedure

Before commit, transaction failure requires no data repair. After commit,
with rollback approval, execute `rollback-bot-admission.sql` as one transaction.
It restores the original human-only guards in setup and shared consent using
exact fragment matching; it raises on unexpected drift. It leaves admitted bot
matches, recovery scheduling, receipts, balances and results intact so those
matches can finish safely. Do not stop recovery, delete bot participants, alter
historical results, or reverse settled chips.

Verify both admission functions again contain `eleven_up:bots_not_supported`,
new bot admission fails, existing bot matches continue, and human/Arcade flows
are unchanged. Revert only the 11 Up client eligibility changes through the
normal reviewed release path, preserving unrelated releases.

This is an operational rollback, not a destructive schema downgrade: the due
column/index/trigger and helper functions remain for draining/recovery, and
migration history is not rewritten. Any later removal must wait until there are
no unfinished bot matches and receive a separate reviewed migration. Re-enabling
after rollback likewise uses an approved forward migration; do not repair or
rewrite migration history to force a rerun.
