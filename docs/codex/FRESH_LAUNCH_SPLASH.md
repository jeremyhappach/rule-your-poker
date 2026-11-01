# Approved fresh-launch splash — 2026-11-01

**Historical qualification only:** owner iPhone smoke failed. The admission and
timing rules below are superseded by
[the approved correction](FRESH_LAUNCH_SPLASH_CORRECTION.md).

Presentation only, based on production `5765ff215`. User explicitly authorized
implementation, qualification and coordinated publication. Worktree/branch:
`codex/approved-launch-splash`. No migrations, gameplay, settlement, notification
worker, audio, Arcade styling or async branding changes.

## Assets and preservation

The supplied README was read as asset specifications. The user's request governs
scope. Both production files are byte-identical to the approved ZIP; the GIF is
not shipped. The MP4 is 720×1280, H.264, 3 seconds, silent. Portrait art uses
`object-fit: contain` with a dark surround; no crop, stretch, redraw or fake lobby.

- MP4 SHA256: `6301834F808981DCE6FFA6F4FC1812D0632CADEC8D51FD202BCEFCBD8026ECD8`
- PNG SHA256: `E44CF6A6EDDF603B20CAEC8067B7C3094B1B9B63EA54CFABEE57B653F64D10A2`

## Admission and owners

`launchSplash.ts` captures document-entry evidence once, before React routing:
standalone (including iOS `navigator.standalone`), exact manifest start URL
`/?launch=home`, navigation type `navigate`, visible, no retained session or
discarded-document flag. It consumes only this exact marker with replaceState;
manifest `id`, name, scope and icons remain unchanged. Every other query/hash/path
is excluded. Unknown evidence fails closed for splash admission.

`FreshLaunchSplash` is a decorative sibling of the actual Index/GameLobby. Auth,
profile, account balance, maintenance and lobby reads run normally. Admission
requires successful initial lobby data, loaded username/balance, and a successful
read-only own-seat query that finds no non-ended session. This checks all of the
user's memberships with LIMIT 1, independently of the lobby's newest-50 list:

`players.select('id,games!inner(status)').eq('user_id', userId).neq('games.status', 'session_ended').limit(1)`

A seat, timeout, error or malformed response suppresses branding. No user IDs,
balances, game state or session history are written. The existing auth guard,
recovery lease, push worker, table landing guard, deep-link routing and financial
owners are unchanged. GameLobby's only call site is Index; its new callback reports
successful loading without changing fetching, realtime or failure behavior.

The clip seeks to elapsed startup time, retaining the approved final frame while
avoiding another full three-second wait after initialization. Admission ends at
two seconds; playback ends at the navigation's three-second mark and fades for
200 ms. These are presentation budgets, never gameplay/recovery timers. Slow
startup simply keeps the existing app UI. PNG must load before any overlay;
autoplay rejection, unsupported media or reduced motion immediately release the
PNG fallback. Hide/resume, navigation or interaction cancels; remount cannot replay.
Video is muted/defaultMuted/playsInline, has no controls or focus, and releases
resources/listeners. The decorative overlay is aria-hidden and cannot intercept
input; no new spinner, modal, audio context or screen-reader announcement.

## Platform limits

There is no universal web signal proving an OS icon tap versus an OS-restored
process. The implementation deliberately skips retained browsing sessions and
unmarked legacy installs rather than guessing and covering recovery. Existing
Home Screen installations must adopt the updated manifest start URL to qualify;
manifest `id: /` preserves app identity. Device smoke must establish adoption and
fresh-launch behavior; emulated standalone signals cannot certify iOS/WebKit or
Android process lifecycle. Native startup time before navigation is not measured.

Platform references: [PWA launch detection](https://web.dev/learn/pwa/detection),
[manifest identity/start URL](https://www.w3.org/TR/appmanifest/),
[WebKit inline autoplay](https://webkit.org/blog/6784/new-video-policies-for-ios/).

## Qualification

- Application TypeScript and production Vite build pass. `tsgo` is unavailable;
  the installed `bun run typecheck` was used without installing dependencies.
- 54 focused Vitest checks pass: launch classification, membership errors/active
  seats, playback cutoff/cleanup, actual-lobby readiness, remount, reduced motion,
  autoplay rejection/unsupported media, resume, lobby/auth/release regressions.
- 31 unchanged web-push tests pass, including cold/hot click destinations,
  invitations, table alerts, expiration and account binding.
- `node dev/launch-splash/browser.mjs`: 20 compiled-App browser scenarios, with
  synthetic HTTP authority and all external writes blocked. iOS standalone and
  Android display-mode signals, 320×568, 390×844, 412×915, 844×390 and 1024×1366;
  ordinary browser, legacy install, cold/hot push, results, table/Arcade recovery,
  real-money seat, failed membership, restored document, slow lobby, reduced
  motion, autoplay rejection, unsupported playback and failed MP4. Reload,
  BFCache resume and internal Arcade return are included. The real lobby and
  $125 fixture balance are present at every splash paint. Initial measured
  reveal completed at 3.21–3.23 seconds from navigation, including the fade.
- Read-only production PostgREST proof returned HTTP 200/[] for the exact joined
  query with a nonexistent UUID. Existing deployed visibility policies were
  inspected. No production data was created or mutated.
- Approved PNG and mobile screenshots inspected. Local evidence is under
  `qualification.local/launch-splash/`; no auth data is included in tracked files.

## Release and physical smoke

Other active work remains in its own worktrees. Check origin/main has not moved,
review/stage only this scope, create one commit and checkpoint tag
`release-approved-launch-splash-20261101`, push the task branch, fast-forward the
clean main worktree and run the unmodified approved push helper. Vercel publishes
main. Exact SHA/deployment and live asset checks belong in the delivery report.

Jeremy's final iPhone acceptance remains pending:

1. Authenticated, no active table: fully close, open from Home Screen. Confirm
   silent artwork/five final one-pip dice, then the real populated lobby with a
   quick fade and no extra spinner. Repeat a genuine new launch; record if the
   existing install retains its old unmarked launch URL/session.
2. Cold and warm push: invitation, Your Turn, results link and table alert open
   their intended destinations with no branding delay. Include real-money async.
3. Recover an existing real-money table and an Arcade run. Confirm no splash,
   unchanged route/session and normal input. Do not create financial state just
   for this branding smoke.
4. Background/foreground, app switch, refresh and internal Lobby/Arcade/Async
   navigation: no replay. Background during splash: it disappears on return.
5. Reduce Motion and Low Power Mode: PNG or direct lobby, no sound or stuck video.
   Offline/poor network: existing recovery UI, no persistent splash.
6. Portrait/landscape, large text and VoiceOver: proportional uncropped art,
   accessible lobby controls. Android owner should repeat standalone launch,
   notification, background and orientation checks on a physical device.
