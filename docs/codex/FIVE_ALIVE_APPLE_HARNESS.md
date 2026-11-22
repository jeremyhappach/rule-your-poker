# Temporary APPLE Async harness — removed November 22, 2026

The owner-requested temporary harness is fully removed from production.
Migration `20261122230159_remove_five_alive_apple_harness_and_test_matches`
restores the original allocator and drops its switch and allocation tables.
There is no runtime switch to re-enable.

All three confirmed harness matches (four Five Alive children) were deleted.
The $1 Hap–mcru81 match was unfinished and had no settlement or financial posting;
wallets and the financial ledger are unchanged. See
[scope, accounting and verification](FIVE_ALIVE_HARNESS_REMOVAL.md).

Historical installation:
`20261122173210_five_alive_temporary_apple_async_harness.sql`.
It intentionally allocated APPLE three times for both Async players, with no
money-mode restriction, and recorded each child UUID privately. Those receipts,
not a guess based on words or player names, identified the cleanup scope.
The newer removal migration supersedes the former disable-only procedure.
