# Five Alive APPLE harness removed — November 22, 2026

Jeremy explicitly requested runtime removal and deletion of every affected Async
match, including the real-money Hap–mcru81 match, with accurate financial records.

## Confirmed scope and disposition

Private allocation receipts, child UUIDs, both players' frozen rounds and match
identities establish the harness connection. The complete receipt table contained
four children in exactly three matches. A separate scan for all-three-APPLE
frozen deals returned the same four children and no additional matches.

| Match UUID | Participants | Created November 22 (Chicago) | Mode / lineup | Before cleanup |
|---|---|---|---|---|
| ad6d7d19-640e-4561-ae57-1ba51fde1d6d | Hap / Happach Gmail | 11:48 am | Play money; one Five Alive, stake 1 | Cancelled, unfinished |
| 09512245-5592-4fdc-aa14-462049666051 | Hap / Happach Gmail | 12:52 pm | Play money; two Five Alive, stake 1 each | Cancelled, unfinished |
| 666767c9-ad6b-4030-8e53-ee8240c405a3 | Hap / mcru81 | 3:12 pm | Real money; one Five Alive, $1 | Active, unfinished |

All three match rows, four child rows, seven gameplay command receipts, acceptance
retirement rows and their notifications/push dependencies were deleted.
No completed outcomes, review results or settlement records existed.
Immutable admission/request receipts and removal tombstones remain for audit
and replay safety; they do not appear in Async history. Both participants retain
the canonical realtime invalidation rows.

## Real-money accounting

The Hap–mcru81 match had not settled: no canonical financial game, account
transaction, chip transfer, snapshot or game result existed. Acceptance does not
reserve funds; the inspected parent finalizer creates financial records only
after every child finishes. Therefore no refund, reversal or ledger adjustment
was necessary. Wallet balances remained Hap -$74.00 and mcru81 $71.00.

The transaction rechecked the absence of financial and completed-result records
after locking the exact matches/children. Any settlement or correction would
abort cleanup, requiring the existing linked account reversal path instead.
No financial guards were disabled and no financial rows were written.
Fingerprints of the complete account ledger, transfer batches/pending changes,
canonical players/chips, games, dealer games, results and snapshots matched
before and after. Other matches, children, commands, normal answer allocations,
difficulty receipts, pool and immutable admission requests were also unchanged.

## Runtime removal

Migration `20261122230159_remove_five_alive_apple_harness_and_test_matches`
is installed in `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`).
The exact pre-harness allocator is restored (MD5
`e87e877680c4c20e2de9a33bf22984b0`), and both private harness tables are dropped.
Zero live functions reference the harness. This removes the override, switch
and allocation-replay path; it does not merely turn the switch off.
The original installation migration remains immutable historical source.
Obsolete enabling proof and harness-only test files are removed.

A short transaction uses the existing Async advisory lock and exact row locks.
The nonfinancial command-delete guard is temporarily disabled under its exclusive
table lock, restored before commit and verified enabled afterward. No other
session can observe the temporary setting. All financial/result guards remain
enabled. Unexpected dependencies fail the transaction instead of cascading.

## Verification

- First rollback attempt found an additional acceptance-retirement FK; rollback
  preserved every match, receipt and enabled command guard. The targeted deletion
  was added before the successful full proof.
- Full candidate cleanup and allocator proof passed inside BEGIN/ROLLBACK.
- A second complete rollback run proved replay of cleanup returns alreadyRemoved.
- The installed migration repeated the normal allocation proof in a savepoint,
  then rolled back all synthetic allocation/pool changes before commit.
- Both players receive the same three distinct answers; relative difficulty,
  duplicate/late replay, mode/version rejection and Arcade remain correct.
- Anonymous, authenticated and service API roles cannot call the private allocator.
- All three participant history reads exclude the targets. Deleted match home
  reads and finalizer calls fail; stale attempts create no financial records.
- Ten shared-rule tests passed, covering scores, winner/tie comparison, privacy,
  sixth-guess failure, completion and timeout rules.
- Post-commit read confirms zero target matches/children/notifications/financial
  entries, absent harness tables, no runtime harness references and restored guard.

Executable qualification is embedded in the migration and separately available
at `dev/five-alive/remove-apple-harness-proof.sql`.
The [evidence receipt](evidence/five-alive-harness-removal-20261122.json) distinguishes
rollback proof from installed verification. No frontend behavior or dependency
changed. Production iPhone/PWA smoke remains Jeremy's acceptance step: refresh
Async history and start a new Five Alive match to confirm ordinary distinct words.
