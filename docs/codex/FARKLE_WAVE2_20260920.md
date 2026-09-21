# Farkle Wave 2 — playable integration draft

Base and integrated main: `e80200300ee81597f8ac11447a2aa15069107644`.
Wave 1 was fast-forwarded and production verified without implementation changes.
Worktree: `C:/Users/jerem/Desktop/poker/farkle-playable`; branch:
`codex/farkle-playable`. This is an unfinished Wave 2 draft, not a qualified release.

## Implemented foundation

- Isolated Farkle types and exact-scope Roll/Hold/Bank transport. Network retries
  retain the original request UUID, sequence, actor and selection.
- Server-enumerated selection previews; no client scoring, randomness, banking,
  timeout, bot strategy, endgame or settlement authority.
- Snapshot admission rejects wrong identities, regressions and frozen-config drift.
  Equal action sequence permits only an otherwise-identical deadline update at a
  newer authoritative revision.
- Six-die self controls, committed-receipt row reconstruction, independent remote
  cluster/rumble/reveal/row animation, THIS TURN, final/tiebreak status and frozen help.
- An isolated table consumer uses canonical felt, HUD, tabs, opponent seats and
  announcements. It is intentionally not yet routed into live Game.tsx gameplay.
- Recorded-action history/replay presentation and explicit Horses-style reclaim
  calls through the existing versioned `setAutomaticPlay` owner.
- Farkle-only geometry descriptors, registered Lab controls and visual preview.
- Coming Soon selection; admins can inspect the three-field dealer setup preview.
  Its creation action stays disabled. Admin scoring fields are unsaved drafts with
  no production numeric defaults and no write path while approval is outstanding.
- General Instructions/Game Rules describe behavior without assuming scoring values.

## Remaining before playable qualification

Complete live route/realtime wiring; canonical terminal hold, chip presentation and
postgame continuation; session-ended admission; exact Run Back configuration;
shared history entry points; full reconnect/refresh and bot takeover/reclaim browser
proofs; responsive canonical-shell visual validation; and complete Wave 2 regression
qualification. The isolated components alone do not establish these behaviors.
Inspect the exact Farkle postgame continuation owner before wiring a generic
transition: the Wave 1 write-claim guards must remain intact, and the client must
never author the authoritative transition. Stop if that requires material shared-owner
restructuring or changing existing-game behavior.

No Wave 1 SQL, migration, scoring defaults, release flags, or Horses/SCC controllers,
layouts, scoring, state, or geometry values were changed. No new DB fixtures were
created during this client foundation work. Existing qualification evidence and the
separate main-integration record are preserved under `supabase/farkle/`.

## Validation record

Focused checks: 20 passing tests covering Farkle receipt retry identity, selection,
snapshot/revision admission, replay reconstruction, deterministic die ordering,
control gating and existing shell-family routing.

The first complete run passed 1,648 tests and failed the existing setup-surface
count assertion because the new isolated Farkle preview is a fourth surface. The
assertion now requires four surfaces at the same canonical modal layer and explicitly
checks the Farkle surface. No existing modal layer or timing assertion was weakened.
Raw logs, final validation and any component preview artifacts are retained locally
under `test-results/wave2-foundation/`. Final results are recorded in
`supabase/farkle/wave2-foundation-validation.json` when available.

Main integration of Wave 2 remains pending complete playable qualification. Numeric
production scoring defaults remain unapproved, unseeded and disabled.

## September 21 resume: server continuation boundary confirmed

Resumed at exact `cc426e833859e3ecfb9b5de0e5d14e0cab90af0e`. Read-only
inspection of deployed PostgreSQL confirms that Farkle settlement ends in
`game_over` (or `session_ended` for a pending session end), but there is no Farkle
postgame RPC. `private.advance_standard_postgame` and the standard postgame
timer registration admit only Holm/Horses/SCC. The Farkle round timer is cancelled
at completion. The generic client transition cannot substitute: Farkle write
guards correctly require an exact server authority claim.

Jeremy clarified that a new Wave 2 migration may extend the shared dispatcher;
the applied Wave 1 migration/history and existing-game behavior remain immutable.
The approved isolated owner and single dispatch branch are now implemented in
`supabase/farkle/wave2-postgame/`. The new migration is not applied yet.

Production creation remains disabled, admin-only enabled, defaults approval false,
and Farkle defaults row count zero. The existing resolver rejects even admin/service
test-only creation while creation is disabled. Only the main Supabase branch exists.
A running local Supabase stack belongs to another task and has no Farkle authority
schema; it was inspected without mutation. Use a separate local instance with the
qualified schema for test-only browser fixtures, preserving production flags and
the other task's stack.

The initial read-only inspection made no product/database changes. Its record is
`supabase/farkle/wave2-boundary-inspection-20260921.json`.

## Additive postgame draft — passing proofs, open qualification boundary

`public.farkle_advance_postgame` validates game/dealer-game/round/hand identity,
terminal frozen state and the existing Wave 1 settlement. A private receipt makes
duplicate and late requests read-only, including after a subsequent dealer game.
The function consumes participation intent atomically, uses canonical participation
admission when too few players remain, and rotates to the next lower occupied
eligible seat. It does not score or settle chips. Pending-session-end frames remain
intact. It restores the transaction-local Farkle claim before returning.

A Farkle-only trigger registers the existing canonical timer queue's 15-second
fallback. The sole shared change is one `farkle_postgame` branch invoking the same
Farkle owner. No Horses/SCC postgame owner, scheduler query, or existing branch
changes. Executable recovery serializes with creation/continuation, refuses active
Farkle games, disables the additive owner and restores the exact captured Wave 1
definition/owner/security/grants. It preserves all Farkle data/history.

Validation: 131 assertions in one complete rollback run, including original Wave 1
authority/hardening proofs, candidate and restored seven-game regression and
canonical timer proofs, two exact recoveries and three candidate installations,
duplicate/late replay, tie/authorization/pause negatives, pending-session-end,
canonical waiting/ended admission and fixture cascade cleanup. Typecheck/build,
1,649 application tests, 226 harness tests and 282 mandatory regressions pass.

The repository's three-database-operation budget was used by the deployed capture,
the initial 129-assertion proof and the expanded 131-assertion proof. Stop before
apply; no migration or release flag changes persisted. Final review also found an
uncovered next-phase boundary: the candidate keeps `games.game_type='farkle'` after
returning to game selection. The latest source definition of
`private.handle_config_deadline_timeout_exact` establishes the four existing card/
Yahtzee authority flags but no Farkle claim before updating the dealer player.
The Wave 1 guard would reject that later timeout. This was not exercised by the
passing proof and is not a demonstrated existing-game defect.

Next: verify the deployed setup-timeout owner and close this boundary within the
isolated Farkle continuation owner if possible (neutral setup admission while
retaining immutable dealer-game history and local terminal presentation). Prove
setup timeout, waiting admission and replay/Run Back after that handoff. Do not add
another shared-owner extension without reporting the need first. Rerun the complete
candidate/recovery proof before apply; then record the actual migration version and
run the full post-apply proof and cleanup/release checks. Resume client routing,
terminal presentation and full playable/browser qualification. No additional scope
approval is needed within the already-approved isolated scope. Wave 2 remains off main.

See `supabase/farkle/wave2-postgame/README.md`, `manifest.json`,
`qualification.json`, `rollback-proof.sql`, `post-apply-proof.sql` and
`restore-shared.sql` for the captured definition, checks and executable artifacts.

Final foundation check: typecheck/build, all 1,649 application tests and 226 harness
tests pass. Isolated component checks pass at 390x844 and 1280x900, with no page
errors or horizontal overflow and exact Hold selection [0,1]. Mobile rendering
was inspected in the app dark theme. These fixtures do not qualify live gameplay.
The 35-minute repository circuit breaker ends this pass; continue with live-route,
terminal/continuation and reconnect ownership, then full playable qualification.
