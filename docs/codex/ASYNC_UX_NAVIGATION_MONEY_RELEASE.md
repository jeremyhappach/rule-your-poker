# Async UX final qualification — 2026-11-01

Gate: **PASS — authorized production release**. Jeremy's final qualification
request supersedes the earlier local-only restriction. Original implementation:
`a8e0f50aa37dfe455c23cebeb1607a825ed165fc`. Release checkpoint:
`release-async-ux-navigation-money-20261101`; the annotated tag records the exact
candidate SHA. Publication receipt is recorded in the subsequent annotated
`release-async-ux-navigation-money-20261101-verified` tag after verification.

## Reconciliation and scope

Fetched main twice during qualification; both times it remained
`a7611eaf558294617cb867959ae5deccc5ce590e`, already the implementation's parent.
No merge conflict or further published source changes required reconciliation.
Audio controls, splash, lobby styling, notifications and gameplay fixes remain
inherited from that base. No product redesign or backend migration was needed.

The only follow-up source change corrects the stale maintenance-owner test:
the authoritative `GameLobby` signature already includes `onInitialLoad`, and
`Index` supplies it. The assertion now includes that callback; production
behavior was not changed to satisfy the test.

## Database health and controlled recovery

Supabase project `xvhmbuppghwmwpwrkzao` (`ptown-poker-prod`) was inspected,
not assumed recovered. Database connectivity and scheduler health passed.
A stale global incident still blocked acceptance despite recovered scheduling:
`48371a99-5402-43f8-8253-3c71c6e5f715`, opened at 21:09 UTC for a missing
recovery heartbeat.

Jeremy explicitly approved canonical closure. A transaction took the existing
async advisory lock, verified the exact incident/reason, healthy scheduler,
fresh heartbeat, enabled/error-free recovery and **zero active matches**, then
called `private.delayed_incident_close`. It closed at
2026-11-01 22:18:32.081577 UTC. No customer deadlines or financial records changed.

At 22:24:21 UTC, real-money liveness again reported healthy/admission allowed,
scheduler completed with zero consecutive partial failures; async heartbeat
was 22:24:00 UTC, recovery enabled without failure, both admission flags true,
and zero open incidents. Rollback cleanup found zero proof profiles and zero
proof failure triggers.

## Financial and integration evidence

All hosted financial tests used fresh synthetic identities inside
`BEGIN/ROLLBACK`, actual caller roles, installed RPCs, financial triggers and
constraints. They did not send uncontrolled transactions or modify existing
customer financial records. No production schema changes or flag changes persisted.

| Proof | Observed result |
|---|---|
| `supabase/delayed/real-money-proof.sql`, installed production | 26 groups pass: five games × winner/opponent winner/draw/forfeit/injected failure, plus identity/authorization/stake checks. |
| Canonical financial effects | Non-tie stake 7 produces exactly +7/−7 canonical chips, matching final snapshots, one balanced transfer batch, two balanced real SessionResult account postings, one immutable settlement and terminal parent. Ties produce zero deltas and no transfer batch. |
| Injected failure after account writes | Outcome, canonical game/chips, accounts, snapshots and settlement all roll back; retry commits once. |
| Replay and continuation | Same create/accept/outcome/settlement request returns its receipt; changed request terms fail. Late old settlement cannot affect a newly created successor. |
| Availability/forfeit | Frozen 24-hour Last Call and 36-hour expiry; stale/duplicate expiry rejected; Words and service-only non-Words zero-client expiration settle through existing authority. |
| `dev/async-ux/release-proof.sql`, installed production | Both fake and real five-game parents pass: two opposing wins plus three draws yield +4/−4, one receipt, one balanced batch and two final snapshots. Fake posts zero account entries; real posts two balanced entries. |
| Unified parent and notifications | Child outcomes remain provisional until all five finish; parent retains all children, accurate completion count and money mode. Invitation and settled-result notifications are present in the recipient's actual notification center. Stale offer and a fresh duplicate acceptance are rejected without financial effects. |
| Isolated independent-connection races | 14 existing service/rule checks pass for all five games, including simultaneous final children, exact +4/−4 settlement once, action receipts, shared score/tie reducers, private opponent state and zero-client service recovery. |
| Additional create/accept races | Two independent connections race identical create and accept requests in each money mode: one create receipt, one accept receipt, two initialized children, zero canonical games/account entries at acceptance. |
| Compiled App → SQL | Fake [5] and real [7,3] invitations sent through the new UI to installed functions in the isolated database; actual notification deep-link; warning shown before real commitment; Cancel preserves the entire pending state; double taps send once; replay and reload preserve acceptance without account writes. |

The isolated database is `async_real_1793571492049`, cloned from an existing
synthetic test database. Sixty-seven installed function definitions and
application-role execution privileges were matched to production. The clone
needed the installed real-money flag column and an empty owner-close audit
dependency; these were created only locally. The hosted rollback proofs establish
compatibility against actual production schema, constraints and financial triggers.

The new proof initially assumed a fixed parent revision and left constraints
immediate between its two cases. Its assertions now inspect the canonical accept
receipt, and each case starts with the normal deferred constraint mode. These
were proof setup corrections; no financial implementation was altered.

## Regression and mobile qualification

`npm run build` passed end to end: application TypeScript, **3,505 source
tests across 484 files**, **241 harness tests across 12 files**, and Vite's
production bundle. Existing chunk-size/Browserslist warnings remain unchanged.
All relevant async suites are included in the full successful sweep.

`node dev/async-ux/browser.mjs` passed at 320×740, 390×844, 844×390 and
1280×900, with zero page errors and zero external requests. Narrow setup and
landscape confirmation screenshots were visually inspected.

All eleven requested UX behaviors pass: multiplayer default; Async immediately
above Arcade; existing unified async lobby; live-only multiplayer New Game;
gray fake/green real toggle defaulting fake; direct Send Invitation; green
money markers; shared real-money warning; bell general link removed while
deep links remain; unified mixed-state child cards; direct Lobby navigation.
Existing turns, timers, results, archived history and finale admission remain.
Browser assertions and the async source suites cover notification invitation,
turn and result destinations.

The local bundle uses an ignored loopback-only environment for safe browser
qualification. Production publishes from Git using the existing Vercel environment,
not this local dist directory. No dependencies or tools were installed.

Evidence JSON, logs, exact captured definitions and screenshots are retained in
ignored `qualification.local/async-ux/`; existing service/race output is in
`qualification.local/async-real-money/service-races.json`. Reusable browser,
acceptance-race and SQL checks are in `dev/async-ux/`.

## Publication and owner smoke

Target: Vercel `ptown-poker`, project
`prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds`, team `team_nQciG8fmHnUCogRJ7jaWawHq`,
production alias `https://holm357.com`. Integrate by fast-forward and publish
through the unchanged main push helper. Verify READY, exact Git SHA, alias
build manifest, release-publication receipt and read-only backend health.

Automated browser checks are desktop Edge with mobile viewports. Physical
iPhone keyboard, touch/scroll, installed-PWA lifecycle and Jeremy's production
smoke remain acceptance work. No physical-device or OS push-delivery pass is
claimed; this release preserves the existing push implementation.

## Smoke layout follow-up

Jeremy authorized two UI-only corrections after production smoke. The live
Create New Game button overrides its fixed small-button height with automatic
height and stretch alignment, matching the neighboring Async/Arcade stack.
The existing button component retains horizontal and vertical centering, and
all positions, colors, typography, handlers and disabled rules remain intact.
Async setup moves the explanation and fake/real toggle into a separate Match
settings fieldset above Your lineup. Both fieldsets retain pending-state
disabling; individual game controls and all behavior are unchanged.

Application TypeScript, Vite production build and 20 focused tests across
maintenance ownership, invitation creation and invitation acceptance pass.
The existing compiled-App fixture flow passes at 320×740, 390×844, 844×390 and
1280×900 with additional temporary geometry checks for equal stack/button
height, centered content and separated match-level settings above Game 1.
All four flows retain zero page errors/external requests. Narrow screenshots
were visually inspected. Logs and screenshots are retained in ignored
`qualification.local/async-ui-layout/`. No new dependencies, backend changes,
financial writes or behavior changes. React review confirms accessible legends
and the existing control/handler ownership.

Checkpoint: `release-async-ui-layout-20261101`. Its `-verified` annotated tag
records the exact production SHA, Vercel READY deployment and public manifest.
