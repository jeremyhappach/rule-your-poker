# Golf local reconciliation — October 21, 2026

Baseline: local and remote main were both
`6b15f4eb060df319df13d576948c343920a23b21` at the start of this pass.
The preceding Golf candidate was `66d43ebd75ef02edebec37d217a9c2ca86a02117`.
Main was merged into the isolated Golf branch only; main itself was not changed.
Overlapping catalog, consent, setup, terminal-retention and documentation entries
retain both Golf and the released games. Unrelated Cribbage work is excluded.

## Shared authority and package

Read-only production inspection at 20:58 UTC (3:58 p.m. CDT) matched all eight
revised preimages. The three revised guards are:

| Owner | Revised normalized MD5 |
|---|---|
| `private.megatouch_begin(uuid,uuid)` | `26754906038b83e7ca739196957376d0` |
| `private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)` | `7b6ca8feaa35c1fcce8b00491783e9d4` |
| `private.megatouch_frozen_stake()` | `66207ae4a79447ec634f8b3afaff9512` |

Golf adds only its ante-dispatch branch and frozen-configuration membership to
the inspected definitions, with exact hash and single-anchor checks. It no longer
replaces copied shared owners. `megatouch_begin` stays byte-for-byte unchanged,
retaining Battle 31, Race Poker v2 and 11 Up's bot restrictions. The other five
guards are unchanged. Permissions and existing game definitions are checked
after applying the Golf candidate locally.

Unpublished Golf migration: `20261021011905_six_card_golf_v1.sql`.
Exact SHA-256: `95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.
Eleven offline production rollback units were regenerated and pinned to these
bytes. No hosted proof, installation or grant was executed in this pass.

Production history confirmed Battle 31 at `20261021202045`, Race Poker controls
at `20261021183159`, and 11 Up at `20261021185314` plus `20261021185320`.
Preserve the source-to-hosted-version mappings. Never replay those migrations
or run a bulk pending-migrations push for Golf.

## Executed local qualification

Evidence is under `qualification.local/six-card-golf/`:

- `reconcile-installed.log`, `installed-local.json`: the installed Golf core,
  privacy, human/mixed, financial, recovery and scoped qualification rollback
  suite passes. Flags remain closed; rollback leaves zero Golf matches/revisions.
  Publication membership and authenticated private-state denial pass. A changed
  shared-function search path is rejected by the guard.
- Preservation compares 408 existing function definitions and permissions,
  reversing only Golf's two explicit additions. All others match. The isolated
  baseline has no defaults rows; that empty comparison is not production proof.
- On the same combined authority, Battle 31's six financial winner/tie/failure
  cases pass across both money modes with actual 105/95 winner balances, balanced
  transfers, atomic failure rollback and no fixture residuals. Race Poker rules,
  both-mode financial/failure rollback and v2 control checks pass. 11 Up Ready
  real-money pause, fake autoplay, reclaim, scoring clock and all-human safeguard
  pass.
- `reconcile-race-fake.log`, `reconcile-race-real.log`: independent-connection
  duplicate/lost-response/action/timeout/final-action/successor/settlement and
  late-replay checks pass in both money modes.
- `reconcile-build.log`: TypeScript, 377 application files / 2,626 tests, 12
  harness files / 241 tests and production build pass. Existing chunk-size and
  browser-data warnings remain; no dependency installation was required.
- `reconcile-offline.log`, `reconcile-containment.log`: five offline package/
  evidence safety tests and local SQL containment/negative live-service checks
  pass. No scheduler health or hosted success is fabricated.
- `reconcile-browser.log`, `session-ended-browser.json`: rendered two-human
  nine-hole match, shared audio, terminal completion, Session Ended artifact
  retirement, local Back to Lobby and cold-mount audio silence pass. This uses
  the local canonical-shell harness, not hosted Auth/PostgREST/Realtime.
- `reconcile-autoplay.log`: fake timeout, self checkbox, peer score robot, reload
  persistence and authoritative reclaim/deferred-sit-out clear pass on the
  corrected current-main local bootstrap.

The first cross-game run correctly failed 11 Up's Ready safeguard because Golf's
old local bootstrap reloaded a pre-Ready pause helper after reconstructing main.
Removing that duplicate bootstrap restored the released owner and the combined
proof passed. This correction affects local qualification setup only.

An initial layout run completed 41 cases, then timed out waiting for the inspector
to close after an Escape keypress. The rerun exercises the visible Close button
used by touch players; no product dialog code was changed. This does not claim
that the earlier Escape behavior was diagnosed or repaired.
The rerun passed all 63 rendered layout cases across two, three and four players,
all viewer positions and seven viewports (`reconcile-layout.log`). This is local
harness coverage; physical iPhone and published canonical presentation still
require the reserved production smoke.

## Reserved later smoke scope and release holds

Future smoke permits only these previously verified accounts, with bots, in
exact fake-money qualification sessions:

- Hap: `d7dc1928-3727-4351-b0ff-0e80c81c2953`.
- Happach Gmail: `fb835d1f-db2f-4de4-84e2-ce0074512e46`.

The existing per-session/per-user grant key supports both. At later activation,
verify the exact session has `real_money=false`, record its UUID and both grants
in the reviewed manifest, and set expiry to exactly 24 hours after enablement.
No timer starts during preparation. Other accounts and real-money admission stay
closed. Expiry prevents new matches/Run Back while frozen admitted access and
recovery preserve existing liabilities. No grants or account changes were made.

This pass is local reconciliation only. The revised candidate must be reviewed
before release. Subsequent production work must recheck baseline drift and the
required release order, pass hosted candidate/installed financial proofs and
actual Auth/PostgREST/Realtime/cron/race qualification, then verify matching client
publication. Physical iPhone acceptance remains Jeremy's smoke. Rules, scoring,
stakes, privacy, deliberate pauses and settlement are unchanged.
