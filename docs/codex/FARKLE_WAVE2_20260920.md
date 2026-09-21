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

## Additive postgame — setup handoff proved, production apply held

`public.farkle_advance_postgame` validates game/dealer-game/round/hand identity,
terminal frozen state and the existing Wave 1 settlement. Durable private receipts
make duplicates and late calls read-only, including after a subsequent dealer game.
Participation intent is consumed atomically; clockwise dealer rotation uses the
next lower occupied eligible seat. Scoring and chip settlement stay with Wave 1.

The setup-timeout correction is entirely inside this isolated owner. Farkle remains
the live family through terminal settlement and ended-session frames. On entry to
`game_selection`, `dealer_selection` or `waiting`, the owner clears both the current
dealer-game identity and the live family discriminator. This is the canonical
shell's existing neutral state. Immutable dealer-game configuration, round state,
events, results and receipts retain their Farkle identity. The later timeout runs
under the unchanged canonical setup owner in its own transaction; no Farkle claim
is leaked or persisted.

The sole shared addition remains the original `farkle_postgame` timer dispatch
branch. No other shared function, game guard, grant, Horses/SCC owner or geometry
changed. Recovery still restores the captured Wave 1 shared definition, owner,
security attributes and grants exactly while preserving additive history.

The complete rollback proof now passes 158 assertions. The added chain covers
terminal settlement → continuation → neutral setup → actual canonical timer
dispatch → dealer rotation. Actual authenticated-role mutations to chips, pot,
status, round, configuration and the generic financial RPC fail both before and
after timeout. A generic definer still cannot edit the retired Farkle round.
Duplicate/stale continuation and timeout work is harmless. Balances, scores,
configuration and semantic replay remain exact. Run Back uses the frozen snapshot
and reinstates Farkle guards when the next dealer game is committed.

The same coherent proof reruns Wave 1 authority/hardening checks, candidate/restored
seven-game SQL and canonical timer checks, two exact recoveries and fixture cleanup.
All 282 mandatory regressions and typecheck pass. Client source is unchanged from
the prior successful 1,649-application/226-harness-test build.

Production apply remains held as requested. The three database operations in this
pass were deployed inspection, a rollback diagnostic and the complete acceptance
proof; nothing persisted. Next release work must record the actual additive
migration version, run the full post-apply proof and verify metadata, cleanup and
release gates. Live client routing, presentation and complete Wave 2 browser/end-to-
end qualification remain pending. No main integration before that full gate.

Artifacts: `supabase/farkle/wave2-postgame/README.md`, `qualification.json`,
`handoff-proof.sql`, `handoff-inspection.json`, `rollback-proof.sql`,
`post-apply-proof.sql` and `restore-shared.sql`. The diagnostic's generic increment
probe was an owner-role probe, not a callable authenticated-client path; the final
proof separately verifies actual authenticated-role rejection.

Final foundation check: typecheck/build, all 1,649 application tests and 226 harness
tests pass. Isolated component checks pass at 390x844 and 1280x900, with no page
errors or horizontal overflow and exact Hold selection [0,1]. Mobile rendering
was inspected in the app dark theme. These fixtures do not qualify live gameplay.
The 35-minute repository circuit breaker ends this pass; continue with live-route,
terminal/continuation and reconnect ownership, then full playable qualification.
