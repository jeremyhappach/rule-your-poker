# Consolidated polish qualification

Run from the repository root. These scripts use existing dependencies; install
nothing. `browser.mjs` renders the actual shared components with offline fixtures.
`preservation.mjs` checks the previous storage receipt while accounting for the two
deliberately changed Async server owners. The historical storage-only source-freeze
audit remains unchanged; it is not a gate for this subsequent feature release.

Database scripts target only the disposable local PostgreSQL database named in
`.polish-authority/context.json`, using the existing async qualification connection.
`local.mjs --bonus-setup` clones the existing `async_tri_step_1793921264326`
qualification template and applies captured production definitions. The ignored
`.polish-authority` captures are prerequisites: four games' action/snapshot/reduce/
settle SQL, `current-authority.json`, `recovery.json`, `boxdrop-ruleset.json`,
`eleven-ready.sql`, and `eleven-bot.sql`. This is a local qualification fixture,
not a general database bootstrap or production migration command.

Run `proof.mjs`, `concurrency.mjs`, `recovery.mjs`, and `projection.mjs` against that
clone. Concurrency installs `fixture.sql` only there. Never install its fixture
helper in production or run the recovery script against customer matches.

`migration.mjs --write` emits the guarded deployment SQL and frontend-first
rollback SQL under `.polish-authority`. The tracked preimage records the exact
production functions inspected before installation. Hosted qualification executes
`supabase/optional-bonus/proof.sql` and `async-proof.sql` inside ONE explicit
BEGIN/ROLLBACK transaction with short lock/statement timeouts. All fixture users,
matches, admission overrides, failure triggers and financial effects roll back.
No test user or real balance change is retained. The migration itself creates only
the bonus orchestration functions/triggers and patches four existing action entry
points; it does not rewrite player, match or financial rows.
