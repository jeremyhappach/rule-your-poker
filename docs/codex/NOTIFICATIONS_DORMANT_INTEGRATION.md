# Expanded Notifications integration — 2026-10-31

Release owner: transition audit. Both worker commits (`866d0a25e` and
`e42a521b1`) were integrated onto released `042695ead71bcfc7321f87dc8bb8911e083344b7`
in `codex/notifications-release-integrated`. The resulting feature commits are
`e11237b84` and `177502d4b`. Current Net and all released recovery work are preserved.
No unrelated transition harness, Host Succession, gameplay or financial changes
are included. The local App proof now derives its build identity from Git rather
than claiming the older recovery SHA.

## Integrated qualification

- 3,374 application source tests and 241 repository harness tests passed.
- All 29 notification Node tests passed, including encryption, binding fences,
  stale delivery, quiet-start and expiration checks.
- Full application plus API TypeScript passed.
- Actual Vite production build passed against the current public Supabase
  configuration, with public enrollment disabled. The tracked legacy `.env`
  authority was overridden only in ignored local build configuration.
- Actual App browser checks passed at 390px and 1280px, plus five explicitly
  mocked permission scenarios. No real OS enrollment or delivery is claimed.
- Four compiled-App Tri/Current Net regression cases passed against the actual
  integrated Vite build. An initial run pointed to the old proof output folder;
  the rerun used the current artifact without changing product code.
- Expanded isolated SQL proof passed with verified database removal. It covers
  independent claim/receipt races, account and preference revocation, quiet-time
  coalescing, creation/eligibility/visibility, full and closed table routes, and
  absence of seat or financial mutation. It uses a local Auth fixture; this is
  not hosted authenticated or physical-device qualification.

Evidence is under `qualification.local/notifications/` and
`qualification.local/web-push/` in this integration worktree. The first database
run failed creating its evidence directory and cleaned up; the complete rerun
passed. Windows CRLF SQL bytes hash to
`2b32dae040b65becfd9ade066e127c84ae7f0af50c2d5a3ee01daf6d24ea0400`;
the Git/LF bytes match the approved migration hash exactly:
`bd1c3a1fae8980d34d670a33aa29b09ddc75076fb770c067f1fa99e9dc26d811`.

## Authorized dormant production setup actually completed

- Vercel Production `WEB_PUSH_DELIVERY_ENABLED=false`,
  `VITE_ASYNC_PUSH_ENABLED=false`, and
  `WEB_PUSH_VAPID_SUBJECT=https://holm357.com` were created.
- Supabase migration `expanded_notifications_dormant_20261031` applied
  successfully. Its first confirmation expired; absence was verified before
  the single successful retry.
- Hosted checks verified eight private RLS tables with no direct access for
  anon, authenticated or service_role; five approved authenticated RPCs and
  three worker-only service_role RPCs; empty search paths and no anonymous RPC
  execution. Existing matches remain opted out. Subscriptions, deliveries and
  personal defaults were all zero immediately after installation.
- Current restrictive visibility policies and Auth session columns match the
  reviewed schema assumptions. No customer sessions, balances or gameplay rows
  were repaired or changed by the release owner.

## Remaining gates

No VAPID keys or scheduler token have been generated. The local executor has no
Vercel CLI or authenticated CLI configuration; connector access works. A supported
secret-safe handoff from local cryptographic generation to Vercel and Supabase
Vault is required before completing the approved setup. Do not print secrets in
shell/tool output, put them in Git, or export connector credentials to work around
this limitation. No named cron job or Vault entry has been created.

No push or deployment has occurred for this candidate. After resolving secret
provisioning, finish exact-commit release checks, serialize main integration, use
the mandatory push helper, and verify READY, both aliases/manifests/entry, accepted
publisher receipt, disabled endpoint and scheduler metadata. Never deploy the
original Push-only candidate separately.

Activation remains separately blocked by known stale timezone data and incomplete
hosted/device qualification. Both flags must remain false. No database upgrade,
device enrollment, real push send, or activation is authorized by dormant setup.
