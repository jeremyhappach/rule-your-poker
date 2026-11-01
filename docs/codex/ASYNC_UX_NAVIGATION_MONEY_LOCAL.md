# Async navigation and real-money UX — local candidate, 2026-11-01

Historical local checkpoint; superseded by Jeremy's authorized final qualification
and release request. See [final gates and evidence](ASYNC_UX_NAVIGATION_MONEY_RELEASE.md).
The restrictions and failures below describe the initial local-only phase.

Publication was **not authorized** during that phase. Jeremy explicitly requested isolated local
implementation, offline validation and a local commit while the production
database restarts. Do not merge, push, deploy, migrate, query production or alter
financial data for this task. Other worktrees and deployments remain independent.

Branch: `codex/async-ux-navigation-money`.
Worktree: `C:/Users/jerem/Documents/Codex/2026-11-01/async-ux-navigation-money`.
Base: `a7611eaf5` (local `main` at task start).

## Ownership and changes

- `GameLobby`: Async Mode immediately above Arcade Mode opens `/delayed`.
  Multiplayer stays at `/`; its New Game dialog creates live sessions only and
  retains the existing money control.
- `AsyncInvite`: New Async Match sends directly through `delayed_create`.
  Fake Money is the default; the accessible switch turns green for Real Money.
  Real stake editors are shown only when enabled. Turning it off discards those
  edits and restores each game's capability-provided play stake. Both modes
  retain the existing positive-integer stake contract; sending zero or omitting
  stakes would violate that contract.
- Creation validates capability, opponent, lineup and stakes before submission.
  A synchronous ref blocks repeated taps, configuration is retained on error,
  and unchanged retries reuse the existing request UUID. Success gives a short
  toast and replaces the setup route with the async lobby.
- `Delayed` reuses `RealMoneyWarningDialog` before a real-money acceptance.
  Existing live warnings and acknowledgment remain. Optional content explains
  the match exposure, net settlement, no reservation, and per-game timeout
  forfeits. Consent is bound to the shown offer hash. Cancel sends no response;
  fake-money acceptance stays direct. Responses retain the existing
  `delayed_respond` path and match/offer/request identity, including retry dedupe.
- The warning's existing other callers are `GameLobby` and `NotificationTable`;
  they supply no optional content and keep their current acknowledgment actions.
  Bounded scrolling keeps the additional content usable in short viewports.
- `AsyncSessionName` applies the existing green `$` style before real-money
  names in active/pending cards, invitation details, all gameplay adapters,
  saved results, finales and archived history. Fake money has no marker.
- `NotificationBell` removes only its general My Async matches link. Invitation,
  turn, results and finale destinations, notification reads and push remain.

## Preserve list

No backend, RPC, migration, rule, ledger, balance, settlement, recovery, presence,
deadline, notification-delivery, audio or splash implementation changes. No new
queries, mode-selection page, game activation, or actionable-count dependency.
The existing unified parent list and child cards retain scores, pending reviews,
simultaneous turn states, timers, progress, archive entry and result admission.

## Local validation

The worktree reuses installed dependencies through a local node_modules junction;
no packages or tools are installed. Its ignored `.env.local` points Supabase to
`http://127.0.0.1:15419` with a synthetic key. The browser runner additionally
blocks all external HTTP requests, closes WebSockets and blocks service workers.
It serves only the locally compiled application and mocked authority responses.

| Check | Outcome |
|---|---|
| `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | PASS. Installed TypeScript used; native tsgo is not installed. |
| Async component, route, realtime, notification and library tests | PASS: 200 tests across 16 files after the acceptance refresh correction. |
| Final `ResultReview.test.tsx` run | PASS: 40 tests, including new real/fake markers and failed-finale loading/return coverage. |
| `npm run test:harness:unit` | PASS: 241 tests across 12 files. |
| `npm run build` full validation pipeline | NOT GREEN: initial source sweep had 3,498 passes and four failures (details below), so its build stage was not reached. |
| `node node_modules/vite/bin/vite.js build` | PASS for final source; existing large-chunk warnings remain. This is a local production-mode bundle with synthetic loopback configuration. |
| `node dev/async-ux/browser.mjs` | PASS at 320×740, 390×844, 844×390 and 1280×900. Zero external requests and zero page errors in each final run. |
| Diff review / whitespace check | PASS; no migrations, dependency updates or generated artifacts included. |

The broad run's two async realtime-test failures came from allowing the new
awaitable refresh to return through the event callback. The callback now retains
its void contract, while acceptance alone awaits the refresh. Both tests pass
in the 200-test rerun. An unrelated Battle 31 lazy-rules loading timeout passed
in an isolated rerun (two tests); its code was not changed.

One unresolved baseline failure remains:
`src/components/GameLobby.maintenanceOwner.test.ts` expects the exact old
`({ userId, isMaintenanceMode }: GameLobbyProps)` signature. Base commit
`a7611eaf5` already includes `onInitialLoad` from the splash workstream. The
test and that callback are unchanged here. The overall repository validation
command must not be described as passing. Resolve/qualify this baseline test
separately before treating the full release pipeline as green.

Browser coverage includes default multiplayer entry, Async above Arcade,
live-only New Game, direct sending with one request, stake validation and reset,
successful return/toast, pending invitations, real-money confirmation/cancel,
fake-money direct acceptance, mixed child turns/results, notification entry,
archive/finale money markers, return navigation and viewport overflow checks.
The narrow setup and confirmation screenshots were visually inspected.
Logs, browser JSON and screenshots reside in `qualification.local/async-ux/`
(ignored). Only the reusable fixture runner is committed.

## Deferred qualification and release gate

Local mocks do not prove installed database admission, balances, authorization,
invitation acceptance or financial settlement. No production reads or tests were
attempted. Those checks are explicitly deferred until the database is available
and Jeremy authorizes the next qualification/release scope.

Before release:

1. Reconcile this local commit with the then-current main in an isolated checkout,
   review any overlapping UI changes, resolve the separately owned baseline test
   failure, and rerun local checks on the exact result.
2. With explicit authorization, inspect the deployed async capability/create/respond
   contracts and verify compatibility with the unchanged request shape. Exercise
   existing rollback-contained admission/financial proofs for both money modes,
   including duplicate/replayed requests and stale-offer rejection; retain actual
   balance/ledger assertions and verify cleanup.
3. Verify two-human fake and real invitations: configure, send once, see pending
   status, cancel real consent without acceptance, then acknowledge once and
   recover both clients. Check real-to-fake switching and failure/retry behavior.
4. Verify mixed child turns, pending results, notification deep links, completed
   history and finale; smoke live New Game and Arcade navigation. On an actual
   iPhone, check switch, modal scrolling, keyboard, labels and back navigation.
5. Obtain explicit production release authorization before integration or push.
   After an authorized release, verify deployment identity and Jeremy's smoke.

No financial authority is added. The remaining material risk is compatibility
and behavior against the unavailable installed authority, which local fixtures
cannot establish. Physical-device and production acceptance remain open.
