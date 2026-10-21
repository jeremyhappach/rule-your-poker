# Battle 31 release reconciliation — October 21, 2026

Local correction of candidate `07e7131138ed097d704792c296e355ac041510f7`
against released main `bb1ec308030065d1aa30fc79a18efd493315291e`.
Authorization for this pass ends at the corrected local commit. No production
migration, merge into main, push, deployment, or admission activation.

## Correction and preservation

The old package embedded a pre-11-Up-bot `private.megatouch_begin` definition.
Production's newer definition correctly rejected its preimage guard. Installing
the old body would have disabled released fake-money 11 Up bots.

`supabase/battle31/registration.sql` now adds only Battle 31's game-list entries
and startup branch to three exact, fingerprinted released function definitions.
It no longer carries copied full shared owners. Unexpected definitions still
fail closed; fingerprint checks were not removed or loosened.

The package builder reconstructs the pinned released baseline locally, including
Race Poker v2 and both ordered 11 Up migrations. That baseline produces the
seven shared fingerprints observed in the read-only production preflight.
`released-baseline.mjs` is qualification-only and is excluded from the migration.

Main ancestry is integrated into the task branch only. Reconciliation used the
previously integrated `0d9469ecc` baseline to retain Battle 31 additions while
preserving newer main changes. All 74 checked released source files match main;
all 17 checked approved Battle 31 runtime files are unchanged. See
`dev/battle31/evidence/reconciled-client.json` for exact paths.

## Qualification

- Twenty package installation/replay/drift cases pass, including explicit
  rejection of the obsolete pre-11-Up-bot shared owner. Reversing only the
  additive Battle 31 registration changes recovers the released definitions
  exactly; existing function ACLs and game defaults are unchanged.
- Installed combined-authority checks pass Race Poker v1/v2 rules, both-money
  settlement/rollback/replay and timeout/reclaim controls. 11 Up fake-money
  human/bot setup and bootstrap succeed; real-money bot setup and bootstrap
  reject. Ready real pause/fake autoplay, reclaim, scoring clock and the
  all-human safeguard pass. All synthetic changes roll back.
- Battle 31 winner/draw/abort proofs pass in both money modes through actual
  canonical chips and transfer batches, including authorization, duplicate and
  late replay, after-chip failure rollback, continuation and unchanged balances.
- Concurrency, human/bot completion, timeout/reclaim, independent connection
  races and deferred sit-out pass. Recovery skips locked heads and processes
  bounded batches across 42 fixtures per money mode, preserving other recovery.
- Both-money browser journeys pass changed stake and explicit consent, private
  projection, lost-response retry/reload, mute/unmute, offline recovery, canonical
  settlement, Run Back, terminal retirement and fresh-ended-session routing.
  These use the actual Game route with loopback authenticated-role transport.
- Timeout browser checks pass both money modes: persistent fake autoplay and
  reclaim, and real timeout pause/reconnect with canonical host resume.
- TypeScript, 2,607 application tests, 241 harness tests and Vite build pass.
  Existing bundle-size/import and Browserslist warnings remain.

Evidence is in `dev/battle31/evidence/{package-proof,released-games-proof,
financial-proof,concurrency-recovery,recovery-contention,timeout-lifecycle}.json`.
These proofs use disposable loopback databases. Local cron metadata and
notification transport are not hosted pg_cron or Supabase Realtime evidence.

## Package and remaining release gates

Source SHA256: `2e372abcde1a79a1fa9fd8ae4ea5e7f432d351989f265ee4956aace693f71489`.
Package SHA256: `2b8ec87378a03cb595dd7ebfc6963844b41eb73021231446077e761c3600de3e`.

The four Battle 31 admission flags still default to false. No activation scope
is inferred. The current pass qualifies a corrected local candidate, not a
published release or physical-device acceptance.

Before a later release: recheck fresh deployed definitions and activity; register
the migration through the established release path; complete hosted rollback,
authorization/transport and actual scheduler/zero-client qualification; integrate
and publish the matching client only under release authorization. Preserve Race
Poker and 11 Up availability. Keep Battle 31 closed unless an explicit admission
scope is established. Owner and physical iPhone smoke remain outstanding.
