# Administrator account access and independent email verification

## Three smoke corrections

Approved 2026-11-04 on `codex/admin-access-smoke`. Installed migration
`20261104182353_admin_access_smoke_fixes.sql` corrects only these findings:

- Signup now requests the independent email token. A server-owned attempt ID,
  current email and dispatch status deduplicate signup/gate recovery and reject
  stale completions. Provider failure remains visible with Resend available;
  accepted means requested, never inbox delivery or verification. Auth automatic
  confirmation stays enabled so approved, unverified users can play.
- Registration bell records use the existing notification center, and both bell
  and push target the same Admin → Players record. The worker persists a pending
  destination for its recipient until that record opens. Login restoration keeps
  the query string and consumes its redirect once. Approval resolves the bell;
  later suspension does not reopen it. Revoked administrators cannot read it.
- Admin balances include each account's existing canonical transaction sum and
  enabled flag. Include Disabled Players filters those rows locally, defaults
  off, and preserves statements, balances, transactions and access decisions.

The audit removes `owner_grandfathered` evidence only from the four recent
server-marked Mega qualification accounts. The earlier customer grandfathering
remains. Before/after access hash: `c2b2eb63a044f21e00f5a535db26201e`;
18 registered, 14 enabled, four disabled, 13 independently verified. The Petco
account remains enabled/unverified until it consumes a genuine email token.
Migration uses a five-second lock timeout and makes no financial/session writes.

Candidate and installed hosted rollback proofs pass in
`supabase/account-access/smoke-proof.sql`; preimages are in
`dev/account-access/smoke-preimage.json`. All fixtures rolled back. They cover
dispatch failure/deduplication/stale attempts, authorization, verification/access
independence, bell approval/revocation and unchanged canonical balance sums.
App/API TypeScript, 38 focused tests, 11 service-worker tests, real local
GoTrue/SMTP/PostgREST single-use-token proof, 20 component browser cases, six
real-route browser cases and production bundle pass. Security advisors report
no new finding requiring correction in scope: private request tables intentionally
have no browser policies; the existing admin balance RPC authorizes internally.

The exact release SHA, production deployment and HTTP verification are recorded
on `release-admin-access-smoke-20261104-verified`. Owner smoke remains unverified:
actual mailbox delivery/link verification; enabled-unverified gameplay; physical
iPhone warm/cold registration push and matching lobby bell; disabled balance
row and unchanged transaction history. No physical test is recorded as passed.

## Initial release and grandfathering history

Approved 2026-11-04. Branch `codex/admin-account-access`, based on
`724e4d98a8d8fb95dcf4133ccd6043417e83bfcd`.

`public.account_access` owns access. New Auth registrations start pending;
existing profile activity is preserved. Installation retained 13 enabled users,
four disabled qualification accounts and two enabled registered administrators.
Approval never supplies email-ownership evidence. The initial release did not
import historical confirmation timestamps. After Jeremy reported the unexpected
reminder, he explicitly authorized grandfathering all current users as verified.
The 17-account cohort captured at `2026-11-04 17:03:38.712215+00` now has private
`owner_grandfathered` evidence for its current email, separate from genuine token
evidence. This one-time exception does not apply to future signups or changed
addresses and does not enable suspended accounts.

Enabled administrators use `admin_set_account_access`; serialized role/access
changes prevent self-disable and last-administrator loss. Immutable private audit
rows record actor, timestamp and before/after state. Profiles retain the existing
activity projection and host-succession integration. PostgREST pre-request,
restrictive RLS and actor-bound service RPC locks enforce fresh access, including
old JWTs. Null-actor trusted recovery remains with existing game owners. No
settlement, balance, scoring, deadline or forfeiture rules were changed.

Email evidence is separate, private and tied to the current address. The server
consumes a genuine Supabase email token, saves only the returned identity/email,
and discards its temporary session. Email changes clear evidence. Verification
links use fragments and an explicit confirmation button; runtime href logging
redacts this route. Resends are authorized and rate limited per target.

Follow-up migration `20261104170440_grandfather_existing_email_verification.sql`
is installed. Candidate and installed rollback proofs in
`supabase/account-access/grandfather-proof.sql` confirm all 17 authenticated
snapshots and admin directory records are verified, future signups remain pending
and unverified, browsers cannot write evidence, genuine tokens update provenance,
and email changes clear grandfathering. Candidate replay is a no-op and preserves
Auth/profile rows and access decisions. Installed counts remain 17 registered,
17 verified, 13 enabled and four disabled; all synthetic proof users rolled back.
The account revision update notifies connected clients through the existing
subscription. A refresh also retrieves the corrected verification state.

The release configures Auth **Confirm email off** and the Magic link email:

```html
<h2>Verify your P-Town Poker email</h2>
<p>Please verify your email address to help secure your account.</p>
<p><a href="{{ .SiteURL }}/verify-email#token_hash={{ .TokenHash }}">Verify email</a></p>
<p>If you did not request this email, you can ignore it.</p>
```

Subject: `Verify your P-Town Poker email`. Secure email change and password
recovery remain enabled and unchanged. Supabase's automatic confirmation field
is deliberately never shown as independent Verified evidence.

Registration notifications reuse the existing subscriptions, quiet hours, worker
leases, receipts and device binding. The new preference is opt-in and visible
only to administrators. Alerts open the exact Admin → Players record. Approval
or opt-out suppresses queued alerts. Device delivery remains an owner smoke item.

Qualification:

- Hosted candidate and installed rollback proofs: pending defaults, access and
  evidence privileges, approval/suspension/re-enable, audit immutability, email
  changes, registration fanout/deduplication, quiet hours and preferences.
- 26 Async financial proof groups; ten live Mega fake/real settlement cases:
  suspension rejects human service calls while canonical chips, transfers,
  snapshots, ties, duplicate settlement and injected-failure rollback survive.
  Live and Async proofs run in separate transactions: the Async proof deliberately
  ends with immediate constraints, which must not leak into the live fixture.
- Independent local transactions prove action-before-suspension and
  suspension-before-action ordering with an old identity.
- Isolated real GoTrue 2.196.0, PostgREST and SMTP prove signup, unverified login,
  approval, mailed-token verification/replay, original-session survival, resend
  throttling, secure email change, password recovery and subsequent login. No
  production email or account was used for these tests.
- App TypeScript, focused API TypeScript, 17 API/component/service-worker tests,
  production Vite bundle and 20 browser screen/viewport cases pass. Broad legacy
  `tsconfig.node.json` has unrelated existing declaration/alias/strictness errors.
- One bounded independent read-only Terra review found no release blockers.

Migration source: `20261104153508_admin_account_access_email_verification.sql`.
Hosted migration is installed; voice-to-text v4 enforces the same current access.
Publication uses the approved main helper. Exact production SHA/deployment and
Auth configuration verification are recorded on
`release-admin-account-access-20261104-verified` after release.

Owner acceptance: register a new account, follow its administrator push, enable
it before verification, sign in/play, verify the email, suspend while active,
confirm the suspended screen, then re-enable without losing history or balances.
Also check phone quiet hours and notification tap navigation on a subscribed
administrator device. Physical-device and live customer gameplay smoke are not
claimed by the automated proofs.
