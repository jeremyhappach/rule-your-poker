# Simultaneous sealed async rounds — release qualification

2026-11-27. Jeremy approved the card preview and implementation for new matches
only, including explicit OK acknowledgement of settlement messages. Hosted
migrations `20261127225944` and `20261127230929` are installed and their rollback
proofs pass. Recovery worker version 6 is active. Admission remains disabled
until the matching client commit is verified on Vercel. Owner smoke is pending.

Worktree: `C:/Users/jerem/source/repos/ptown-async-sealed-rounds`, branch
`codex/async-sealed-rounds`, based on `820412b7505a5025806d079a3ee79c60ffe4fd55`.
Unrelated Words preview changes in the main worktree and Six Card Golf work in
the original worktree must remain untouched.

## Ownership and preservation

New matches receive immutable `delayed/sealed/1` at INSERT only after a separate
closed-by-default admission flag is enabled. Existing matches, including old
invitations accepted after release, retain `delayed/1`. No historical row update.
Run21, TriTowers, Quintzee, Boxdrop, Mega Card Golf, Take Two, Crib Lab and Chucky
Showdown use private per-player boards and shared paired-round advancement.
Five Alive keeps its current sealed engine. Chess and Words retain their engines
and existing first-player choice. New settlement presentation uses OK; old
matches retain their existing presentation.

`supabase/delayed/sealed-rounds.sql` owns new authoritative admission, per-player
projection, CAS commit and shared round progression. The generated migration
also adapts existing home/review/notification/presence owners, blocks legacy
mutation routes on new-flow children, and preserves canonical financial owners.
`server/delayed/sealed.ts` uses the existing shared gameplay adapter and worker.
The existing game cards retain their score slots and show completed-round counts.

## Qualification evidence

- 78 focused adapter/card/result tests passed. App TypeScript check passed.
- Full release build passed: TypeScript, 4,470 application tests, 241 harness
  tests, release tooling, and the 90 MB gate (89,857,621 static bytes).
- Hosted rollback proof passed all eight games in fake and real money, using
  actual SQL or TypeScript game cores; Run21 tie extension and Mega holes included.
- Canonical chips, final snapshots, account postings, balanced transfers,
  settlement replay, late command replay, outsider rejection, sealed results,
  counts, paired advancement and old invitation preservation checked.
- Injected financial failure rolls back gameplay, result and financial writes;
  retry succeeds. Both-absent draw and invalid-stake rejection checked.
- Independent PostgreSQL sessions passed simultaneous starts/submissions,
  duplicate replay, stale same-player rejection and concurrent final-child
  settlement in both money modes. The isolated clone uses exact current hosted
  financial function definitions and the actual account-posting conflict index.
- Hosted continuation proof passed sibling completion without early settlement,
  both-player optional bonus Play/Skip, final review acknowledgement, recovery
  claims, and disabled-account recovery. The worker-only recovery load does not
  grant disabled players permission to act.
- Viewer-specific deadline proof prevents a peer's expired board from hiding
  an available independent round. Legacy Tri mutation routes reject sealed games.
- Actual card components passed Edge loopback browser checks at 320, 390 and
  1024 widths: all nine cards, no overflow or page errors. Actual settlement OK
  acknowledged and returned to match home. Evidence under
  `qualification.local/async-sealed/` (screenshots and browser.json).
- Broader delayed suite previously had 170 passes and two pre-existing Tri step
  expectation failures (expects delayed_tri_step; existing service calls
  delayed_tri_bonus_step). Do not count those as a passing release suite.

## Publication and acceptance

1. Commit/tag/integrate/push the qualified client and verify the exact commit on
   the production Vercel deployment. Checkpoint: `async-sealed-rounds-20261127`.
2. Enable private.delayed_sealed_release only once compatible client and worker
   are confirmed published. Matches created before enablement remain legacy.
3. Jeremy performs production smoke: both start immediately; opponent results
   remain sealed; counts 1/0; waiting; paired reveal and next round; OK dismissal;
   existing matches and Chess/Words preserve their prior flow.

The existing approval covers the implementation and release scope. Any request
to continue after the execution budget is solely the AGENTS.md circuit breaker,
not a new product, migration, commit, or deployment approval requirement.

## Reproduce

`node dev/async-sealed/build.mjs` rebuilds the migration from the captured deployed
function definitions and new SQL. Those preimages contain no customer data.
Capture `select private.mega_competition_config()` into the ignored
`qualification.local/async-sealed/mega-config.json` before generating TypeScript
proof commands (live course config IDs are authoritative).
Bundle `dev/async-sealed/typescript-proof.ts` with the installed esbuild, execute
it immediately before the proof (timestamps must remain within game clocks).
In one BEGIN/ROLLBACK transaction execute: candidate migration, sealed-proof.sql,
generated typescript-templates.sql, sealed-typescript-proof.sql,
sealed-atomic-proof.sql. Never commit these synthetic fixtures.
Append sealed-continuation-proof.sql for recovery/bonus/continuation coverage.
The viewer deadline forward migration has its separate sealed-deadline-proof.sql.
`node dev/async-sealed/browser.mjs` runs the local browser proof. The independent
session harness is dev/async-sealed/concurrency-proof.ts; its evidence and exact
schema/function preimages are in dev/async-sealed/evidence/. Local clone setup
does not modify hosted data. Worker bundle: dev/async-timeout72/bundle-worker.mjs;
qualified SHA-256: 57a6afefceeac95b0a72367d116500fcf5999917426303f5323474e5583491a3.
