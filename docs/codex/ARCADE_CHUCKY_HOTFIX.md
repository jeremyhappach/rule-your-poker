# Arcade abandon and Chucky feedback — November 7, 2026

Jeremy approved implementation, qualification, migration and production publication.
Checkpoint tag: `arcade-chucky-hotfix-2026-11-07`. Physical iPhone acceptance remains pending.

## Changes and preserved behavior

All eleven Arcade games expose **Abandon run** in the top-right toolbar slot.
`ArcadeAbandonButton` only opens the existing confirmation; each game retains
its authenticated authoritative abandon command. Cancel submits nothing. Confirmed
abandon returns to the game's leaderboard without posting a result. Multiplayer
and replay toolbar paths retain their existing controls.
TriTowers keeps the control visible but disables confirmation while its existing
input guard waits for a valid phase/deadline frame.

Accepted Chucky folds retain a redacted `lastFold` receipt from the existing
authoritative action. Connected presentation holds that outgoing hand for a
350 ms sweep before the next deal or bank. This does not change server phases,
clocks, dealing, resources or action legality. Recovery seeks the current scene
silently. Confirmed wins choose one soft cue from the actual revealed Chucky
card count: standard for 1–5, a short accent for 6, and a rising accent for 7.
All cues use the global mixer, mute setting and presentation identity ledger.

New `chucky-showdown/3` runs freeze bonuses of 100, 250, 500, 800, 1,250,
2,000 and 3,000. One shared bonus helper feeds both authoritative scoring and
completion validation. Existing v1/v2 configurations, runs, results and boards
retain their original rules. The UI and Rules panel read the admitted config.
The existing evaluator, ties favoring Chucky, three rounds, deadlines, folds,
cracks and uses are preserved. Old clients must refresh before starting v3.

## Qualification

- Hosted migration `20261107141549_chucky_showdown_v3_hotfix` passed candidate
  and installed rollback proofs for v2 and v3. Authority digest:
  `b873e2f649b36feab582af16d050d67b`. Both left zero synthetic users and v3 runs.
  V3 remains staged until the guarded activation verifies the published SHA.
- The proofs cover all seven bonuses, old scoring, immutable completion, ties,
  private cards, ownership, duplicate/late replay, frozen settings, terminal
  abandon and no writes outside Arcade. Independent connections prove competing
  commands, duplicate starts, injected result failure, recovery races and late replay.
  The existing bundled worker completes all three rounds without a connected client.
- Actual Arcade components, service dispatch and local PostgreSQL were exercised
  in Edge at 320×568, 390×844 and 844×390. All eleven games passed top-right bounds,
  cancellation without a command, confirmed abandon and no result insertion.
  Fixtures provide local authentication/subscription acknowledgements; they do
  not replace the action service or database rules.
- Chucky browser checks cover all seven displayed bonuses, standard/6/7 wins,
  one accepted Fold sweep/swoosh, a lost acknowledgement, muted Fold and win,
  unmute without replay, and reload without replaying a Fold or win.
  Receipts/screenshots are under `qualification.local/arcade-abandon/` and
  `qualification.local/chucky-v2/browser/v3-*`.
- App typecheck, production Vite build, 89 focused tests and 241 harness tests pass.
  The broad app suite ran 3,885 cases: one changed Abandon label assertion was
  corrected and its full file rerun successfully. The ten previously documented
  Defaults/stake-defaults failures and one associated unhandled fixture error remain.
  Supabase security advisors report the same six existing advisory identities.

## Owner phone smoke

In each Arcade game, check the top-right control, cancel once, then confirm an
abandon and verify no score posts. In Chucky, check the Fold sweep/swoosh and
the three win accents with Sounds on, then mute and reload. Confirm the new
bonus table in Rules; a resumed older run should still show its original values.
