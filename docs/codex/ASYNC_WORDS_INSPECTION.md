# Async Words opponent-turn inspection — production release approved

2026-11-03. Requested implementation is isolated on
`codex/async-words-view-only`, based on `origin/main` at `0524b20bf`.
Jeremy subsequently authorized production installation, integration, push and
deployment verification. Main remains at the same base, so integration is a
conflict-free fast-forward. The original Six-Card Golf checkout remains untouched.

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
The connected Supabase migration tool installed it as `20261103213012` before
client publication. The exact server-generated migration version is mirrored in
`supabase/migrations/20261103213012_async_words_read_only_inspection.sql`.
The CLI remains unavailable; no tooling was installed and no migration version
was invented locally.

## Hosted release qualification

`supabase/delayed/words-inspect-hosted-proof.sql` passed before installation with
candidate DDL rolled back, and after installation inside `BEGIN READ ONLY`.
Both participants in an existing active match received the committed board,
their own rack, scores, deadline and correct turn ownership. Outsider membership
and anonymous identity were rejected; anon/service-role execution is denied.
PostgreSQL transaction write counters remained identical across all auth/public/
private tables. No historical rows, customer balances, deadlines or notifications
were mutated. Terminal, overdue and replay cases remain covered by local proof.

The security advisor reports the intentional authenticated SECURITY DEFINER
endpoint. It follows the existing private-projection boundary with explicit
authenticated membership checks and a locked search path; the hosted proof
verifies its restricted execution and private-rack behavior. See
[advisor rule](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Checkpoint: `release-async-words-view-only-20261103`. Its matching `-verified`
annotated tag records the exact production SHA, Vercel deployment, public
manifests and release-publication receipt after the approved helper push.

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
