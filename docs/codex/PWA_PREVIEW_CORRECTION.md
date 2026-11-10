# Signed-out PWA launch correction — November 10, 2026

Production remains held. Preview f7362b90c failed Jeremy's physical iPhone
acceptance; passing desktop checks did not qualify the installed experience.

Jeremy initially reported both a missing custom icon and missing splash. He
subsequently confirmed that opening and installing properly from Safari fixed
the icon. The remaining failure was precise: the startup artwork appeared for
a few frames and then cut directly to login before the animation started.

## Established failure boundary

The app animation was mounted only by authenticated Index. On a signed-out
Home Screen entry, Index navigated to Auth and AccountAccessGate immediately
released the inline startup cover. Auth did not mount FreshLaunchSplash.
The result was a native/inline still followed by login, with no animated owner.
This behavior predates PNG storage optimization.

A direct hosted comparison inspected production holm357.com and the exact failed
preview. All PWA link declarations, Apple metadata and manifest fields matched.
The 180-pixel Apple touch icon was byte-identical. All 24 startup PNG dimensions
matched their media queries and returned image/png; the manifest returned
application/manifest+json. The worker has no static fetch/cache owner.

All 34 inspected preview URLs redirected to Vercel SSO without a share cookie,
and returned 200 with the share cookie. Production returned 200 directly. This
is a limitation of protected-preview installation, not proof of the reported
icon's cause. Jeremy's successful Safari installation resolves that ambiguity.
This original share-cookie approach was subsequently rejected by physical
testing: Jeremy was required to sign into Vercel and then saw "Checking account
access" without reaching login. The direct-access correction below supersedes
the original share-link instructions.

## Direct preview access correction

Only existing preview deployment `dpl_H2RpCEpyhDkVuDZarChHg4WdLzJh`, serving
commit `b60027f61e9e2a17bd6ec1610d283777afd010b5`, received Vercel's supported
`alias-protection-override`. It opens directly without a share token, cookies,
Vercel login or an expiring sharing session. The associated task-branch alias
also opens directly. Project SSO remains enabled with
`deploymentType: all_except_custom_domains`; the earlier f7362b90c preview
still redirects to Vercel. All four production aliases still resolve to
`dpl_8UkGyaDgE61TrfV43gb27bYRYU6o`. No deployment, production alias, Supabase,
billing, retention or global protection setting was changed in this correction.

The two authentication gates have separate owners. Vercel protected the HTTP
document and PWA assets before the application could run. Inside the app,
AccountAccessGate waits for the Supabase session; a null identity admits the
signed-out route, while an authenticated identity requires account_access_snapshot.
Its existing session and access checks have ten-second failure/retry bounds.
No gate was skipped or changed to obtain the passing result.

Fresh browser contexts, with no Vercel cookies or Supabase storage, now reach
the real login screen. Unlike the earlier compiled-app fixtures, these checks
use the real auth SDK and actual backend GET responses. The anonymous backend
401 body is `permission denied for function account_request_guard`; it is not
an invalid API key, and it does not prevent signed-out session initialization.
No account snapshot RPC is attempted for the null session. All non-GET/HEAD
requests and WebSockets were blocked to prevent backend mutations. The reported
physical-phone hang was not reproduced; its original cause remains unproven.
Do not attribute it to compression, missing service credentials or a Vercel
redirect without further evidence. The separate preview-only smoke route was
not needed to exercise the real signed-out application safely.

Direct-origin verification passes six compiled-app cases: new Home Screen
start, existing root start, landscape, background/resume during animation,
ordinary browser root and direct auth. Cold launches play through `ended` at
3.0 seconds; decoded artwork receives the startup cover before the 200 ms fade
uncovers login. Completed-launch resume and reload do not replay. A separate
16-second observation remains on login, with no page errors or hanging gate.
These are desktop Edge checks with standalone emulation, not physical Safari
acceptance. All 114 public URLs, 24 startup PNGs, three manifest icons, 25 sounds,
worker and 179 deployed files are accessible without credentials. Served bytes
total 89,473,717, below the unchanged 90,000,000-byte limit (includes 163 bytes
of Vercel toolbar injection above packaged output). PNG pixel proofs still pass.
See [direct-access evidence](evidence/pwa-preview-direct-access-20261110.json).
The unchanged build also passes a fresh full validation run: typecheck, 4,018
application tests, 241 harness tests, 44 release-tooling tests, pixel proofs and
the local 89,476,188-byte build budget check. No tests or release gates were changed.

Full authenticated gameplay is not qualified: Canasta still returns
`canasta:release_unavailable` without production-only server credentials, and
preview push remains disabled. The other six function probes fail closed as
expected. Neither limitation blocks icon, startup animation or signed-out login
validation. Production stays held pending physical acceptance and explicit approval.

## Correction and preserve list

Auth reuses the existing FreshLaunchSplash component for the signed-out
destination of an already eligible Home Screen entry. It uses the same
per-document claim, approved clip, decoded opening frame, fallback artwork,
playback/completion boundaries and maximum-duration protection. AccountAccessGate
leaves the inline cover in place until the splash transfers ownership to its
decoded frame. Login mounts normally beneath presentation.

Direct /auth visits, password recovery, notification/async/game deep links,
ordinary browser visits, reloads, background/resume and internal navigation do
not acquire a new splash. Signing in cannot cause a second animation because
the same document receipt is already consumed. No authentication, authorization,
session restoration, gameplay, database, push or service-worker behavior changes.

No icon, manifest, HTML startup declaration, PNG, video, sound or API file is
changed. All 24 startup resolutions and lossless optimization remain intact.
Manifest id "/" and scope "/" resolve on the preview origin, separate from the
production origin; an immutable new preview URL cannot replace the production
PWA identity.

## Qualification and physical acceptance

Focused tests cover login animation completion, deep-link/reset exclusion,
document deduplication and startup-cover handoff through unresolved/signed-out
authentication. The compiled-App proof is dev/launch-splash/pwa-browser.mjs:
thirteen signed-out scenarios, all backend HTTP/WebSockets intercepted, real
video playback through its final second and decoded-image cover transfer.
It also tests slow JavaScript, portrait/landscape, reduced motion, autoplay
rejection, missing artwork, reload and resume. The existing authenticated launch
and native push-entry suites remain required and unchanged.

Local qualification passes: 4,018 app tests across 548 files, 241 harness tests,
44 release-tooling tests, 75 focused tests, 28 existing launch scenarios, eight
native worker push-entry scenarios, and all thirteen signed-out cases. The local
179-file build is 89,476,188 bytes under the unchanged 90 MB gate. The normal
signed-out run plays all 3.0 seconds and uncovers login after the 200 ms fade;
the decoded frame owns the cover before it is removed. See
[local evidence](evidence/pwa-preview-local-20261110.json). Hosted qualification
and exact deployment identity are recorded in the delivery evidence. Browser
emulation does not replace the required physical iPhone retest.

1. Delete only the previous preview Home Screen icon. Keep the production PWA,
   Safari website data and notification permissions unchanged.
2. Open the supplied direct preview link in Safari and wait for P-Town Poker's login
   screen. Use Safari Share → Add to Home Screen, enable Open as Web App if
   offered, verify the custom icon, and name it P-Town Preview.
3. Remain signed out. Fully close the preview, launch its Home Screen icon and
   confirm the approved roughly three-second animation completes before login.
   Repeat a cold launch and check portrait and landscape for blank/stuck frames.
4. Background and resume the preview after completion, and once during playback.
   It must remain usable without replaying or leaving a stuck overlay.
5. Report icon, complete animation, transition and resume results separately.
   Production requires Jeremy's explicit approval after physical acceptance.

Sources: [Apple's Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
[Vercel's deployment protection exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions)
and [Supabase auth-event guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
Local failure evidence:
.storage-audit/pwa-failure/comparison.json. Physical report: Jeremy, November 10.
