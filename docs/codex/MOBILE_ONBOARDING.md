# Mobile installation and notifications — 2026-11-04

The six approved follow-up findings and corrected qualification are documented
in [Mobile onboarding smoke fixes](MOBILE_ONBOARDING_SMOKE.md). That release
supersedes the original blanket reload exclusion and browser-fixture evidence.

Jeremy approved the two-slide tutorial, isolated account preference migration,
qualification and main publication. The release is based on main `99860b909`;
the original Golf worktree and its changes remain untouched.

## Behavior and ownership

- `MobileOnboardingTutorial.tsx` reuses Dialog, Carousel, buttons and the current
  PWA icon. Platform switching retains the slide. The notification illustration
  is read-only and always excludes administrator controls.
- `LobbyOnboarding.tsx` owns the lobby launch and Help replay. `mobileOnboarding.ts`
  admits a fresh supported mobile-browser entry, including restored auth, only
  after account/lobby readiness and pending push navigation resolve. Desktop,
  standalone, reload, history recovery, deep links and recoverable sessions are
  excluded. Explicit logout/login can establish a new entry; token refresh,
  focus, route navigation and snooze expiry cannot. Leaving the lobby cancels
  pending automatic admission. No polling or delayed-popup timer was added.
- `AccountAccessGate` exposes enabled-account and reminder visibility through a
  small context. The existing email reminder has priority; the dialogs do not
  stack. Authentication, approval and verification authority are unchanged.
- `private.mobile_onboarding` is keyed by account UUID and tutorial version.
  Absent version-1 records are eligible, so existing and future users roll out
  equally without registration backfills. Browser storage is not preference
  authority. Standalone detection never writes completion.
- Maybe Later, X, Escape and outside dismissal snooze seven days using database
  time. Don't Show Again and Done are terminal for this version. Duplicate
  snoozes cannot extend the current window; stale decisions cannot reopen a
  terminal preference. Saves carry the expected account UUID. Save errors offer
  a retry instead of pretending persistence succeeded.
- Help → Install App & Notifications uses the same tutorial on desktop, mobile
  and standalone, regardless of saved decisions, and never rewrites them.
- Open Notification Settings closes the guide and opens the existing Settings
  with Notifications expanded. In automatic mode this defers the tutorial for
  seven days; manual mode has no preference writes. The existing device Enable
  button remains the permission owner. Delivery, subscriptions, notification
  categories, per-match choices and quiet hours are unchanged.

## Database qualification

Installed migration: `20261104202040_mobile_install_onboarding.sql`.
The CLI initially generated `20261104201417`; the file was renamed to match the
MCP-assigned installed migration identity, without changing its SQL.

Candidate and installed `supabase/tests/mobile_onboarding.sql` passed inside
BEGIN/ROLLBACK: missing-record eligibility, server-clock seven-day snooze,
expiry, duplicate requests, completion/dismissal retention, account isolation,
invalid versions/actions, expected-identity rejection, unauthenticated/disabled
denial, private-table denial and zero public-state/notification-setting writes.
Zero onboarding rows remain after qualification. The deployed primary key,
RLS and function privileges were checked. The public RPC is SECURITY INVOKER;
the private implementation authenticates and checks enabled access. Private
schema USAGE and table access remain revoked. The security advisor's sole
onboarding finding is informational RLS-with-no-policy: intentional deny-all
direct access behind the checked RPC.

## Client evidence and limits

- 57 focused eligibility, lifecycle, reminder, settings and splash tests pass.
- 241 existing harness tests pass. App TypeScript and Vite production bundle pass.
- The full application run initially had 3,724 passing / 12 failing tests. Two
  affected tests were corrected and pass in the focused rerun. The remaining ten
  failures reproduce on unchanged main: nine stake-default tests have an obsolete
  Mega competition RPC mock; one Mega catalog test still expects Arcade-only
  availability. These unrelated tests/product owners were not changed.
- `dev/mobile-onboarding/browser.mjs` passes 21 browser scenarios through actual
  Index, AccountAccessGate, GameLobby, tutorial and Settings components, with
  explicitly mocked backend/device permission. Includes 320/390/430 portrait,
  844 landscape, swipe/Back/dots, platform selection, admin exclusion, all exit
  choices, manual replay, refresh, fresh-entry persistence, restored and explicit
  auth, new approval, expiry, recovery, reminder sequencing and permission gesture.
  Evidence/screenshots: `qualification.local/mobile-onboarding/` (ignored).
- Physical iPhone Safari/Chrome and Android Chrome installation, OS permission
  dialogs, previously denied OS settings, safe-area behavior with browser chrome,
  and actual push delivery remain Jeremy's smoke acceptance. No physical-device
  test or authenticated production tutorial smoke is claimed.

## Release

Publish through the approved main push helper; deployment and public manifest
must identify the exact release commit. The verified publication receipt is
recorded on `release-mobile-onboarding-20261104-verified`. Existing manifest,
service worker, gameplay, recovery, finances and notification delivery are
preserved. No real-money session is created or changed for qualification.

Owner smoke: open a fresh mobile browser entry, complete or defer the guide,
replay from Help, install from the browser, and confirm the installed launch skips
automatic onboarding. Open Notifications and test the desired alerts/quiet hours.
