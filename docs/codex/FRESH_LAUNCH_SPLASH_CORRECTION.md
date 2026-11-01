# Fresh-launch splash admission correction — 2026-11-01

Jeremy's physical iPhone smoke of production `2d83a5266` failed: force-close and
Home Screen reopen went directly to the lobby. He approved this correction and
explicitly rejected skipping branding because lobby loading takes two seconds.
Original artwork approval remains unchanged.

## First-frame flash follow-up

Jeremy's next physical smoke on `b81e24a1f` confirmed playback, but the completed
artwork flashed before the animation began. `FreshLaunchSplash` used the supplied
completed PNG both underneath the video and as its startup poster. That image
painted before the MP4 decoded its opening bridge scene; this was not a replay.

The startup image and video poster now use the exact 720 x 1280 opening frame
extracted from the approved MP4 (`public/launch-splash/approved-v1-opening.png`).
Both opening and final images load before the overlay appears. Reduced motion
loads only the supplied final PNG. Playback completion/failure still selects that
supplied PNG. No video, supplied fallback, duration, eligibility, routing, auth,
recovery, lobby readiness or viewport geometry changes.

The focused suite adds delayed-opening-image coverage and verifies the
opening-to-final transition. The compiled-App harness now holds all video bytes
back and compares the actual first-paint screenshot with both images, then
releases the same MP4 and proves full playback. It also checks a missing opening
image cannot cover the lobby. TypeScript, production build, 39 focused tests and
all 26 compiled-App scenarios pass. Qualification and publication checkpoint:
`release-launch-splash-opening-frame-20261101`. Physical iPhone acceptance remains
pending: force-close/reopen twice and confirm no completed-artwork flash before
the animation, followed by the existing notification/recovery/resume smoke below.

## Exact failure boundary

The splash's own admission code confused account history with current recovery.
Its own-seat query vetoed any non-ended membership anywhere on the account.
Read-only production evidence found many such memberships for the reported
account, including real-money sessions. Thus the query necessarily vetoed that
account even on an ordinary lobby launch. No session was closed or modified.

Two other deterministic vetoes compounded the problem: requiring the new
`?launch=home` URL on existing installations, and treating retained sessionStorage
as proof of a resumed app. The old two-second navigation cutoff also discarded
otherwise valid launches while data loaded. Existing startup records did not
record the exact first veto on the reported phone; no claim is made that they did.
The old browser cases incorrectly treated several of these false negatives as
successes. They have been corrected.

## Approved correction and preserved owners

- Both original `/` and marked `/?launch=home` installed Home Screen entry URLs
  qualify. All other query/hash/deep-link destinations remain excluded.
- The receipt lives in the current document only. A retained old storage marker
  cannot suppress a new document. Reload, back-forward, discarded-document,
  background/resume, internal navigation and non-standalone exclusions remain.
- Recovery is the actual game/Arcade/async entry route or the existing in-memory
  canonical recovery lease. Unrelated memberships do not imply current recovery.
  The splash no longer makes any Supabase query.
- The authenticated Index and real GameLobby mount normally. The clip plays from
  frame zero concurrently with their loading; readiness controls dismissal, not
  admission. No seek-to-navigation-time and no two-second eligibility cutoff.
- Normal video completion fades the ready lobby over 200 ms. If loading outlasts
  the clip, its approved final PNG remains until readiness. A five-second maximum
  visible duration plus fade releases the existing app UI if initialization fails.
  A 3.5-second playback watchdog handles a stuck media element. An image-fetch
  timeout never covers or blocks the underlying app.
- Reduced motion and media failure use the supplied PNG and release as soon as
  the lobby is ready, within the same safety limit. Visibility, navigation and
  user interaction dismiss immediately. Effects and video resources clean up;
  StrictMode effect replay cannot consume an extra launch.

The MP4/PNG bytes, dimensions, artwork, CSS fit, manifest identity, notification
worker and routes, auth, live financial/session ownership, gameplay and audio
remain intact. No migration, session cleanup, package or infrastructure change.

## Qualification

Application TypeScript, production Vite build, 55 focused tests (including auth
and lobby regressions), and all 31 web-push tests pass. Compiled-App browser
qualification passes all 24 scenarios in `dev/launch-splash/browser.mjs` with synthetic HTTP
only; no live auth or production writes. It now asserts zero splash membership
queries, existing-install root entry, a retained old storage marker, unrelated
real-money membership, delayed JavaScript, lobby loading beyond two seconds,
failed lobby loading, resume during playback, and all original deep-link,
refresh, reduced-motion, media and five-viewport cases. Frame-zero metadata and
progress through the final second are checked.

Measured examples: the ordinary iOS-style root launch played from frame zero,
faded after the three-second clip and revealed loaded lobby/balance at 3.92 seconds
from navigation. An injected 3.8-second lobby response still showed the splash
immediately after mount, held the final PNG and revealed at 4.72 seconds. A
2.6-second JavaScript delay still admitted the splash. Failed lobby loading
released after 5.22 seconds of visible overlay. These are local desktop browser
measurements, not physical iPhone timing.

Local evidence: `qualification.local/launch-splash/`.
Checkpoint: `release-launch-splash-cold-start-20261101`.
Exact commit, Vercel READY deployment and live asset verification are recorded in
the delivery report. Physical iPhone acceptance remains pending.

## Focused iPhone smoke

1. Use the existing installed app: force-close and reopen from Home Screen.
   Confirm the silent approved animation appears without reinstalling or deleting
   any sessions, then fades to the actual lobby.
2. Repeat the force-close/reopen once. Open session memberships must not suppress
   an ordinary lobby launch. If data takes more than two seconds, animation still
   appears and the final frame can hold briefly.
3. Cold/warm notification, invitation/results link and actual active-table
   recovery: no splash or routing delay.
4. App switch/return, refresh and internal navigation: no replay. Background
   during the splash, then return: no resumed overlay.
5. Reduce Motion/Low Power Mode and poor connectivity: PNG or usable existing
   recovery/loading UI; never a stuck splash. Android physical checks remain
   separate from emulated display-mode qualification.
