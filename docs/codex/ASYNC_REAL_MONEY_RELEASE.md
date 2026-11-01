# Five-game async real money and lobby settings — 2026-11-01

Jeremy explicitly lifted the publication hold and authorized this combined release:
Notifications UI commit `e4684a466`, recent-opponent default sorting with the
alphabetical toggle retained, and real-money async for Ptown Words, Run21,
TriTowers, Quintzee and Box Drop. Latest matte icon work `a2b11d0af` is preserved.
No preview deployment, customer wager, customer balance mutation or new security
grant belongs to this delivery.

## Behavior and ownership

Play money remains the default; real money requires an explicit Money mode choice
and invitation review. Each game keeps its frozen 1–9999 stake and shared versioned
rules. Active humans only, 1–32 children, repeated games, request identity, offer
hash, membership, maintenance and incident checks remain. Real matches cannot use
play-money deletion. Acceptance reserves no funds. Child results stay provisional;
the existing parent finalizer posts one net result to both canonical accounts
after every child finishes. Negative balances and 36-hour/24-hour policies remain.

Migration `20261101152430_async_real_money_admission` is installed and qualified
with `private.delayed_release.real_qualified=false`. It replaces five existing
RPC definitions under exact-source guards, adds no endpoint/grant, and leaves
canonical financial functions unchanged. Real admission and acceptance recheck
the private flag. Words action/snapshot now support qualified real matches.
Existing accepted matches can continue if new real admission is later closed.

One independent review found hardcoded play-money labels in Words, Quintzee and
Box Drop. Those now receive `home.realMoney` from the authoritative match; six
tests verify real/play labels. Run21/TriTowers had no incorrect money label.

## Qualification — PASS

- 26 financial check groups pass locally and against the installed production
  authority inside rollback: both winners, ties, every game's forfeit, exact
  canonical chips/accounts/snapshots, balanced transfers, failure after account
  posting, retries, late replay, successor isolation, private authority, frozen
  stakes/mode, active humans and gate rechecks. Zero hosted fixtures remain.
- 14 isolated service/shared-rule/concurrency checks pass. Two independent database
  connections race real command receipts and last-child settlement for every game.
  Shared reducers exercise scoring, privacy, tie completion/Run21 continuation,
  earlier gameplay deadlines and zero-client recovery. Fourteen deployed SQL rule
  fingerprints and the canonical financial fingerprints match the proof clone.
- Normal winner/tie financial cases exercise the trusted outcome boundary with
  synthetic outcomes; actual reducer/service tests are separate. These checks
  do not claim a physical-device wager or a full human-played production match.
- 170 focused tests, full application/API typecheck, production Vite build and
  actual compiled-App mobile 390px / desktop 1280px checks pass. Browser accounts
  and RPCs are loopback mocks; permission scenarios are explicitly simulated.
- Security advisors show the existing authenticated SECURITY DEFINER RPC boundary
  and private RLS/no-browser-policy notices. No new grants or exposed tables.

Proofs: `supabase/delayed/real-money-proof.sql`, `dev/async-real-money/qualify.mjs`,
`service-races.mjs`; evidence: `dev/async-real-money/evidence/`.
The CLI-prepared timestamp was reconciled to the migration service's installed
receipt; the migration was applied only once.

## Production checkpoint

The release commit/tag and exact deployment receipt belong to the delivery report.
After the production alias, Vercel READY state and persisted publisher receipt
agree on that SHA, `prepare-activation.mjs` prepares the guarded flag update. It
checks the migration, authority fingerprints, admission, maintenance/incidents,
fresh recovery and real-money liveness before enabling. This is already authorized.

Owner smoke: reopen Settings and check the collapsed Notifications order and
quiet-hours value retention; confirm recent opponents and the sort toggle; review
a real-money lineup containing all five games and confirm mode/stakes/maximum loss
without sending an actual wager. Ordinary play-money gameplay and notifications
remain useful smoke checks. Real-wager play is not needed for release verification.
