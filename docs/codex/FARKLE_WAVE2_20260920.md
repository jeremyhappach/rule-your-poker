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

Final foundation check: typecheck/build, all 1,649 application tests and 226 harness
tests pass. Isolated component checks pass at 390x844 and 1280x900, with no page
errors or horizontal overflow and exact Hold selection [0,1]. Mobile rendering
was inspected in the app dark theme. These fixtures do not qualify live gameplay.
The 35-minute repository circuit breaker ends this pass; continue with live-route,
terminal/continuation and reconnect ownership, then full playable qualification.
