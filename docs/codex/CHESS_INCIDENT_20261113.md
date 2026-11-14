# November 14 follow-up — new timeout after authorized Async resume

After the result-reader smoke passed, Jeremy asked whether mcru81's displayed
$2 win was the earlier reversed result, since the board had not reached checkmate.
Read-only production inspection confirms a new timeout settlement:

- The original reversal remains intact: Hap +$2 / mcru81 -$2 at 16:13:42 UTC.
- Jeremy subsequently requested releasing the Async holds. The canonical
  close operation released this hold at 17:42:03 UTC (11:42:03 AM CST).
- The restored turn retained `opened=true`. Its replenished five-minute active
  clock therefore resumed immediately, with deadline 17:47:03 UTC.
- No accepted move or board change occurred after restoration. Both banks
  remain unused; the authoritative reason is `timeout` / `timeout_forfeit`.
- Recovery recorded the new outcome and settlement at 17:48:00 UTC
  (11:48 AM CST), awarding mcru81 $2 and completing the single-game match.
- New financial game: `8ef32074-a00a-48d9-b6f9-d4d066aeee0e`.
  New result: `d63aaddd-6ed5-481b-b525-4323b6bd83a9`.
  Hap -$2 entry: `f4ab642a-9e77-4674-af13-ac5ac7d78a1c`;
  mcru81 +$2 entry: `cf07d6af-02e5-4bad-b805-800292664fa5`.

The old charge and reversal net to zero; this new timeout produces the current
net $2 loss. It is not checkmate or a replay of the old settlement. This follow-up
changed no production data and does not authorize another reversal or restoration.
The earlier held-state instructions below are historical and were superseded by
the explicit resume request.

# Chess incident — corrected November 14, 2026; historical held checkpoint

Publication and all-player clock replenishment were subsequently authorized.
The current delivery record is [CHESS_HOTFIX_RELEASE_20261114.md](CHESS_HOTFIX_RELEASE_20261114.md).
The investigation and initial publication hold below are retained as history.

## Current disposition

Jeremy explicitly authorized implementing the safe correction flow and Chess
pause/resume fix while keeping all games held. At 16:13:42 UTC the exact incident
below was corrected with `admin_correct_chess_timeout`. Correction/audit/request:
`a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a`.

- Hap +$2 reversal: `0acf3d4e-2606-4e3d-a777-b9326781e672`.
- mcru81 -$2 reversal: `14cd8d7b-f667-4d01-8973-0f4b0c27d605`.
- Both link to the original SessionResult entries; four entries total, zero net.
  Original outcomes, settlement receipt, account entries and transfer batch remain.
  A balanced inverse canonical chip transfer restores original session chips to 0.
- Same child and parent reopened, unchanged committed FEN, moves and players,
  Hap to move on turn 59, both time-bank arrays empty (unused), 300000 ms held.
- New hold: `0c811612-597a-4b9b-be24-006b8555ce45`. Do not close it.
- Existing live and Async holds below remain. Additional current money parents
  `c75914a4-aa6a-4bb8-a6d9-46ba45287805` and
  `86f00f02-35f8-4efa-9375-f31eed3539d1` were held with the canonical incident
  operation. Verified zero unheld active real-money Async matches at 16:20 UTC.

Installed migrations: `20261114161245_chess_pause_and_audited_timeout_correction`
and `20261114161947_preserve_words_five_minute_correction_projections`. The second
preserves the concurrent Words v4 migration in two shared projection functions.
These operational database changes are applied; the client hotfix is unpublished.

The correction is admin-only, locks exact identities, checks revision/outcome hash,
derives board and bank restoration from accepted receipts, and is atomic and
idempotent. Same UUID retries cannot pay twice; altered payloads fail. Immutable
original records are retained. Current-outcome views and one correction generation
allow future settlement/review/runback through canonical owners. Financial proof
covers win, loss, tie, duplicate/late replay, authorization, stale actions, hold and
release, terminal lifecycle, runback ownership, and injected rollback after both
account reversals. Candidate and installed proofs passed before the real correction.
The saved incident proof targets the original frozen revision; do not rerun it
against the already-corrected production child.

## Client cause and verification

A reproduced resume failure leaves a never-resolving accepted request holding
`useChess`'s flight lock. Recovery previously had an empty interrupt callback;
subsequent moves were suppressed while the server clock continued. Cancellation
now releases the local wait, retains and replays the same command UUID, ignores
late replies and handles pageshow. Authoritative chess.js validation is unchanged.
This reproduces a concrete failure boundary; absent device logs, it does not prove
the original iPhone incident used precisely that path.

Live Chess now uses the existing versioned host pause RPC and a server-owned
guest request/cancel receipt, independently of whose turn it is, matching Words.
The canonical announcement shows the request; only the host can resume. Async
continues to use its existing incident-hold behavior.

Verification: 76 focused tests; TypeScript; Vite bundle (89,949,339 static bytes);
241 harness tests; 46 release tooling tests. Mobile Chrome 393x852 touch tests
passed live/Async x drag/tap from the incident FEN, including background/resume,
same-UUID recovery, Undo countdown, legal commit, timers and live pause/resume.
Evidence: `qualification.local/chess-incident/browser.json` and four screenshots.
Run `node dev/chess/incident-browser.mjs` to repeat the isolated nonfinancial fixture.
Local build: `dist/`; no production client push or public preview.

Full build validation stopped with 22 initial test failures, largely timeouts.
Rerunning ResultReview/WordsFinalReview leaves seven WordsFinalReview failures;
the same seven reproduce on an unchanged base worktree with the same dependencies.
RulesCompleteness passes separately. Do not report the full build command green.
No physical iPhone/PWA or installed WebKit is available: publication remains held
pending real-device background/resume, valid drag/tap, timer, host/guest pause and
Async acceptance. All real-money holds remain in place.

## Original investigation record (historical; superseded by disposition above)

Jeremy reported that multiple pawns did nothing after background/resume on
iPhone/PWA, followed by an Async timeout and loss. Follow-up: pressing the
destination appeared to work; the exact attempted squares and device error
remain unknown. Do not infer an authoritative rules failure from this evidence.

## Frozen incident identity and settlement

- Async child: `8a4353ad-e06e-4fec-8131-094043c2c95b`.
- Parent: `68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e`; its only child is Chess.
- White/organizer Hap: `d7dc1928-3727-4351-b0ff-0e80c81c2953`.
- Black/opponent mcru81: `e13e2dd9-6b38-4073-a313-2286877af40c`.
- Turn 59, Hap to move. Last accepted move: black `d8-d1`, ply 58.
- Last accepted command: Hap open, request
  `7d9cb22f-3976-4cec-ae59-51b2c563ccf1`, expected revision 117.
- Opened November 13 at 9:46:27.225 PM CST; deadline 9:51:27.225 PM CST.
  Timeout outcome recorded 9:52:00.093 PM CST; parent settled 9:52:00.204 PM.
- Outcome `timeout_forfeit`; winner mcru81; real-money stake $2;
  Hap -$2, mcru81 +$2. Both time-bank arrays are empty (both banks unused).
- Child terminal revision 120; outcome terminal revision 119; parent revision 122.
- Dealer game: `54535792-562b-4581-9c02-8b24ec3bf722`.
- Result: `07a5aa07-97ac-4ed0-b669-fc50c6e1fdb1`.
- Canonical transfer batch: `9073d055-f12e-48ef-812d-059f5d9243e4`, cursor 1.
- SessionResult entries: Hap `c89c8065-b68c-4059-a070-140edea8ea7c`,
  mcru81 `74859921-7e6c-4e27-b4de-5b339f21ece3`; neither reversed.
- Receipt outcome hash: `2e6a0beb308bc8f88b37d0bb141f1002`.

Committed pre-timeout/final FEN:

```text
5k2/1pN1n1pp/4Q3/rpb2P2/2p5/2P1P1P1/2q4P/3r1RK1 w - - 3 30
```

Shared chess.js validation finds legal pawn moves f5-f6, g3-g4, h2-h3 and
h2-h4. The e3 pawn is pinned; the c3 pawn is blocked. Preserve legal validation.
No accepted move follows the open receipt. That does not prove whether an
attempt was rejected locally, never sent, or rejected by authority. Runtime
log lookup supplied no request/error evidence for the incident window.

## Production correction blocker

Deployed `admin_reverse_account_entry` can append an idempotent, audited
account reversal but does not reverse gameplay settlement or reopen a match.
`delayed_terms_guard` freezes terminal children; delayed outcomes and settlement
receipts reject UPDATE/DELETE; `delayed_finalize` immediately returns its
existing receipt on replay. `delayed_incident_open/close` only operate on active
matches and cannot reopen this settled match.

Per Jeremy's explicit stop condition, no correction writes were made to this
child, parent, balances, results, receipts or history. An account-only reversal
would leave contradictory settlement state. Do not bypass guards, delete audit
records, or fabricate a replacement historical match. Restoring the requested
position, five-minute clock and unused banks requires a designed and qualified
canonical settlement-correction/reopen operation first.

## Emergency containment authorized later in the same chat

Jeremy explicitly requested: "also P0 there is no pause option during chess
pause all current real money games".

At November 13, 10:18:32 PM CST (November 14, 04:18:32 UTC), one transaction
used the existing canonical operations:

- `set_game_paused` with exact dealer identity and pause version 0 paused live
  session `5671ce95-3d5b-41d9-b100-3c42f642c2cd`, **Nov 13 - Casey's**,
  Hap versus mcru81, dealer `a29afbbb-4703-4cd3-8f7d-6dfda3c936c6`.
  Result: pause version 1; Chess revision 24; paused_at `1794629912426`;
  unfinished, with approximately 37.8 seconds remaining at the hold.
- `delayed_incident_open` held the other active real-money Async parent
  `3b990ac7-af90-4eb4-a718-b98ccd871e85` with reason recording Jeremy's
  authorization. Incident `7836d47b-856f-4d72-953f-b236c303cf43` remains open.
  Its nonterminal child is Words; completed Quintzee children were untouched.

Read-only verification returned **0 unpaused active live real-money sessions**
and **0 unheld active real-money Async matches**. Fake-money sessions and ended
sessions were excluded. No balances changed. Leave these holds in place until
Jeremy explicitly requests resume. This pauses existing games, not admission
of new games. The earlier settled incident remains unchanged.

## Local investigation and verification limits

Worktree: `C:/Users/jerem/.codex/worktrees/chess-resume-incident/rule-your-poker`,
branch `codex/chess-resume-incident`, base `1b933c5e65c1eb6dba1e9f4f1af2381732b34ee2`.
No product code or database definitions changed; no hotfix committed or published.

Inspected ChessBoard input/presentation, ChessView action admission,
useChessMoveDraft, useChess recovery, authoritativeSubscription, Async entry,
transport and authoritative chessOperation/shared rules. Existing focused checks
passed: 50 tests across ChessBoard.presentation, useChessMoveDraft,
useChess.revisionFence, authoritativeSubscription and ChessTurn.
These are baseline checks, not reproduction or proof of a fix. No physical
iPhone/PWA is connected; installed Playwright WebKit is absent. No tool was
installed. No verified hotfix preview/build exists yet.

The separate missing-pause P0 has a concrete client boundary: Game.tsx renders
ChessTable without its existing pause callback; ChessTable/ChessView expose no
pause control. Canonical server Chess pause works, as verified above. Queue its
UI correction without changing the shared pause authority or this incident's
financial history.
