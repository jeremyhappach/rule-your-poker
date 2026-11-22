# Temporary APPLE Async smoke harness

Owner request, November 22, 2026: enable immediately; every Five Alive word is
APPLE; no URL manipulation and no frontend harness controls. Scope is Five Alive
Async, the active smoke task. Enabled on the hosted database at 17:32 UTC.

## Behavior and ownership

`private.five_alive_allocate` admits three APPLE answers for a new Async child
while `private.five_alive_apple_harness.enabled` is true. The original pool lock
serializes this path. One private receipt keyed by child UUID freezes the answers
and their existing catalog difficulty (currently tier 4 / 1.4 multiplier).
The normal answer pool is not consumed. Normal allocations already made always
win; their words are never replaced. Repeated harness allocation returns the
same receipt, including after disabling the switch. Invalid mode/version and
private access guards remain enforced.

The normal Async deal builds both players' three rounds from that receipt.
There are no changes to browser code, dictionary, legal guesses, score formulas,
normal no-repeat admission helpers, command receipts, review ACKs, financial
settlement, or Arcade allocation. This intentionally repeats answers only for
the requested temporary Async test. Existing matches require no modification;
start a new match to receive APPLE.

## Qualification

- Inspected deployed allocator, deal function, catalog tiers and actual indexes.
- Ran the candidate plus `dev/five-alive/apple-harness-proof.sql` in a savepoint
  and rolled it back before installation. Installed the same candidate and reran
  the proof in another rolled-back savepoint, all in one atomic migration.
- Proof covers both players' three APPLE rounds, existing difficulty, duplicate
  and late replay after disabling, old-match preservation, disable/new match,
  Arcade preservation, unchanged normal pool, version conflict, invalid mode,
  and no access for anonymous, authenticated or service API roles.
- Post-commit verification: enabled=true, allocator hook present, RLS enabled
  on both private tables, zero synthetic allocation receipts remaining.
- `node --experimental-strip-types --test server/fiveAlive/rules.test.ts server/fiveAlive/apple-harness.test.ts`
  passed all 12 tests, including sixth-guess solves, exhausted attempts, sealing,
  score/winner/tie calculation, terminal rejection and membership guards.

No synthetic matches, results, balances or settlement records were created.
No frontend build is required to activate this database-only switch; the already
published Five Alive adapter consumes its frozen state normally. Physical
iPhone/PWA and live match acceptance remain Jeremy's smoke.

The Supabase CLI was unavailable; the MCP migration tool generated version
`20261122173210`, which is used by the checked-in migration file.

## Turn off only when Jeremy requests it

Use the existing administrative database connection:

```sql
UPDATE private.five_alive_apple_harness SET enabled=false WHERE singleton;
```

Verify the flag is false. New matches then resume the original allocator.
Do not remove receipts or rewrite games: harness matches already admitted must
retain APPLE through completion and replay. Reapplying the migration preserves
the current switch state; it does not silently re-enable it.
