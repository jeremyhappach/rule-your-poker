# Yahtzee payout completion — September 10, 2026

Status: Published; two-browser winner/payout/setup acceptance passes. Full Run Back qualification stopped at a separate existing stake-submission defect. Jeremy explicitly reopened the window: "Play has ended; publish and test."

The September 9 preserved failure is documented in YAHTZEE_PRESENTATION_20260909.md. Its callback-only 1,800 ms animator advanced setup before the canonical 2,400 ms payout, and a peer's advancement removed the slower browser's outgoing table.

Yahtzee now consumes the canonical ledger's batch-settled callback. Batch normalization preserves the existing authoritative dealer_game_id; admission requires the exact session/dealer game, winner and complete loser set. The completion token also identifies the round and hand. No database definition or financial operation changes.

The route captures a presentation-only final round, roster, stakes and seat projection after observing that exact live round. It retains the same Yahtzee slot across setup or successor authority until that browser completes its payout. Ties acquire no winner hold. Cold terminal entry does not replay, completed callbacks are idempotent, and leaving the session clears the hold. The first valid completed browser may advance PostgreSQL; there is no wait-for-all-clients barrier. Scoring, settlement, chip amounts, canonical animation duration, normal action requests and recovery owners remain unchanged.

Local verification exercises two independent mounted clients, exact identity, cold entry, setup/successor retention, stale callbacks, replay, unrelated/missing payouts and multi-flight ledger completion. Browser qualification reuses the legal final Chance scores, exact $10 payout, setup and playable Run Back test, with one pair and zero retries. Original failed artifacts remain untouched. Jeremy's production smoke remains separate acceptance.

Validation: 1,543 app tests, 126 harness unit tests and all 11 browser observation controls passed. Production build and final narrow typecheck are recorded under artifacts/yahtzee-presentation/ for September 10.

## Published evidence

Product commit c83fc7485213bb06a1844dd2147d660b7c098046 is on origin/main, tagged checkpoint/yahtzee-payout-completion-20260910. Production deployment dpl_BBTgBNHkJQgcQwqYob9w2uT3uaGn is READY; both browsers and the public manifest confirmed that exact SHA. Complete local build and final typecheck passed.

The first fresh fake session d4274817-3d9e-4967-a908-d08ec65edfc4 completed both real payout animations and local setup. The observer then falsely compared the bare local HUD value 0 with the remote-label form $0. The comparison now validates numeric amounts with optional currency formatting, preserving rejection of changed, malformed and conflicting values. All 131 harness tests pass, including five added balance controls. The original failed trace remains at artifacts/yahtzee-presentation/live-20260910-2113/ (SHA256 C18F66527A113E4A76A0A5FB4E8F01D99219FC65B66CAA851FD9CF292DE8B020).

The second fresh fake session e122f50a-3192-4ed4-92a7-c4832db112fc passed the exact winner, complete payout, balances and setup checks on both browsers:

| Client | Payout start (epoch ms) | Full completion | Setup admitted |
|---|---:|---:|---:|
| Desktop host | 1789075146894 | 1789075149332 | 1789075149377 |
| Mobile peer | 1789075144859 | 1789075147280 | 1789075147597 |

The peer entered setup 1,735 ms before the host completed its own payout. Each browser retained its exact table through its own flight. The earlier run independently showed a 1,685 ms gap; paired trace frames were visually inspected and retained as host/peer-independent-handoff-20260910.jpeg. This directly demonstrates that a slower browser does not hold everyone else up.

Source dealer game be78f677-34d7-4401-8398-e7404cbf663d, round 3233202d-2ff0-4e4d-b341-a5a84ba78afd, result d2097e1b-9631-4004-a9c7-529647e1846b and batch 9d6264f9-be8c-4949-84bf-ee7240019bda identify the second proof. Seven action receipts had no progress/coverage problems; RPC median 130 ms, max 182 ms; max peer progress 1,412 ms.

Run Back then committed successor dealer game 3821c91f-9038-4465-92ef-d1fc4b5e433b with ante_amount 3 instead of the source 10. Testing stopped before successor rolls/scores. DealerGameSetup.tsx is byte-identical before and after the animation fix (Git blob 61c17cbdb5c1aaf8e6ad3a200cef9b37e4ef061b): handleRunBack sets ante state and immediately calls handleSimpleAnteGameSubmit, which reads the old render's ante. This separate defect is queued in BACKLOG.md; it was not corrected in the animation release. Second trace: artifacts/yahtzee-presentation/live-20260910-2119/, SHA256 763F9021C534613205A3B6BD1BB68F22B7896B56495B2F083FBC099DCB0DE5BF.

Independent SQL verified zero rows for both exact fake sessions across games, players, rounds, dealer games, results, transfer batches, snapshots, provenance and postgame claims; both fixture requests were absent. No test sessions remain. Production smoke by Jeremy, ties, reconnect and End Session remain outside this browser acceptance.
