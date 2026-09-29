# Waiting start authority qualification

`authority.sql` is the reviewed migration payload, applied as migration
`20260929173535_waiting_start_authority` on 2026-09-29, before client publication.
It adds one private read-only blocker predicate, an authenticated read-only RPC,
and uses the same predicate inside the existing locked start transaction.
The start election, dealer draw, setup, replay, seating, and financial mutations
remain in their existing owners. No session rows are repaired by this payload.

Apply the migration **before** publishing the client. The client fails closed
if the read-only RPC is unavailable; it offers an explicit retry on read failure.
The configured migration tool applied the payload. Its actual database migration
version is recorded in `supabase/migrations/`. No CLI or dependency was installed.
All three deployed function bodies exactly match the payload; privileges,
security-definer settings and empty search paths were verified.

Generate the rollback proof with:

```powershell
node supabase/session-start-authority/prepare-proof.mjs > waiting-start-proof.local
```

For post-migration qualification, add `--deployed`. This calls the installed
public start and readiness functions on the rollback fixtures and requires the
deployed unsettled-pot probe to reject Start.

Execute that SQL as one transaction through the database tool. It obtains the
deployed start definition read-only and compiles both implementations in
`pg_temp`. It does not replace production functions. Fixtures use newly
generated auth, player, session, round and dealer-game UUIDs. Every write is
rolled back, including fixtures, temp functions and any generated receipts.
Never substitute a live session ID into this proof.

The proof covers both participants, fake/real money, queued rejoin and forced
seat release/reseat, actual Holm postgame/decline/heartbeat/rejoin commands,
one selected starter, host transfer, unauthorized callers, duplicate and late
postgame receipts, duplicate start and intent replay, and exact preservation
of balances, ante/result records, dealer games, rounds, snapshots and transfer
history. Twelve blocked-boundary cases exercise live game and round pointers, unfinished
rounds, pending transfers, money in the pot, active/ante/postgame/terminal
statuses, pause and ending flags. The read-only and mutating paths must agree.

`client-fixtures.json` contains only relevant synthetic inputs from the SQL
proof. Client tests also cover the captured production shape, both viewers,
snapshot catch-up, remounts, host transfer, stale/error reads and manual retry.
The deployed proof passed all eight sequences and twelve blockers. Live two-client
qualification is a separate release gate; component remount coverage is not that
acceptance. The client must not publish until the live gate passes.
