# Randomized ante proof finding

The September 20 04:58 UTC transactional run failed at
`ante_authority_proof:357_start_failed`. The accepted ante action returned an
advanced/started round, but a random opening hand immediately settled a 3-5-7
sweep: game status `game_over`, round status `completed`, result description
`357_SWEEP:Hap:12`. The proof requires `in_progress` for its first-hand admission
case. This failed run is not counted as a pass.

The deployed `private.three_five_seven_settle_instant_sweep(uuid,uuid,uuid,integer)`
already supports the transaction-local `app.three_five_seven_test_no_sweep`
fixture control. The existing `three_five_seven_authority_rollback_proof.sql`
uses that same control for deterministic nonterminal hand proofs.

The Farkle proof runner now enables this existing fixture control only inside
the ante proof's savepoint. Every original assertion is retained, and rollback
removes the flag and fixture. Neither the existing proof file nor the deployed
3-5-7 implementation changes. This measures the ante transition; it makes no
new claim about instant-sweep coverage.
