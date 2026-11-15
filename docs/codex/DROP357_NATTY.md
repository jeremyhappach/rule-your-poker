# 357 Drop natural scoring — November 15, 2026

Jeremy requested the P1 Natty correction and production delivery, then clarified:
choose whichever natural or wild interpretation pays more. Preserve all high-score
history. That clarification replaces the original 1,620 example: the printed
queen-high flush is 1,320 + 264 = **1,584**, above the wild ace-high flush's 1,350.

## Cause and correction

The deployed two-argument private.drop357_lane removed natural eligibility whenever
a selected card's rank matched its row. It selected the highest wild poker vector
before considering bonuses. The UI correctly displayed that erroneous result.

Frozen ruleset 357-drop/7 evaluates each three-card or five-card subset twice using
the existing classifier: all printed identities, then the row's wild interpretation.
Each receives its existing base points; only the printed candidate earns Natty.
Choose the greatest final score, then the existing poker vector and natural
realization for ties. Selection, vector, base, bonus and score all describe the
same candidate. Unrelated cards outside the chosen five cannot affect Natty.

The scoring matrix, integer rounding, 20% bonus, clocks, carries, passes, all-filled
bonus, time bonus, presentation and recovery remain unchanged. The existing 3s
matrix has no rank-3 payout; printed pairs/trips of threes never displace their
higher-paying wild-assisted trips, and no new matrix entry is invented.

357 Drop is currently Arcade-only. Its server scorer and commit validator share
the same version-aware entry point. The distinct multiplayer 3-5-7 poker game
does not use this points engine. No financial owner changes.

## History and release

Rules /1–/6 and already-admitted runs remain frozen. No historical run, result,
receipt or score is recalculated. /7 shares /6's existing leaderboard group,
personal bests, rankings and both time windows, as explicitly requested.

Migration: 20261115181145_drop357_natural_identity.sql. It installs /7 closed.
The source migration above was applied through the hosted migration tool as
`20261115184923_drop357_natural_identity`; the tool assigned its installation
timestamp. After matching client publication, the installed rollback proof passed
and supabase/drop357/activate-v7.sql enabled /7. Only new admissions change.
Rollback is private.drop357_select_ruleset('357-drop/6'::text); retain /7
definitions so existing /7 runs can finish and their history remains readable.

## Qualification

- 29 fixed SQL/independent fixtures: exact screenshot and suit substitution,
  natural versus higher wild straights/straight flushes, pairs, trips, quads,
  full houses, multiple wilds, unused wilds, unrelated natural subsets and zero.
- 22,429 independent comparisons: all 22,100 physical three-card hands, 300
  deterministic five/seven-card rows and the 29 fixtures. The independent oracle
  exhaustively assigns wild ranks and compares final points, vectors and selected
  cards. No result pays less than its previously available interpretation.
- Eight local and hosted rollback proof groups cover /1–/7 scoring/lifecycle,
  private projection, authorization, command dedupe, late replay, timeout,
  continuation, atomic result-failure rollback and zero multiplayer/financial writes.
- Historical snapshots and both leaderboard windows/personal bests are unchanged.
- Independent connections pass concurrent starts, duplicate/competing placements,
  carry replay, injected terminal failure, worker/action race and late replay.
- Five focused presentation checks pass. Actual native Edge browser actions flow
  through the Arcade service and PostgreSQL to the existing board; the exact
  screenshot cards show Flush 1,584, Natty +20%, five selected and two muted cards
  in portrait and landscape. Fixtures roll back.
- Full build passes TypeScript, 4,258 application tests, 241 harness tests,
  46 release-tooling checks, Vite and the unchanged 90 MB size gate.
  One unrelated Words inspection test timed out during the first full run and
  passed its focused rerun; no unrelated product or test code was changed.

Commands:

    node dev/drop357/natty-proof.mjs <disposable-drop357-db> [--installed]
    node dev/drop357/natty-oracle.mjs <disposable-drop357-db>
    node dev/drop357/natty-races.mjs <disposable-drop357-db>
    node dev/drop357/natty-browser.mjs <disposable-drop357-db>
    npm run build

## Production receipt

Commit `2f39f556a3621d765f72ce599bbe53e28b5648f4`, checkpoint
`drop357-natty-20261115`, is published by READY deployment
`dpl_4oah2QK8T1sbp3PqXARbBUEAeXTB`. Both production domains return the matching
manifest and `assets/index-B5-_G6l-.js`; root, bundle and auth return HTTP 200.
The client publication timestamp is 2026-11-15 18:34:46 UTC. Database installation,
the full installed proof and /7 activation completed after Jeremy's continuation.

Direct production verification: the exact row selects indices [0,2,3,5,6] with
queen-high vector [5,12,10,7,6,2], base 1,320, Natty 264 and total 1,584. Replacing
7♠ with 7♥ selects the wild ace-high flush at 1,350, bonus zero, natural false.
The retained /6 scorer still returns 1,350. Only /7 admission is enabled, and
its score group remains /6. The installed proof confirmed unchanged historical
runs, results, receipts, both leaderboard windows and personal bests.

Jeremy's remaining acceptance is a
fresh production run: natural eligible cards award Natty, required substitutions
do not, displayed totals reconcile, and existing high scores remain visible.
