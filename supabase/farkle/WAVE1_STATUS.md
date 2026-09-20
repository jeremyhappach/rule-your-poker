# Farkle Wave 1 — applied, qualified and integrated

## Final qualification — September 20, 2026

Qualified SHA: `e80200300ee81597f8ac11447a2aa15069107644`. Applied migration:
`20260920155333_farkle_wave1_authority`. All 21 fresh browser cases, 1,639
application tests, 226 harness tests, 282 required regression tests, typecheck,
build, and 110 authority SQL assertions pass. Final shared metadata matches and
all fixtures are cleaned. Creation is disabled, admin-only enabled, production
defaults approval false, and no production defaults are seeded. Main is integrated at the qualified SHA; Wave 2 has begun on a separate branch. See [qualification record](../../docs/codex/FARKLE_WAVE1_QUALIFICATION_20260920.md)
and [machine-readable evidence](qualification/20260920/qualification.json).

## Historical pre-apply record

The following draft/hardening statements describe the earlier pre-apply state;
the final qualification above supersedes their unapplied/unpublished status.

September 19, 2026. Authorized scope: isolated Farkle authority and proof.
Permanent baseline: `512ce60825c06d355f6854062a20195cc3c2965e`, tagged
`pre-farkle-stable-2026-09-19`. Worktree: `farkle-authority`; branch:
`codex/farkle-authority`. No commit, publication, or persistent migration yet.
Numeric production scoring defaults remain unapproved. All numeric rules in
`proof.sql` are explicitly labeled TEST ONLY. Creation defaults to disabled.

## September 20 hardening — proof gates complete, unapplied

All six requested code corrections are present in the draft:

- Canonical lower occupied seats clockwise, wrapping with the dealer last.
  The three-player proof uses dealer 4 and occupied seats 3 and 5.
- Creation and recovery share advisory transaction lock `(19092026,1)`.
  Creators hold shared ownership through commit. Recovery obtains exclusive
  ownership, disables creation, checks active games, then restores dispatch
  atomically at READ COMMITTED isolation.
- TEST ONLY configurations (including Run Back) remain admin/service-only
  independently of `admin_only`; real-money test configuration is rejected.
- Scoped game/dealer/round authority claims replace owner-role trust. Approved
  RPCs restore prior claims on return. New generic definers fail closed for
  rounds, games, players, financial results and snapshots. Direct generic
  increment/decrement RPCs and a future generic definer are negatively proved.
- Explicit 1100-point highest-interpretation and no-cross-roll-combination proofs.
- V1 accepts only Balanced. Initial bot deadlines use the configured bot delay.

The final combined rollback run passed **110 assertions**, including all seven
shared definition/owner/grant checks after each of two restoration executions,
atomic refusal to restore during active Farkle, disabled creation after recovery,
fixture cascade cleanup, pending-session-end settlement and immediate reclaim.
The unchanged seven-game configuration/pause proofs, ante authority proof and
participant authority proof pass with both candidate and restored definitions.
See `REGRESSION_FIXTURE_FINDING.md` for the preserved randomized 3-5-7 ante
failure and the existing transaction-local fixture control used by this runner.

Typecheck/build, 1,639 application tests, 226 harness tests and the mandatory
41-file/282-test regression pass. Two lock-model tests pass, enumerating 60
states. Final DB verification finds the original seven shared fingerprints,
owners and grants, zero synthetic Farkle fixtures, no Farkle columns/release
table and no numeric production defaults. Evidence is in
`proof-results.hardening.json` and `proof-source-hashes.json`.
The scoped `.gitattributes` preserves SQL bytes so checkout newline conversion
cannot change captured function-body fingerprints or executable restoration.

**Passed: live two-session concurrency proof.** Two independently spawned
Supabase CLI 2.115.0 processes used existing CLI authorization through the
Management API. The database verified distinct, overlapping backend sessions:

- Creator backend 1447118 held its shared lock while recovery backend 1447121
  was denied exclusive ownership at 15:00:52 UTC; the holder finished at
  15:01:02 UTC.
- Recovery backend 1447139 held its exclusive lock while creator backend
  1447142 was denied shared ownership at 15:01:11 UTC; the holder finished at
  15:01:20 UTC.

Both phases rolled back. A final query verified zero residual proof locks.
`recovery/live-lock-results.json` records SQL, backend identities and timestamps.
The earlier serialized connector attempt remains preserved and inconclusive in
`recovery/overlap-attempt.json`; it is not counted as a pass. These live exclusion
proofs complement the 60-state model and transactional creation/recovery proofs.

The authorized local search covered all 13 worktree environment/configuration
sets, process/user/machine variables, linked-project metadata, standard libpq
credential/service locations and installed tooling. No raw PostgreSQL connection
credential was found. The existing CLI authorization provided independent SQL
sessions without creating, rotating, modifying or exposing credentials. No tools
were installed. Race queries changed no rows, schema or release configuration.

No apply, commit, push or release occurred. Jeremy explicitly requested keeping
this work unapplied/unreleased. Existing-game product source, existing proof
files, and migrations are unchanged; the original workspace remains untouched.

## Initial proof evidence

`proof-results.initial.json` records 51 passing transactional SQL cases. The
transaction temporarily installed the candidate, exercised synthetic fixtures,
executed shared-function restoration twice, then rolled back. This is initial
proof evidence; it does not satisfy the complete Wave 1 release gate.

SHA-256 at the successful proof:

- `candidate.sql`: `ee9c302ebcb2bbd5eebf9ad0198b0089549599fd16cef69918681db1af52e69c`
- `rollback-proof.sql`: `11a488059425569e684c621c1549f3b859a3ce967d10f14bfeb855134615eb4f`
- `recovery/restore-shared.sql`: `321bba28ae61f5274f1a0088eb958ba824053ac1aaff308d9a7bbeaf8d0ca6b5`

The draft contains versioned deterministic scoring; authoritative Roll/Hold/Bank;
Hot Dice and Farkle; all three endgames and equal tiebreak cycles; lifetime turn
counts; action receipts; fixed-stake settlement; frozen dealer configuration;
disabled admin release controls; real-money pause and fake-money takeover;
deferred reclaim; timer recovery; and semantic replay records.

Seven shared functions have guarded additive dispatch patches. The generator
proves the original bodies are recovered exactly when its additions are removed.
Captured executable recovery includes original definitions, owner and grants;
it refuses definition drift and active Farkle games that require their owner.
Restoration executing twice was proved initially; the hardening run above also
completed explicit resulting fingerprint, owner and grant assertions.

## Initial follow-up list (completed)

The authority negatives, restoration metadata checks, existing-game proofs,
listed lifecycle cases, local validation and live two-session proof are complete.
Keep the draft unapplied and unpublished under Jeremy's latest instruction.
The initial 51-assertion record above is historical evidence only.

Rebuild with `node supabase/farkle/build-candidate.mjs`, then
`node supabase/farkle/build-proof.mjs`. Run `rollback-proof.sql` as one transaction
through the Supabase SQL tool. Never apply the recovery script persistently as
part of a normal installation. Keep production creation disabled and do not seed
numeric defaults without Jeremy's separate explicit approval.

The first implementation turn stopped at the repository budget circuit breaker.
The live overlapping-session proof completed the remaining hardening gate on
September 20. The Horses control pattern remains the reference; no Horses/SCC
controller, layout, scoring or game-specific state was changed.
