# Ptown Words fake-money bot qualification — 2026-10-26

Approved: one human can play with one to three bots for UI testing. Human-only
real-money admission is preserved; bot real-money admission is rejected in both
configuration and canonical begin. The private `bots_enabled` flag starts false.
No difficulty levels or solo Arcade adapter. Tile point values now occupy the
bottom-right corner in both the game and original HTML mockup.

## Ownership and limits

The policy searches the pinned ENABLE2K index using only the public board, history,
bag count and acting bot rack. It never receives opponent racks or bag order.
Prefix and perpendicular-word pruning bound each search to 8,000 nodes / 48 valid
candidates. It selects the highest score found; it is deliberately not exhaustive.
Trials use a synthetic hidden-state-free simulation and read only move points.
The real /1 reducer revalidates the selected move and owns actual draws/endings.
When no move is found, it exchanges once if eligible, then passes. Blanks use the
same letter assignment and zero-point scoring as humans.

The accepted Boxdrop bot scheduling pattern is reused, with Words-specific reducer
arguments and private-seat projection. Row locks and revision/actor/phase/identity
rechecks prevent concurrent workers advancing the same turn twice. The 750ms
eligibility delay is consumed by the existing five-second recovery worker: expect
roughly one to six seconds, potentially longer under load. Each batch searches at
most two matches. A scoped UUID overload and the existing global scheduled entry
delegate to the same implementation. All bot/recovery functions remain private.

Human turns remain 180 seconds. Expiry performs one pass and grants the successor
a fresh clock. Two consecutive full rounds of passes end the game. Existing
pause/resume, all-human auto-fold safety, settlement and terminal owners remain
unchanged. No settlement/scoring function, dictionary, cron, or money policy change.

## Evidence

- Hosted candidate rollback and installed rollback proofs PASS for migration
  `20261026234550_ptown_words_fake_money_bots.sql` and admission guard
  `20261026235142_ptown_words_bot_accepted_human_guard.sql`. Proofs use scoped recovery and
  roll back synthetic users, matches, flags, results and financial changes.
- Existing core and twelve human financial cases rerun: 2/3/4 players × fake/real
  money × winner/tie, actual chip changes, balanced ledger, final snapshots,
  duplicate/stale/conflicting/late replay, authorization, stake validation,
  injected financial failure, continuation and terminal recovery.
- Bot SQL proof covers one human plus 1/2/3 bots, real-money/closed-flag rejection,
  rejection if the only human sits out during ante-up (reproduced before the fix),
  canonical auto-consent, private-input rejection, blanks, pause/resume,
  zero-client play, winner/tie settlement and terminal close.
- Separate local connections race ordinary and terminal recovery: one revision,
  one result, one balanced transfer batch, total 200 canonical chips preserved.
- A complete policy game reaches its legitimate ending in 40 turns / 40 word
  placements. Slowest chooser in this run: 291ms. This is a bounded qualification
  sample, not a production load benchmark.
- Real Game route, one browser: select/setup, canonical bot admission, human pass,
  autonomous word, human handoff and reconnect PASS. Screenshots at 320×568,
  390×760, 844×390 and 1024×760 confirm point values at the tile corner without
  overlapping letters. Zero browser page errors. 40 focused tests and TypeScript PASS.
- Full source qualification: 2,959 assertions across 431 files. Initial run had
  all assertions passing but an unrelated cribbage Node/WebSocket Event error;
  unchanged full rerun cleared that error but hit the existing one-second
  TriTowers lazy-help wait. Both affected files pass unchanged together (10 tests).
  All 241 harness tests and the production bundle pass. No unrelated test/product
  code was changed. Human full-route terminal/reconnect regression also passes.
- Supabase security advisory categories/counts unchanged after migration. Existing
  shared-table advisories are not modified by this release.

Reproduction: `prepare-bots.mjs` creates the guarded migration from the captured
deployed contract. `bot-local.mjs`, `bot-race.mjs`, `bot-browser.mjs` and SQL proofs
provide local evidence; local route server uses `PTOWN_WORDS_BOTS=1`. Hosted proof
combines core/proof/bot-proof in one rollback transaction, replacing only calls
`PERFORM private.ptown_words_recover()` in the human proof with its exact dealer UUID.
Evidence JSON is under `dev/ptown-words/evidence`; screenshots stay local under
`qualification.local/ptown-words/browser`.

## Release / owner smoke

After full build/test gates and exact-SHA READY publication, enable only
`private.ptown_words_release.bots_enabled`. Human admission stays open throughout.
Production activation and deployment verification are recorded in the delivery
report; physical smoke is not claimed by automated qualification.

Use a fake-money table with yourself and at least one bot. Select Ptown Words,
start, place or pass, observe the bot's word and turn handoff, zoom/pan and inspect
tile points, then reload during play. Existing pause and end-session controls
remain canonical. Verify the final payout and Session Ended when the match ends.
