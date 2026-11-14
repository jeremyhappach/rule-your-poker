# Chess second-timeout restoration, results and forfeiting — November 14, 2026

Jeremy explicitly requested reversal of the second $2 loss, restoration of the
same Chess match with its five-minute timer starting only on turn entry, explicit
timeout results with the final board, and confirmed forfeit in live and Async.

## Authoritative incident and correction

Parent `68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e`, child
`8a4353ad-e06e-4fec-8131-094043c2c95b`: Hap versus mcru81, real $2 Chess.
The November 14 17:42 UTC hold release resumed an already-open turn. It expired
at 17:47 UTC and settled again at 17:48 UTC. This was a second result; the
original correction and its refund remained intact.

Migration `20261114182034_chess_repeated_timeout_and_forfeit.sql` was applied.
Correction `746cf520-2740-4ec2-babe-2e86ebb5c93d` was applied at 18:21:27 UTC:

- Hap +$2 reversal `259f49d6-db0b-4dec-9327-76dea2c2d8cd` reverses
  `f4ab642a-9e77-4674-af13-ac5ac7d78a1c`.
- mcru81 -$2 reversal `05ae9e49-8cbc-4332-b7c7-bba2a4d8926c` reverses
  `cf07d6af-02e5-4bad-b805-800292664fa5`.
- Second financial game `8ef32074-a00a-48d9-b6f9-d4d066aeee0e` has balanced
  account reversals and canonical inverse chip transfers; both players return to
  zero chips in that settled financial container.
- Child revision 128, turn 59, 58 moves, exact FEN
  `5k2/1pN1n1pp/4Q3/rpb2P2/2p5/2P1P1P1/2q4P/3r1RK1 w - - 3 30`.
  Both bank inventories are unchanged and unused.
- Active, no incident hold, `opened=false`, `started_at=NULL`,
  `gameplay_due_at=NULL`. Availability expires November 16 at 06:21:27 UTC.
  Entering the player's turn uses the existing authenticated `open` intent to
  start a full 300,000 ms. Lobby, result history and opponent inspection do not
  open it.

## Ownership and preserved behavior

Corrections and reopened receipts now append an explicit generation. The latest
correction view selects current outcomes, settlements, final acknowledgements and
Run Back eligibility, while all earlier immutable rows remain intact. Parent
locking, request UUID/fingerprint, exact revision/hash, admin authorization,
accepted turn evidence, financial posting and inverse transfer assertions remain.
The original correction UUID still replays its original audit.

The inspected canonical consumers are `delayed_finalize`,
`delayed_record_outcome`, `delayed_home_before_reviews`,
`delayed_capture_reviews`, `delayed_finale_ack`, the immutable child guard and
the admin correction RPC. All uncorrected games retain their original receipt
path. Current review filtering and the typed privacy predicate from the preceding
saved-result fix remain unchanged.

Chess's existing `resign` intent is now available to either human participant.
The shared rules award the opponent the win without changing moves, FEN, banks,
turn or clock. Node authorization and the locked service-only commit validate the
participant, exact board preservation, opponent winner and score vector. Stale,
paused, expired, settled and unauthorized commands remain rejected. Existing
canonical live and Async settlement owners do all money movement.

The shared confirmation control is used by live and Async. Cancelling does
nothing; changed revisions invalidate confirmation. Passive opponent inspection
does not mount command recovery until the user explicitly confirms forfeiting;
it never auto-opens a turn. Confirmed commands use the existing durable UUID
transport and recovery hook.

All Chess endings show the frozen final board before Async result acknowledgement.
Timeout and resignation get explicit participant names; only actual checkmate
uses checkmate presentation. Timeout is also explicit in match-home/result/finale
copy. Saved History remains available. Live keeps the existing canonical terminal
presentation and continuation; no separate lifecycle or table was added.

The unpublished `codex/chess-multiplayer-p0` candidate was not integrated.
No unrelated live session or original financial receipt was mutated.

## Validation and acceptance

- Candidate rollback proofs and the installed combined proof pass second
  reversal, injected failure after reversals, canonical chips/account postings,
  unopened availability, five-minute open, banks/moves preservation, both actors
  forfeiting, winner/loser/tie, duplicate/late replay, review/finale/Run Back and
  retained original audits.
- Live forfeit proof passes either participant in real and fake money, membership
  and service-only access, canonical chips/transfers/results/final snapshots,
  duplicate submission and terminal continuation.
- Ordinary uncorrected Async winner/draw proof passes both money modes and the
  original receipt/replay path.
- 119 focused Chess/result tests pass; 28 final inspection/recovery/lobby tests
  pass, including two new confirmed-inspection tests.
- Full build passes TypeScript, 4,182 application tests, 241 harness tests,
  46 release-tooling checks, Vite and 89,951,863-byte final static output below 90 MB.
  The two added inspection tests also pass in the final focused run.
- The repository's suggested `bunx tsgo --noEmit` could not resolve its package;
  validation used the already-installed project TypeScript compiler. No dependency
  or lockfile changes.

Checkpoint: `chess-timeout-forfeit-20261114`. Production verification follows
publication. Jeremy's production smoke remains acceptance: enter the restored
match once to start its five minutes, inspect timeout final-board History, and
open/cancel Forfeit in live and Async. Confirming Forfeit ends that game.
