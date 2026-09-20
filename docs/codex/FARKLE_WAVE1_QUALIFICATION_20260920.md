# Farkle Wave 1 qualification — complete

Recorded 2026-09-20T16:55:41.142Z. Qualified source and published preview SHA:
`e80200300ee81597f8ac11447a2aa15069107644`.
Applied production migration: `20260920155333_farkle_wave1_authority` on
Supabase project `xvhmbuppghwmwpwrkzao`.

The fresh uninterrupted browser campaign passed all 21 mandatory cases without
retries: entry/reconnect, pause/reconnect/resume, and terminal settlement/reconnect
for Holm, 3-5-7, Cribbage, Gin, Horses, Ship Captain Crew, and Yahtzee. The final
Yahtzee case completed at 2026-09-20 16:48:09 UTC. All seven terminal observer
proofs passed, with no recorded violations, coverage problems, progress problems,
or peer-budget breaches. All 21 fixtures have cleanup receipts; the final
production query independently found zero associated games, players, rounds,
dealer games, results, and session-player snapshots.

The exact published preview build was verified by its build manifest:
https://ptown-poker-bishxycfs-jeremy-8e2b.vercel.app. It uses the production Supabase project.
Main was not integrated or published by this qualification.

## Gates

| Gate | Final result |
| --- | --- |
| Exact focused card-face test, unchanged 15-second limit | Pass, 548.6263 ms |
| Complete application suite | 1,639/1,639 pass, 240 files |
| Harness suite | 226/226 pass, 11 files |
| Required regression coverage within the full suite | 282/282 pass, 41 files |
| Typecheck and production build | Pass |
| Fresh mandatory browser campaign | 21/21 pass, one attempt each |
| Applied-state authority SQL | 110/110 pass; restoration verified twice transactionally |
| Seven shared function definitions, owners, grants | All match validated candidate |
| Final production migration version | 20260920155333 |
| Browser fixture cleanup | 21/21 receipts; final related-table counts zero |
| Farkle creation enabled | false |
| Admin-only gate | true |
| Production defaults approved | false |
| Seeded Farkle production defaults | 0 |

## Timeout finding and preserved files

The unchanged card-face test was healthy in focused isolation and in the complete
application suite (its two-test file completed in 3,304 ms). The earlier 18,327 ms
run overlapped browser qualification and hit its existing 15-second deadline.
The evidence supports timing/resource contention, with no demonstrated deterministic
Wave 1 regression. Original host telemetry cannot distinguish CPU scheduling,
memory, and filesystem pressure. No product or test changes or timeout increases
were made. The earlier failed attempt remains failed and is not combined with
this passing browser campaign.

The existing authority-worktree generated files remain untouched and excluded
from commits: `src/lib/cribbage/__snapshots__/cribbageArtifactDescriptors.test.ts.snap`
(newline-only test snapshot difference) and `supabase/.temp/cli-latest` (CLI cache).
This qualification used a fresh detached worktree at the qualified SHA. Its build
also regenerated the same newline-only snapshot; normalized contents were verified
identical to HEAD and it was left untouched. No cleanup policy was bypassed.

## Evidence and stop boundary

The durable machine-readable record is
[qualification.json](../../supabase/farkle/qualification/20260920/qualification.json),
with SQL results, final database verification, deployment identity, focused-test
results, regression coverage, and generated-file inventory alongside it. Raw build
and browser logs/artifacts remain at
`C:/Users/jerem/Desktop/poker/farkle-wave1-qualification/test-results/wave1-qualification-20260920`.
Their SHA-256 manifest is preserved in the durable evidence directory; manifest
SHA-256: `c9904537203f43b8bc58216fb76ed42d4fbd70cf3def8833d316a678ed3514a6`.

Jeremy's narrow execution-budget exception authorized completion of the existing
campaign, final verification, and this evidence record only. Wave 1 qualification
is closed at the exact SHA above. Main integration, Wave 2, production scoring
defaults, and further implementation remain held. No new commit, push, migration,
release-setting mutation, or tag was performed during this qualification closure.
