# Real-money async push correction — November 1, 2026

The existing `private.push_sync`, `private.push_invited` and
`private.push_eligible` still excluded real-money matches after five-game async
admission enabled them. Production match `3937d1a6-6702-47e5-bade-a2f11e021552`
had two actionable segment-4 Run21/TriTowers children and zero push events.
The scheduler was running. This was an event-generation/eligibility integration
gap, not a device-enrollment or financial failure.

## Correction and preserve list

Migration `20261101172147_real_money_async_push.sql` changes only those three
function definitions, under exact preimage/postimage guards. It removes four
money-mode predicates (two in eligibility). There is no new public endpoint,
grant, payload field, scheduler, client code or financial/gameplay authority.
The CLI-created migration filename was reconciled to the one installed receipt;
the hosted migration was applied once.

Before replacing generation, the migration locks existing active/invited real
parents in UUID order, then records current actionable child/segment keys in
notification episodes without emitting events. This uses the existing parent
lock and `(match_id,user_id)` primary key. Reapplying is inert. Existing waiting
turns and their old reminders are not replayed; new child/segment transitions
generate both turn and scheduled Last Call events normally.

Existing deferred parent/child triggers, epoch/event uniqueness, fresh-child
comparison, per-device deliveries and leased receipts remain intact. A later
child produces a new event even while another waits. Simultaneous child changes
coalesce into one generic match notification. Claim and immediate pre-send
authorization retain membership, active status, removal/incident hold, child
actor/segment, terminal/deadline, preference, quiet-hour, authenticated session,
active profile, device binding and foreground checks. The existing worker and
provider transport retain expiry/retry guards. Deep links recheck membership.
No stakes, balances, scores, cards or hidden state enter the payload.

## Qualification

- `node dev/web-push/database-proof.mjs --with-timezone --with-invitations --with-real-money`
  passes in a disposable PostgreSQL clone; database deletion is verified.
  It reproduces the old real-money exclusion, applies the candidate twice, proves
  both modes across all five games and validates multi-child and simultaneous
  transitions. Real-money invitation/turn/Last Call claims pass with two devices,
  independent database connections and duplicate receipts. Existing retry,
  preference races, binding, foreground, quiet/DST, stale and security checks pass.
- `node --test dev/web-push/*.test.mjs`: 30 pass, including worker/provider
  encryption, expiry, generic payloads, account-bound service-worker handling,
  authentication and guarded deep links. No provider test sends occur.
- `supabase/web-push/real-money-{baseline-proof,proof}.sql`: candidate and installed
  hosted rollback proofs pass; installed output is 13 notification groups.
  These use only synthetic rows and exact delivery authorization, never a global
  claim/recovery sweep. Local tests separately exercise full worker claims.
- `supabase/delayed/real-money-proof.sql`: 26 canonical financial groups pass
  locally and in candidate/installed hosted rollback transactions with the changed
  push triggers. Winner, tie, forfeit, exact canonical accounting, balanced transfer,
  replay, terminal state and injected-failure rollback checks remain intact.
- Application TypeScript and production Vite build pass using existing packages.
  `tsgo` was unavailable; the installed TypeScript compiler was used. No dependency
  installation occurred. Existing Vite chunk/Browserslist warnings remain.

After hosted rollback, synthetic profile count was zero. Reported match and child
hashes were identical before/after installation:
`b25afa29ead0134e82b905c65600c009` and `0c4349136af7ad859405d2dad9f304ae`.
Its event count remained zero, with both existing keys baselined at epoch zero.
Financial finalizer/outcome hashes remained `3c319dee938f4242d6174b27bc3ff260`
and `e9df9e0d3b92e2ca1c97135055841511`; canonical transfer authority remains
`86c0feb55524f14ab9f58a06cdee2ef6`. Advisor review changed no security settings;
existing unrelated notices are outside this correction.

## Release coordination and smoke

Audio had already published to both production aliases before this chat began:
`d140a89f95244ff0d441343fa8cecf292caca4c3`, Vercel
`dpl_FH1t4pchB7ntiPzSj23Nn9VPZ8LL` READY. The isolated
`codex/real-money-async-push` worktree starts at that verified commit. No audio
cherry-pick, rollback, discard or unfinished work is included. The audio chat
confirmed it will hold further publication through notification smoke.

1. On the intended recipient's installed iPhone app, confirm device and match
   notifications are enabled, quiet hours are off, then background the app.
2. During ordinary play, let the opponent complete a real-money turn so a **new**
   child/segment becomes available. Existing waiting turns deliberately do not
   alert merely because this migration deployed.
3. Expect one generic actionable notification on the next minute's scheduler run;
   tap it and verify the correct authorized match. Test a second child becoming
   available while the first still waits, and ordinary play-money delivery.
4. Record the device/time/result so notification event and provider receipt can be
   correlated. Provider acceptance is not proof of visible iPhone delivery.

No production match or financial record was changed for testing. The next genuine
turn was not consumed. Publication SHA/READY and live receipt observations belong
to the final delivery report; physical-device acceptance remains Jeremy's smoke.
