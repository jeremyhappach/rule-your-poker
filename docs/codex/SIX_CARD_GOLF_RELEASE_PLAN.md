# Six-Card Golf — closed-admission qualification plan

Local reconciliation target: main `88c798396bd0202551e36dcf4cd9efa39c9ef555`.
Final reconciliation also includes main `3f3dfb3e199d31097646c349363b6b8d77486daa` (isolated Box Drop numeral contrast).
Local preparation now also incorporates main `0d9469ecc24345175b3cb07052d16283a1c4f42c` (dominant Box Drop numerals).
Golf starting checkpoint: `79292bcedecddc2b08b1b46447884631d6ed5f09`.
This follow-up authorizes local work only. Nothing here authorizes production
access, merge to main, push, deployment, activation or credential/security changes.

## Local result

- Current main's Race Poker registrations are preserved alongside Golf in
  catalog, Rules, consent, setup, financial presentation and route retention.
  Golf now uses the shared fixed-version Rules resolver.
- Actual `Game.tsx`, its auth guard, shell and Session Ended owners are mounted
  by `src/pages/Game.golfRoute.test.tsx`. The SDK boundary and Golf gameplay
  body are simulated. Cases cover cold ended-session routing, confirmed sign-out,
  connected terminal retention, stale completion refusal, exact completion,
  shared Results and Back to Lobby. This is route integration evidence, not
  a live Auth/PostgREST/Realtime qualification.
- The lingering +5 was the shell's already-positioned ledger delta label.
  Session Ended now disables that presentation renderer immediately. Late labels
  are consumed without replay on a successor; ledger balances/cursors and
  settlement are untouched. Existing shell callers default to enabled.
- Golf remains mounted through terminal admission, as in the real route.
  Cards, public tableaus, result artifacts, action controls and inspection
  dialogs retire; standard HUD tabs, chat/history and identity remain.
  The browser harness now exercises that retained component instead of replacing
  it with a harness-only terminal body.

## Registered migration and local limits

Official existing Supabase CLI 2.121.0 created
`supabase/migrations/20261021011905_six_card_golf_v1.sql` using
`supabase migration new six_card_golf_v1`. No tools were installed.
The generated source is normalized to LF. SHA-256:
`815408fbc2cf2a37948b87a91656fc7d56e1d546d28e8f45c48961fd1c73e121`.

The migration checks seven canonical function definitions with newline-normalized
hashes. It requires actual pg_cron, an existing Realtime publication and logical
WAL before installing Golf. It registers only public revision notifications,
and a one-second service recovery job with a three-second statement timeout.
Both Golf release flags start false. Race Poker's shared admission dispatch
and frozen-stake protection are retained.

The local PostgreSQL host lacks pg_cron and uses replica WAL. No Supabase
containers were running. The complete migration correctly fails before creating
Golf tables. The isolated local install exercises game authority and real
publication membership, then the complete rollback suite; it does not apply
the scheduler portion or create a Supabase migration-history entry.
No scheduler mock is accepted as operational proof.

`dev/six-card-golf/install-local.mjs` also runs Race Poker core, both-money
financial and after-chip-write rollback proofs through the updated Golf
registration. The installed proof artifact is explicitly LOCAL: fixtures seed
the isolated scheduler heartbeat. Never use it unchanged for production.

## Required later production qualification, with admission closed

The executable offline proof package and the explicit live-test decision are in
[production qualification preparation](SIX_CARD_GOLF_PRODUCTION_QUALIFICATION.md).
That procedure resolves the former ambiguity between closed admission and actual
browser setup: the proposed exact-account/session qualification gate is not yet
implemented or approved. Current global flags cannot substitute for that gate.

1. Obtain authorization for the production phase. Pin the final integrated
   application commit, migration bytes and current deployed authority. Reinspect
   all seven guarded definitions, canonical financial indexes/triggers,
   role grants, RLS, active-account eligibility and existing money-mode gates.
   Stop on drift; do not remove a guard or overwrite another game's registration.
   Inspect migration history as well: main documents Race Poker source version
   `20261020190908` applied under production version `20261021002421`.
   Do not run an unrestricted pending-migrations push that could reapply Race
   Poker, or repair history to force it through. Verify that mapping and select
   only the exact Golf migration under the later approved deployment workflow.
2. Prepare a production candidate rollback proof from the reviewed fixtures,
   following `dev/race-poker/production-proof.mjs`: remove every local
   heartbeat seed and all local-reference bootstrap code. Require actual
   scheduler health. Record pre-existing balances/results/snapshots; assert they
   remain unchanged and verify no synthetic records remain after rollback.
   Use bounded lock/statement timeouts. Exercise real canonical financial
   triggers, both money modes, all winner/tie counts, failure rollback,
   authorization, immutable receipts, continuation and terminal cases.
   No production migration may precede a passing candidate proof.
3. Install the exact registered migration transactionally with
   `enabled=false` and `admission_enabled=false`. Verify migration identity,
   hashes, grants/private-state denial, publication membership and actual
   pg_cron job registration. Publish the matching application through the
   repository workflow only when that phase is authorized; leave discovery,
   setup and Run Back admission closed.
4. Rerun the complete production-safe proof against installed authority using
   reviewed candidate function/catalog fingerprints. Actual scheduled recovery,
   Realtime and independent connections require committed fixtures; rollback
   receipts alone do not establish them.
5. Implement and qualify the recommended exact-account/session live-test gate
   only after that release decision is authorized. Keep general admission closed
   while running the explicit browser/service/race procedure in the linked plan.
   The original global flags do not isolate named testers. Do not infer live
   qualification from simulated SDK responses or direct worker invocation.
6. After every applicable gate passes, authorize the stated active-account
   activation scope, preserving stricter platform money-mode gates. Both modes
   require qualification before a shared gate opens. Jeremy's physical iPhone
   Safari production smoke remains acceptance truth.

If qualification fails, keep new admission closed and preserve evidence.
If admission has later been opened, close admission without disabling the
authority/recovery needed by already-admitted matches. Do not remove results,
rewrite balances, force scoring or repair historical sessions.

## Jeremy's later smoke

On narrow and large iPhone portrait/landscape: two-human stock/discard play and
tap-to-inspect, own concealed cards remaining hidden, deliberate pause/reconnect,
five-circuit warning/final turns, nine-hole totals and exact chips, fresh Run Back
consent, then clean Session Ended and a cold reload directly to lobby.
Repeat with a strategic bot and a four-seat table. No owner acceptance is claimed.
