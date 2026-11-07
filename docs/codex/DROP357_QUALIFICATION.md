# 357 Drop / 1 — November 7, 2026

Jeremy approved the supplied `357-drop-codex.zip` and the four revised upper
category bases: quads 2,250; straight flush 2,900; royal flush 3,700; five of a
kind 4,500. Rank additions and the natural bonus are unchanged. This fixes the
original natural-full-house / wild-quads category overlap. See `DROP357_RULES.md`.

## Ownership and preservation

`supabase/drop357/rules.sql` owns frozen v1 dealing, legal placement/pass,
wild-card classification, best-five selection, lane bonuses, deadline and final
tally. The v1 functions are frozen; a future incompatible version needs retained
v1 dispatch, not an in-place reinterpretation of historical results.
`supabase/drop357/arcade.sql` wraps the shared Arcade start, lock, revision,
receipt, commit and immutable result owners. Identity is the run UUID and its
`:1` board identity. The projection allowlist never exposes the remaining deck.

`server/arcade/service.ts` routes the authenticated API and recovery worker.
`useDrop357` retains the exact pending command UUID across lost responses,
rejects regressive or semantically changed equal revisions, and resumes from
persisted server time. `SoloDrop357` presents the lane board and returns to
`/arcade/357-drop` after its presentation-only tally. Recovery/fresh completion
mounts do not replay the tally. Existing games, competitive rules, historical
scores and all multiplayer/financial state are preserved.

The supplied 1466 × 564 banner is encoded without cropping into the established
480w and 960w WebP slots (20,456 / 55,816 bytes). Gameplay uses the existing Peoria
bridge artwork, canonical card faces/backs, shared Rules, Sounds and Abandon
controls. Board-container geometry adapts to landscape without viewport patches.

## Evidence

- `supabase/tests/drop357_proof.sql`: rollback-contained scoring examples,
  wheel/ace rules, natural selection, all-three bonus, final-millisecond rounding,
  frozen filled lanes, last-slot passes, private shuffle, owner/service privileges,
  duplicate starts, stale commands, mismatched replay, terminal failure rollback,
  late replay after a successor, unranked abandon, zero-client timeout, worker
  replay, equal-score ranking and both leaderboard windows. Transaction-local
  write counters assert zero writes to other public/private application tables.
- `dev/drop357/oracle.mjs`: 240 deterministic comparisons with an independent
  exhaustive wild-rank evaluator, including three-card and best-five-of-seven
  selection. The production scorer uses bounded category construction instead.
- `dev/drop357/races.mjs`: separate database connections compete on duplicate
  starts, duplicate UUIDs, different commands and terminal worker/action races.
  One winning revision and one result; injected result failure rolls back.
- `dev/drop357/worker.mjs`: the exact release bundle executes claim → game step
  → completion against disposable PostgreSQL; invalid and reused tokens fail.
- `dev/drop357/browser.mjs`: actual Arcade tile → Rules → Play → API dispatcher
  → PostgreSQL → 15 placements → final score → leaderboard, all three last-slot
  passes, reload with the same clock, lost-response replay, abandon cancel/confirm,
  sound-on and mute, natural/all-three presentation and unattended timeout.
  Screenshots and browser receipt: `qualification.local/drop357/browser/`.
  Layouts: 320×568, 375×667, 390×844, 667×375, 844×390 and 1280×720.
- Focused catalog, Arcade tile/switchboard, subscription and completion regression
  suite: 49 passing checks. Application TypeScript and production Vite bundle pass.
  `tsgo` is not installed; the existing TypeScript compiler was used without
  installing tools or dependencies. Existing chunk-size/Browserslist notices remain.

Run local proofs against a disposable `drop357_v1_<digits>` clone using the
existing `dev/quintzee/database.mjs` connector. `proof.mjs <db>` includes the
candidate inside rollback; `--installed` checks the installed definitions.
`package.mjs` reproduces the migration from the two SQL source files.

## Hosted release

Migration `20261107195319_drop357_arcade_v1` is installed on
`xvhmbuppghwmwpwrkzao`. Hosted candidate and installed rollback proofs passed;
zero synthetic 357 Drop runs remained and admission stayed closed.
Installed game authority MD5: `1fd59148571c84cb30444c2c8de7b5d2`.

Recovery worker v20 is ACTIVE and its downloaded source matches the qualified
release bundle. Its only change from deployed v19 is the 357 Drop dispatch.
The deployed Mega shuffle packaging is deliberately preserved; rebuilding the
entire current-main worker would also move that unchanged shuffle into its newer
shared module. `prepare-worker.mjs` verifies the inspected v19 source SHA-256
before adding the dispatch. Qualified release source SHA-256:
`5b5911f8beaf298795f48be69dd9c559147873ed9a2c71f03f026098639c0eb5`.

Checkpoint: `357-drop-v1-2026-11-07`. Publication is identified by the matching
`-verified` tag. Activation runs only after that exact production commit is READY,
the publication marker matches, and the worker is healthy; `activate.sql` also
checks the installed authority digest. Owner smoke remains pending.

## Owner smoke

On iPhone PWA, open Arcade → 357 Drop. Check the complete banner, Rules and all
15 slots in portrait/landscape. Hear the first placement and Pass with Sounds on,
then mute. Complete a natural, verify its badge and selected five, and finish the
board to compare base/time bonus/final leaderboard score. Reload mid-run and
confirm the same cards, passes and deadline. Let another run expire and verify
only completed lanes bank. Physical speaker/device acceptance remains Jeremy's.
