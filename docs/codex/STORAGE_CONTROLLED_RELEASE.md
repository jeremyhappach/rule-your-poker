# Controlled storage release — November 10, 2026

Jeremy explicitly authorized one production publication after qualification,
with the owner's Vercel dashboard Instant Rollback as the manual fallback. This
supersedes the earlier preview-only hold and API-access prerequisite. No test
rollback, protected preview, deployment deletion, billing change or Supabase
schema/gameplay/financial mutation is authorized.

## Candidate and preservation

The remediation branch already contains the latest fetched origin/main,
`64362de16e6b5cdac5ab1d76af009132a8605f27`; there are no newer main commits to merge.
Run21's latest artwork, Horses Blitz v5, 357 Drop v6 and River City Run are retained.
There is no diff in API handlers, migrations, gameplay rules, index.html,
manifest identity or the production push worker. Function routing and configuration
remain unchanged, including async Run21's `api/delayed-run21.ts` region `cle1`.

Product differences are the previously qualified lossless PNG encodings,
signed-out splash ownership correction, and the Chucky/Crib Lab visible stake
default validation/persistence correction exposed by the full release gate.
The remaining changes are qualification tests, storage tooling/documentation,
the unchanged 90,000,000-byte budget, and deployment/release workflow safeguards.
No unrelated Golf work from the user's primary checkout is included.

## Recorded rollback target and exact procedure

Before publication, both production domains resolve to retained READY deployment
`dpl_8UkGyaDgE61TrfV43gb27bYRYU6o`, commit
`64362de16e6b5cdac5ab1d76af009132a8605f27`. Vercel's deployment record explicitly
reports `isRollbackCandidate: true`. Refresh these identities immediately before
the production push; stop and reconcile if they change.

If any critical auth, startup, route, asset, async or function check fails:

1. Open https://vercel.com/jeremy-8e2b/ptown-poker as the account owner.
2. On the project's Overview, locate Production Deployment and click
   **Instant Rollback**. Alternatively, open **Deployments**, filter **main**,
   open the previous production row's **…** menu and select **Instant Rollback**.
3. Select the immediately previous production deployment recorded above. Verify
   its deployment ID and commit; do not select an older preview.
4. Click **Continue**. Verify the affected domain list includes **holm357.com**
   and **ptown-poker.vercel.app**, and review the retained environment configuration.
5. Click **Confirm Rollback** once. Wait for the successful rollback state.
6. Verify both domains' `/build-manifest.json` returns the recorded prior commit,
   then verify login, PWA assets, routes and all eight fail-closed function probes.
7. Stop further releases and report the failure. Rollback disables automatic
   production-domain assignment; do not promote or retry another deployment here.

The authorized API interface may be tried on an actual critical regression using
project `prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds`, team
`team_nQciG8fmHnUCogRJ7jaWawHq` and the exact rollback deployment above. If API
execution is denied, immediately report it and invoke the owner's dashboard
procedure. A failed rollback-resource query is not evidence that the owner's
dashboard control is unavailable. No rollback is performed as a test.

Source: [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback).

## Qualification and publication

Run the complete existing build command (typecheck, application/harness/tooling
tests, Vite build and size budget), lossless/reference proof, signed-in/signed-out
compiled startup suites and native push-entry proof against the final source.
All backend activity in compiled fixtures is intercepted. Hosted signed-out
checks allow real GET responses but block writes and WebSockets. No synthetic
session or balance data is created on the server.

Publish once by fast-forwarding the clean release-main checkout and invoking
the unmodified `.codex/scripts/push-origin-main.cmd`. Vercel must independently
pass its full build gate. The existing GitHub workflow must qualify the same
commit, verify the live production manifest, then send its normal release signal.
No manual database operation is part of this release.

The release receipt records the exact commit, deployment, test results, hosted
bytes, function boundaries, environment preservation and rollback availability.
Physical iPhone acceptance remains a separate owner smoke on the existing PWA.

## Attempt result: stopped before production publication

Candidate `33b56d4dd69dea941b533d0537229acf2b681dbc` was tagged
`storage-controlled-production-20261110`, fast-forwarded into the clean main
checkout and pushed once through the unmodified helper. No preview was created.
Vercel attempt `dpl_8V1rGEK39RVNYD4UfSojzQ5aRx3F` ended ERROR in its mandatory
application test step, so no new production artifact was published.

Local exact-commit qualification passed typecheck, 4,018 app tests/548 files,
241 harness tests, 44 release-tooling tests, Vite build, the 89,476,188-byte/179-file
budget check, 42 pixel-exact PNG proofs, 142 built-asset HTTP checks, 28 signed-in
startup scenarios, 13 signed-out scenarios and eight native worker entry scenarios.
GitHub run 42887974750 also passed qualification, then correctly failed its live
commit verification and skipped release signaling because the candidate never went live.

Vercel's production configuration has `VITE_ASYNC_PUSH_ENABLED=true`; local and
GitHub qualification did not exercise this enabled configuration. The enabled
PushPreferences path calls the real browser device adapter. Three jsdom suites
lack matchMedia, and the Node auth-session suite lacks localStorage when push
cleanup runs. Hosted result: 544 test files passed/4 failed, 4,002 tests passed/16
failed, six unhandled errors. Failing files:

- src/lib/authSession.test.ts
- src/pages/Delayed.live.test.tsx
- src/pages/Delayed.wordsInspection.test.tsx
- src/components/delayed/MatchLobby.test.tsx

This is a production-feature test-environment coverage gap. Do not disable the
production feature, skip these tests, or waive errors. Complete their browser
fixtures and run qualification with push enabled before reviewing another release.
No product correction or second production push was attempted after this failure.

Both production aliases and manifests were rechecked: they remain on the recorded
previous commit/deployment. All eight function responses and PWA metadata match
the pre-release baseline; async Run21 still reports cle1. A transient ECONNRESET
during the first read-only probe was retried once; the complete second pass succeeded.
The current production deployment is still READY and rollback-eligible. Its recent
30-minute error/fatal runtime-log query returned no records. No rollback was executed
because no production regression was deployed. Device testing of the new release
is not applicable until it is published. Preserve the existing installed PWA.
