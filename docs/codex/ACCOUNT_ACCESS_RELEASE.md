# Administrator account access and independent email verification

Approved 2026-11-04. Branch `codex/admin-account-access`, based on
`724e4d98a8d8fb95dcf4133ccd6043417e83bfcd`.

`public.account_access` owns access. New Auth registrations start pending;
existing profile activity is preserved. Installation retained 13 enabled users,
four disabled qualification accounts and two enabled registered administrators.
Approval never supplies email-ownership evidence. Historical confirmation
timestamps are not imported as proof because their provenance is unavailable.

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
