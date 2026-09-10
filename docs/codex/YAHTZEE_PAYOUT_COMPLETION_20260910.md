# Yahtzee payout completion — September 10, 2026

Status: Approved implementation; local validation and published browser qualification in progress. Jeremy explicitly reopened the window: "Play has ended; publish and test."

The September 9 preserved failure is documented in YAHTZEE_PRESENTATION_20260909.md. Its callback-only 1,800 ms animator advanced setup before the canonical 2,400 ms payout, and a peer's advancement removed the slower browser's outgoing table.

Yahtzee now consumes the canonical ledger's batch-settled callback. Batch normalization preserves the existing authoritative dealer_game_id; admission requires the exact session/dealer game, winner and complete loser set. The completion token also identifies the round and hand. No database definition or financial operation changes.

The route captures a presentation-only final round, roster, stakes and seat projection after observing that exact live round. It retains the same Yahtzee slot across setup or successor authority until that browser completes its payout. Ties acquire no winner hold. Cold terminal entry does not replay, completed callbacks are idempotent, and leaving the session clears the hold. The first valid completed browser may advance PostgreSQL; there is no wait-for-all-clients barrier. Scoring, settlement, chip amounts, canonical animation duration, normal action requests and recovery owners remain unchanged.

Local verification exercises two independent mounted clients, exact identity, cold entry, setup/successor retention, stale callbacks, replay, unrelated/missing payouts and multi-flight ledger completion. Browser qualification reuses the legal final Chance scores, exact $10 payout, setup and playable Run Back test, with one pair and zero retries. Original failed artifacts remain untouched. Jeremy's production smoke remains separate acceptance.

Validation: 1,543 app tests, 126 harness unit tests and all 11 browser observation controls passed. Production build and final narrow typecheck are recorded under artifacts/yahtzee-presentation/ for September 10.
