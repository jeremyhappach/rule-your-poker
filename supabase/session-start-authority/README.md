# Waiting start authority qualification

`authority.sql` is the reviewed migration payload, not an applied migration.
It adds one private read-only blocker predicate, an authenticated read-only RPC,
and uses the same predicate inside the existing locked start transaction.
The start election, dealer draw, setup, replay, seating, and financial mutations
remain in their existing owners. No session rows are repaired by this payload.

Apply the migration **before** publishing the client. The client fails closed
if the read-only RPC is unavailable; it offers an explicit retry on read failure.
The Supabase CLI is not installed on this host, so no migration filename was
invented and no tool was installed. At publication, apply this payload through
the configured migration tool and save its returned migration version in
`supabase/migrations/`.

Generate the rollback proof with:

```powershell
node supabase/session-start-authority/prepare-proof.mjs > waiting-start-proof.local
```

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
history. Eleven blocked-boundary cases exercise live pointers, unfinished
rounds, pending transfers, money in the pot, active/ante/postgame/terminal
statuses, pause and ending flags. The read-only and mutating paths must agree.

`client-fixtures.json` contains only relevant synthetic inputs from the SQL
proof. Client tests also cover the captured production shape, both viewers,
snapshot catch-up, remounts, host transfer, stale/error reads and manual retry.
Browser reload/reconnect of real production clients remains Jeremy's smoke
acceptance step; component remount coverage is not that acceptance.
