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
Keep Vercel protection unchanged; no alternative hosting or public exception
is currently required.

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
2. Open the new share link in Safari itself and wait for P-Town Poker's login
   screen. Use Safari Share → Add to Home Screen, enable Open as Web App if
   offered, verify the custom icon, and name it P-Town Preview.
3. Remain signed out. Fully close the preview, launch its Home Screen icon and
   confirm the approved roughly three-second animation completes before login.
   Repeat a cold launch and check portrait and landscape for blank/stuck frames.
4. Background and resume the preview after completion, and once during playback.
   It must remain usable without replaying or leaving a stuck overlay.
5. Report icon, complete animation, transition and resume results separately.
   Production requires Jeremy's explicit approval after physical acceptance.

Sources: Apple's Configuring Web Applications documentation and Vercel's
Sharable Links documentation. Local failure evidence:
.storage-audit/pwa-failure/comparison.json. Physical report: Jeremy, November 10.
