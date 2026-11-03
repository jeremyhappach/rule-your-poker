# Async Words opponent-turn inspection — local, unreleased

2026-11-03. Requested implementation is isolated on
`codex/async-words-view-only`, based on `origin/main` at `0524b20bf`.
No push, deployment, hosted migration or customer-data mutation is authorized
or performed. The original Six-Card Golf checkout remains untouched.

## Behavior and authority

The active match lobby offers **View board** for opponent-owned Words games.
Entry reads `delayed_words_inspect`, validates the child/match/viewer identities,
and chooses inspection from the returned active-player UUID. Lobby hints do not
grant gameplay access. Inspection mounts the existing board/rack with the compact
**Opponent's Turn — View Only** banner, full-contrast private letters, scores,
rules/history and normal three-scale zoom/pan. Mutating controls are disabled.

The inspection component does not mount `usePtownWords`, replay session-storage
commands, publish playing presence, subscribe, refresh on focus/online, schedule
deadline recovery or replay an earlier word's automatic return. Its snapshot and
displayed clock stay as loaded until exit. Returning to Match Home mounts the
existing authoritative lobby refresh; reentry checks ownership again. Normal
active-turn recovery, action authorization, scoring/return, completion and archive
owners are retained. Other async games keep their existing entry restrictions.

The old `delayed_words_snapshot` can run health/expiry mutations. Therefore a
separate authenticated, STABLE inspection RPC is required to satisfy passive
viewing, including overdue turns. `supabase/delayed/words-inspect.sql` reuses
`private.delayed_actor` and the existing membership/removal/private-rack projection;
it adds no table, worker, action, deadline, notification or financial owner.
The Supabase CLI is not installed in this environment: this is a named SQL
candidate, not an installed or registered migration. On an explicit future
release, generate the migration with the CLI, install/prove it before the client,
and verify publication. Do not publish the client alone.

## Validation

- 278 tests pass across 24 Words/async suites, including five new regression
  cases and the retained notification, invitation, results and archive checks.
- App TypeScript check (`tsc -p tsconfig.app.json --noEmit`) and Vite production
  bundle pass. `tsgo` is unavailable; no tools/dependencies were installed.
- `node dev/async-words/inspect-proof.mjs` passes eight local PostgreSQL groups
  with all fixtures and candidate DDL rolled back. It proves complete entry
  reads, rack privacy, actor/outsider/anonymous permissions, zero table writes
  even overdue, action rejection, handoff/reentry, replay and terminal projection.
  Local database `async_real_1793571492049` uses byte-identical normalized deployed
  definitions for `delayed_actor`, `delayed_human`, `delayed_held`,
  `delayed_words_view` and `ptown_words_visible` (read-only comparison).
- `node dev/async-words/inspect-browser.mjs` passes actual route/shell/board tests
  in installed headless Edge at 320×568, 390×844, 844×390, 768×1024 and 1280×800.
  It checks banner/board/rack bounds, disabled actions, zoom/pan, frozen view,
  lobby reentry and a normal active-turn pass. Transport is a loopback fixture;
  database authority is proven separately. Screenshots were visually inspected.
- Ignored evidence: `qualification.local/words-inspection/` (SQL/browser JSON,
  screenshots, regression/typecheck/build logs). Existing Browserslist age and
  large-bundle warnings remain outside this feature's scope.

Physical iPhone/Android gestures and hosted two-player smoke remain unverified.
After release, A should finish a turn, reopen Words via View board, inspect/zoom,
remain unchanged while B plays, then return home and reenter to play. Check that
the banner disappears, own rack is correct, and results/archive still work.
