# My Async Matches blank screen — local P0 correction — 2026-10-30

## Scope and ownership

Owner report at 13:36 UTC: notification bell → My Async Matches produces a blank screen. The existing WWF task owns this local correction in `codex/async-combined`; the checkout was clean and prior work was preserved. The separate incident task owns Holm and 3-5-7. This fix has **no production publication approval**. No migration, customer repair or financial change is included.

## Confirmed failure boundary

Commit `360382198ca9a41dc3f113ac7980d7a24a01ee16` introduced `AsyncTurnEntry` as the shared async route/loading fallback. At `/delayed`, there is no match ID, child ID or navigation hint. Both optional equality comparisons nevertheless evaluated true (`undefined === undefined`), then the component accessed `hint.reviewPending` and threw. The lazy fallback was outside an error boundary on the list route, so React unmounted the application.

The unmodified compiled App reproduced the exact bell → My Async Matches action with a delayed lazy chunk: `Cannot read properties of undefined (reading 'reviewPending')`, empty body, one lazy-chunk request and **zero delayed_list requests**. Four of ten new entry regression cases failed before correction. The root failure precedes any match data; it is not an empty-list or settlement problem.

Read-only deployed evidence confirms `delayed_list(timestamptz,uuid)` returns a JSON array (including `[]` for no results), excludes removed matches, enforces current-user participant membership and projects each row through `delayed_home`. No customer rows were read or changed. The current public manifest still identifies the introducing commit.

The previous full-entry proof clicked a particular notification into `/delayed/:matchId`, then Take Turn. It never exercised the unparameterized My Async Matches link. Its populated match ID made the missing-hint comparison false, so that proof missed this distinct route.

## Local correction

- `AsyncTurnEntry` requires nonempty match and child IDs before admitting a matching presentation hint. Missing, null and incomplete hints safely retain the existing shell; valid named result introductions still work and hints from another child remain rejected.
- The existing `RouteErrorBoundary` now wraps the async lazy component **and its Suspense fallback**, covering list, match, setup, review/finale and play destinations. Unexpected render/chunk failures remain explicit, with the existing retry/reload UI. Other game routes and the shared boundary implementation are unchanged.
- A match-list fetch error exposes Retry, which calls the existing refresh owner. Failed fetches are not converted into empty lists.

No new lifecycle owner, timer, polling, gameplay rule, financial transfer, result acknowledgement or server mutation was added. Existing invitation names, explicit Quintzee Start, review holds, per-viewer result privacy, deadlines, fake-only admission and parent settlement are preserved.

## Verification

Ten new entry tests cover absent/null/incomplete route state, list/setup/match/play URLs and matching versus wrong-child names. The focused async/release suite passes **128 cases across 10 files**. The final aggregate source/server suite passes **3,275 cases across 462 files**. Application typecheck and the ordinary production build pass (existing large-chunk warnings only). No test assertions or timeouts were relaxed.

`dev/async-combined/match-list-browser.mjs` runs the actual compiled App, Index, notification provider, auth/client code, lazy route and match-list renderer. Only transport is synthetic and confined to loopback; no component or hook aliases are used. **12 scenario groups pass** at 390px and 1280px: active, empty, completed-only, fetch failure, chunk failure and malformed response. Ordinary groups exercise cold bell entry, warm bell navigation, direct entry, refresh and slow list requests. HTTP failure recovers through Retry; chunk failure recovers through Reload. Malformed responses remain visible errors rather than fake empty results. No external HTTP, gameplay actions, review ACKs, unhandled page errors or horizontal overflow were observed in the passing flows. Active-list and chunk-error screenshots were inspected.

This proves the real app path with controlled responses, not owner production acceptance. Run after a loopback fixture build with `VITE_SUPABASE_URL=http://127.0.0.1:15402` and `VITE_SUPABASE_PUBLISHABLE_KEY=local-fixture-public-key`. `--baseline` is intended for the uncorrected commit. The ordinary production build is restored after browser qualification.

Local ignored evidence under `qualification.local/async-combined/`: `list-baseline.json`, `list-baseline-blank.png`, `list-baseline-test.log`, `list-focused.log`, `list-browser.json`, `list-*-390.png`, `list-*-1280.png`, `list-typecheck.log`, `list-all-tests.log`, and `list-production-build.log`.

## Release state

Read-only reconciliation found publisher `40975079661` still at attempt 1/completed failure; no owner retry exists. Production remains `360382198ca9a41dc3f113ac7980d7a24a01ee16`. The old publication lock is still owned by this task (`01a17a83-29ab-7833-a053-d38f3df3ab15`) and is retained because the old receipt remains unresolved. No rerun, redeploy, access bypass, push or migration is part of this local P0 pass. A production release of this correction requires owner authorization.

Owner acceptance after a separately approved release: open the bell → My Async Matches on a cold page and after returning from a match; confirm the appropriate list/empty state, then refresh and open `/delayed` directly. A temporary fetch failure should show its error and Retry, never a blank screen or fabricated empty list.
