# Notifications operational completion — 2026-10-31

The owner's goal is working alerts. Visible settings alone are not completion.
Settings can now be saved independently of device enrollment. With
`VITE_ASYNC_PUSH_ENABLED=false`, the UI explicitly says phone alerts are inactive,
shows no device-enable control, and performs no permission, service-worker
registration, subscription or device-presence requests. The sender remains
controlled independently by `WEB_PUSH_DELIVERY_ENABLED`. No activation is implied
by showing preferences.

## Current timezone authority

`supabase/web-push/timezone.sql` adds only two private RLS reference tables and a
private converter, then updates quiet-time conversion and preference zone-name
validation. There are no new public RPCs, role grants, customer/session/financial
changes, or database upgrade. All direct table/helper privileges are revoked from
PUBLIC, anon, authenticated and service_role.

The generator `dev/web-push/build-timezone-data.mjs` pins the official Moment
Timezone 0.6.6 IANA 2026f packed dataset, verifies SHA-256
`3103c5c0eaa879615da630b74e2373ad9b571e0eae992e0b2a3db6e4475de2ce`,
and emits 344 canonical rule sets and 597 canonical/alias names. Explicit coverage
is 2020-01-01 inclusive to 2038-01-01 exclusive. Unknown names and out-of-range
instants fail closed; no stale host timezone fallback is used. Future timezone
legislation requires refreshing this versioned data. Source, license, generated
SQL hash and coverage are recorded under `dev/web-push/tzdata/`.

Reviewed migration SHA-256:
`2168f9652fe5da27e37e8a59464bf93fd74b4da0978631dd334c4696e965eace`.
Git/LF-equivalent hash:
`be698a4f6aecf444d4ec6611607e7b333c9d21b075ace6eeb635b9e7818cfb20`.
Installed as migration `20261031204622` (`notifications_pinned_iana_2026f`).
Hosted verification passed all five golden conversions, 344 rules/597 names,
RLS/revoked direct access and private helper permissions. The complete read-only
timezone/visibility activation preflight passed. No database upgrade occurred.

## Completed checks

- 3,374 source tests, 241 harness tests, application/API typecheck and production
  build passed after separating settings from enrollment.
- Phone and desktop actual-App settings save/reload flows passed with enrollment
  false. Instrumented permission, registration and subscribe APIs were never
  called; no subscribe/device RPCs occurred. Five separately labeled permission
  mocks still passed. No real phone or push-provider delivery is claimed.
- The existing full isolated notification SQL race/quiet/coalescing/eligibility
  proof passed with the pinned converter, and synthetic database cleanup passed.
- All five current IANA golden zones passed through the new SQL authority.
  Alias resolution, invalid names, coverage rejection, fractional offsets,
  spring gaps/fall folds and private ACL checks passed. Existing quiet boundaries,
  equal times, claim/authorize preference races and table-alert dropping passed.
- No additional broad transition campaign was run or claimed.

Evidence: `qualification.local/notifications/ui-smoke-source.json`,
`checks.json`, `pinned-timezone-proof.log`, and
`qualification.local/web-push/{browser-proof,database-proof-resumed,timezone-compatibility}.json`.

## Minimum operational steps

1. The owner uses the reviewed local `notifications-secret-setup.html` helper once
   and saves four values in Vercel Production plus the same scheduler token in
   Supabase Vault. Private signing key and CRON_SECRET are Secret; public keys
   are Config. Clipboard browser qualification is incomplete and disclosed;
   further dummy fixtures are not a release prerequisite. Never print the values.
2. Timezone migration and converter/version/ACL/visibility verification are done.
3. Complete the existing approved named Supabase scheduler and serialized release;
   verify exact commit, READY, both aliases/manifests and publisher receipt.
4. Obtain an explicit device/test-delivery activation scope, then enroll that device
   and verify a real alert, quiet suppression and guarded click. Broad delivery
   must not be inferred from a request to see settings or smoke the UI.

The original notification migration `20261031195932` and both false flags are
already installed. No key, token, Vault entry, cron job or real subscription was
created by this local continuation.
