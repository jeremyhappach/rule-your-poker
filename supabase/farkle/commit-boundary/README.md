# Farkle terminal transaction handoff

The approved Wave 1 action owner restores its transaction-local authority before
returning. PostgreSQL then runs the initially deferred transfer finalizer at COMMIT.
Its cursor writes were correctly rejected by the unchanged Farkle guards, rolling
back target-reaching Bank. Rollback-only proofs did not exercise that boundary.

This additive correction records a private, transaction-bound handoff in validated
Farkle settlement. The existing deferred finalizer takes a Farkle-only branch just
around its game/player cursor writes. The helper requires trigger context, exact
transaction/game/dealer/round/result identity, frozen rules, terminal event and
receipt, and exact opening/closing/live balances. It consumes the handoff, acquires
the existing claim, and the finalizer restores the prior claim immediately after
the cursor writes. No guard, public action RPC, chip calculation, transfer grouping,
trigger timing, existing-game branch, or historical migration is changed.

The private helper and handoff table are inaccessible to PUBLIC, anon,
authenticated and service_role. RLS is enabled without client policies. Neither
generic definers nor clients obtain Farkle mutation authority by executing as owner.

`capture.json` contains the deployed pre-change definitions and full metadata.
`build.mjs` uses exact single-match additions and metadata/definition drift guards;
it generates the new migration and executable `restore-shared.sql`.
Recovery locks existing Farkle games, takes the shared creation serialization lock,
disables creation, checks quiescence, and restores both exact captured definitions
with metadata assertions. It preserves additive tables and game history. It refuses
active games; it does not attempt an unsafe rollback through live settlement.

`qualify-local.mjs` is explicitly restricted to the existing isolated loopback
Supabase environment. Synthetic users and TEST ONLY configuration are temporary.
It commits target-reaching Bank as the authenticated actor for both `game_over`
and `session_ended`, then opens fresh PostgreSQL sessions to check persisted score,
round, balances, one result/batch, snapshots, history and receipt. It replays the
same request and exercises queued duplicate/stale trigger work, direct/generic
write negatives, helper-context negatives and cross-transaction claim isolation.
It runs all 158 Wave 1/Wave 2 assertions and seven-game regressions under the
candidate and after each of two executable restorations. Cleanup is mandatory.

Production creation remains disabled, admin-only enabled, production defaults
unapproved and absent. Wave 2 remains unqualified until its remaining live/browser
gate passes at one final SHA; this correction does not authorize main integration.
