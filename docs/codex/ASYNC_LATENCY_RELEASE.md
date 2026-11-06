# Async latency and Words playable clock

The November 6 release follows the [baseline audit](ASYNC_GAME_LATENCY_AUDIT.md). Ordinary Take 2, Quintzee and Boxdrop moves call one service-role database function. The function checks the stored game and calls its frozen SQL reducer, the existing commit authority and the visible-board functions. The API applies the original viewer disclosure rules to current and prior results. At a round boundary the adapter consumes the exact reduced board, including random dice, and performs its existing progression and settlement. Receipt replays, conflicts and deadlines go through the existing reconciliation path.

Run21 uses its in-flight command and original board revision to show the tentative placement. Its next card comes from the server. Give Up / Take Score sits above Pass. The fullscreen modes use the existing action row above the draw row. Table mode uses the player pane. All five column rectangles use the existing layout. Desktop mobile hit tests passed at 320×568, 390×844 and 844×390, in both fullscreen and table mode.

Take 2 retains one complete, disjoint exposed tableau pair, bound to slots, card IDs, scope and the first command revision. Only a successful acknowledgment and a still-legal next projection release it. Draws and covered cards are excluded. Quintzee and Mega identify the submitted action or card while the response is pending. Words and Quintzee consume fresh responses and read current state on recovery. Arcade omits unused profile lookups for the qualified commands.

## Measurements

48 desktop Edge cases across Async and Arcade or live, 180/600 ms per response and Sounds on/off. [Per-case measurements](evidence/async-latency-release-20261106.json). At 600 ms, Async Run21's first tentative placement appeared in 14 ms. Take 2 registered both exposed pairs with four taps and zero retaps in both modes, including the first pair of play. Quintzee Start feedback took 14–16 ms and Mega opening feedback took 6 ms. Their confirmed dice/card and animation boundaries still follow the response. Async Words showed the submitted word in 618–622 ms, previously 1,247–1,248 ms. Boxdrop reported pending in 15 ms and waited for the next authoritative box.

Local PostgreSQL with 120 ms added to each RPC produced these accumulated service times for three legal actions. Each cell gives no previous result / one previous own result. Browser response-delay tests and database-delay tests are separate experiments.

| Game | Before, ms | After, ms |
|---|---:|---:|
| Take 2 | 1,594 / 1,994 | 390 / 402 |
| Quintzee | 1,563 / 1,963 | 388 / 380 |
| Boxdrop | 1,598 / 1,978 | 397 / 394 |

## Words authority

New invitations freeze the shared live Words rules. Each participant receives two three-minute banks for the game. The 36-hour availability window precedes turn entry. After the opponent presentation and the two-second YOUR TURN announcement, a scoped command arms the persisted three-minute deadline. Backgrounding, retries, inspection and reload preserve the deadline and spent slots. Read-only inspection cannot arm a turn. The live reducer owns bank eligibility and timeout passes. Four consecutive passes end a two-player game through the canonical outcome and settlement owners. Existing invitations and games retain their original terms.

The clock and board migrations passed rollback-contained qualification on the hosted database before installation. Words qualification exercised both money modes, winners, ties, canonical chips, ledger batches, receipts, terminal results and locked deadline recovery. Independent connections in disposable PostgreSQL raced duplicates and competing commands in each board game, plus Words bank/submission and late bank/submission versus snapshot and worker timeout. Browser-to-SQL testing exercised a real CAT placement, opponent review, announcement, input gating, both banks, hidden/offline, refresh, rejoin and timeout. Physical iPhone PWA acceptance is separate.

## Rollback

For board actions, restore the prior API/route behavior and drain in-flight requests before running [the additive function rollback](../../supabase/delayed/board-action-rollback.sql). Existing committed results and receipts remain authoritative.

For Words, [stop new timed admissions](../../supabase/delayed/stop-timed-words-admission.sql) first. Keep the compatible client and timeout worker serving all previously issued timed invitations and matches. After those finish or expire, run [the guarded authority rollback](../../supabase/delayed/rollback-words-play-clock.sql) in a transaction. It rejects rollback with outstanding timed contracts. The prior release receipt, match history and financial postings are retained.

## Publication and checks

The production alias served client `5e096e2759a4bfd106ae5d6db7289e21f5acc068` on Vercel deployment `dpl_9unexg79SeLod2ooBk38gm3GhQPy` before timed Words admission opened. Installed migrations `20261106145520` and `20261106150725` both passed their hosted rollback proofs again after installation. An armed clock can cross the original availability deadline and still resume from match home. An unopened turn still forfeits at 36 hours.

The targeted second-pair probe measured the actual removal of the second pair. At 600 ms per response, its final tap registered in 16 ms in Async and confirmed at 1,032 ms with either Sounds setting. Arcade registered it in 16–17 ms and confirmed at 1,049 ms. Both required zero retaps. The two authoritative moves remain serial.

App TypeScript, production bundling, and 241 harness checks passed. The full app run reported the ten previously documented Defaults failures and four assertions tied to the former Pass location. The four updated assertions passed on focused reruns. Browser checks covered the 48 audit cases, eight additional second-pair probes, six Run21 viewport/layout cases, and a Words session against disposable PostgreSQL. The `release-async-latency-20261106-verified` tag records the final published SHA and deployment.
