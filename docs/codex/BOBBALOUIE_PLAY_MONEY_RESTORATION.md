# Hap–Bobbalouie Chess play-money restoration — November 22, 2026

Jeremy approved reversing the unintended real-money timeout settlement and restoring
the saved board as play money. This is an exact data correction; no game rules,
timer policies, invitation defaults, public grants or persistent RPC definitions change.

## Identified mistake

The declined play-money invitation `288919bf-b8c4-4b36-bd29-32046a4b1962`
was created at 2:04 p.m. Chicago. A separate invitation created at 2:08 p.m. and
accepted at 2:09 p.m. explicitly recorded real money and a $5 stake.
The ordinary new-invitation UI currently defaults to real money. The database
proves the submitted mode, but cannot establish whether the sender deliberately
chose it or retained that default.

- Match: `0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15`.
- Chess child: `b1795d0c-51a3-47b8-a6b8-1e324b3f34d8`.
- Hap: `d7dc1928-3727-4351-b0ff-0e80c81c2953`.
- Bobbalouie: `201d2c6b-a58e-4b6a-a21d-8cda3360c860`.
- Timeout occurred on Bobbalouie's opened tenth turn, after nine recorded plies.
  The board, captures, repetition positions and unused time banks survived.

## Applied correction and accounting

Migration `20261122233123_restore_bobbalouie_chess_as_play_money.sql`
calls the existing `admin_correct_chess_timeout` authority under Hap's admin
identity and records correction `5a61e531-b2b0-46ac-8876-7f043d9a3d38`.
Its executor is `postgres`, transaction `291908916`; the reason records
Jeremy's approval and the play-money conversion.

The original real-money financial game, result, final snapshots and original
account postings remain intact. Two linked reversal entries were appended:

| Player | Original posting | Reversal | Reversal entry |
| --- | ---: | ---: | --- |
| Hap | +$5 | −$5 | `b80ff784-f0ae-4015-97ec-e77f28d391f6` |
| Bobbalouie | −$5 | +$5 | `a708ecb7-444d-4127-a06d-5c856d83c4c9` |

Verified wallet totals immediately afterward: Hap −$79; Bobbalouie $0.
The canonical inverse chip transfer is balanced, with no unmatched deltas,
and restores both original session chip totals to zero. Unrelated ledger,
game, result, snapshot, request and Async records were fingerprinted unchanged
inside the transaction.

The same Async parent is active with `real_money=false`, revision 26. The same
child is playing, revision 23 / segment 11, with Bobbalouie to move. Its nine
moves and exact FEN are preserved. The turn is unopened and has no active
gameplay deadline. Existing 72-hour availability and five-minute gameplay
rules remain; the broader request to remove timers is separately queued.

A narrowly guarded, transaction-local amendment permits only this parent's
true-to-false money conversion in the correction's transaction. The original
frozen-terms function is restored byte-for-byte before commit, and rollback
also restores it. The original timeout outcome and settlement are retained
as superseded audit history, excluded by the existing current-result views.
Future settlement uses correction generation 1,
`77fc01f5-bcf1-4d58-87b8-37d272efce55`, with play-money mode.

## Verification

The complete rollback proof passed before application: non-admin rejection,
forced failure after reversals with full rollback, exact original evidence,
linked reversals, unchanged unrelated data, idempotency, stale request/expiry
fencing, zero-client unopened recovery, ordinary frozen-terms protection and
both participants' active play-money home views.

Future wins for either player and a draw were exercised through canonical
settlement, including actual chip changes, balanced journal transfers,
final snapshots, duplicate settlement, late correction replay and both
players' finale continuation. Draw proof enters at the trusted outcome
boundary; it does not assert that this saved position is legally drawn.
All future-outcome fixtures rolled back. The installed correction was then
checked, replayed without changes, and the three future financial proofs
passed again without any wallet writes.

The proof flushes deferred chip journals only after complete transfers, then
restores deferred timing before further transactions; immediate row-by-row
journal flushing would invalidate the financial test itself.

Evidence: [installed receipt](evidence/bobbalouie-play-money-restoration.json).
Scripts: `supabase/chess/bobbalouie-play-money-correction.sql`,
`bobbalouie-play-money-proof.sql` and `bobbalouie-play-money-installed-proof.sql`.
There are no frontend changes, so production behavior is already corrected
by the committed database migration. Owner iPhone/PWA smoke is pending:
open this match, confirm Play Money and the retained board, then let
Bobbalouie open and play his turn.
