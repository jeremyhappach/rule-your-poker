# Yahtzee presentation qualification — September 9

Status: Harness published; the first live qualification failed on premature
setup during payout. Live testing stopped, evidence and cleanup were verified,
and no gameplay fix was included in that harness publication. The approved
September 10 correction is published and its winner/payout/setup proof passes;
see YAHTZEE_PAYOUT_COMPLETION_20260910.md for results and the separate Run Back
stake defect discovered next.

Local validation passed: 1,538 application tests, 126 harness unit tests, 11
browser observation controls and the complete production build. The separate
E2E typecheck retains only the ten previously documented `abortSignal` typing
errors in inherited helpers; no new type errors remain. Logs are retained under
`artifacts/yahtzee-presentation/`.

The healthy row `yahtzee-presentation-final-score` reuses the existing exact-game
`yahtzee:terminal:unique` fixture. Deployed read-only preflight confirms it is a
valid Yahtzee profile and supplies exactly 12 filled categories per player.
It is armed only for the newly created fake-money session. Both participants
roll normally and score Chance through their browser; no turn-preparation RPC,
reload, synthetic live score or End Session request is used.

The source winner must have the unique highest complete scorecard. The exact
winner announcement and full $10 payout must appear on each browser before
setup, with the correct payer/payee changes. Yahtzee intentionally co-starts
announcement and chip transfer; Cribbage's separate announcement window is
preserved in the shared assertion through its original wrapper and tests.

The fixture must be consumed once and cleared before Run Back. The successor
retains the exact configuration, starts with empty scorecards and no outgoing
win artifacts, then accepts one roll and Chance score from each player. Every
action checks the authoritative request/response identity and waits for both
DOM projections of its exact action sequence within six seconds of the click.

The only app change is a passive Yahtzee root identity/action-sequence marker.
Gameplay, timers, animation, settlement, database definitions and infrastructure
are unchanged. Fake fixture cleanup also runs on failure. One browser pair,
one worker, zero retries, stop at the first unexplained failure, retained
artifacts and independent exact-session cleanup remain required.

Coverage excludes other categories, upper/Yahtzee bonus celebrations, ties,
rejoin, deliberate delivery faults, End Session and the opposite winner role.
Existing rule harness rows remain separate evidence for those paths.

## First live run — failed, retained

Both browsers loaded `b6bd777e44afdbdac9292c9be4fbb1814696d113`, independently
verified against the public manifest. Vercel deployment
`dpl_HDDBRQPKgX6RE6p76tqPEXDbtCjC` was READY. One browser pair, one worker,
zero retries; namespace `yahtzee-win-20260909-2330`.

- Fake session: `5ea744ec-d9e6-4fae-bffb-ad05137f74ed`.
- Source dealer game: `0c248f2b-1ac1-4409-a503-b7551bb6c9aa`.
- Round: `9f95086b-50b7-4f65-a337-fe511308ccfd`, hand 1.
- Winner: `be5401a7-54ee-4c03-bc4b-e98c61941040` (desktop host).
- Result: `c85f9ac7-4498-4689-b743-2cd4f90f4110`, unique score 303–21.
- Transfer batch: `2c0a4590-0c58-4176-b25e-b751a1142b31`; exactly one $10
  player-to-player transfer, loser -$10 / winner +$10, sum conserved.

Both normal rolls and final Chance scores were accepted with exact round,
actor and action-sequence identity, and both DOM projections were captured
within six seconds. Five continuous action receipts (including entry) had no
progress problems, violations or coverage gaps: RPC median 141 ms / max
175 ms; peer progress median 693 ms / max 1,049 ms. These ordinary-action
checks passed while the independent terminal presentation gate failed.

| Client | Winner/payout start (epoch ms) | Table scope lost | Setup admitted | Time from payout start to setup |
|---|---:|---:|---:|---:|
| Desktop host | 1788996702188 | 1788996702330 | 1788996702395 | 207 ms |
| Mobile peer | 1788996700159 | 1788996702113 | 1788996702145 | 1,986 ms |

The canonical payout lasts 2,400 ms. The mobile peer's full completion sample
arrived at 1788996702580, 435 ms after setup admission. The host did not finish
its payout in the retained observation. The first assertion rejects the lost
source scope as `stale or unrelated payout`; the same evidence also independently
shows setup before completion. This is not a missing selector or wrong transfer
ID: the exact payout UUID and announcement were captured on both browsers.
Trace frames were visually inspected and show the outgoing table disappearing
with its $10 chip still visible. Run Back and successor coverage were not reached.

The peer sent the sole `yahtzee_advance_postgame` POST at
2026-09-09T23:31:41.854Z and received HTTP 200, `outcome: advanced`,
`deduped: false`, `status: game_selection`. The deployed definition was
inspected read-only: it validates/dedupes the settled identity, then clears
the current round/dealer-game pointers and publishes `game_selection`.

## Root cause and recommended correction

`YahtzeeGameTable.tsx` still mounts `ChipTransferAnimation` with
`presentationOwned` and uses its `onAnimationEnd` as terminal completion.
That component draws no chips in this mode but still invokes its old 1,800 ms
timer. The actual database-backed flight is rendered by `ChipTransportRuntime`
with the 2,400 ms `canonicalWinTransfer` preset. The early callback reaches
`Game.tsx:handleYahtzeeTerminalPresentationComplete` and advances the shared
game before either browser's required presentation is complete.

The second boundary is local retention: `shouldHoldTerminalSeatOwnership`
accepts only `game_over` / `session_ended`. Once the faster peer publishes
`game_selection`, the slower client's outgoing Yahtzee table is released even
though its local presentation is active. Fixing the 1,800 ms callback alone
would still allow a faster peer to cut off a slower client's later-starting
flight.

Recommended scoped product correction, not yet implemented:

1. Complete the exact Yahtzee terminal identity from the canonical ledger's
   actual batch-settled notification, using the existing admission hook seam
   demonstrated by Cribbage. Retire Yahtzee's legacy callback-only timer.
2. Retain each connected client's exact outgoing Yahtzee presentation and
   roster through shared postgame advancement until its own ledger completion.
   Reuse the canonical retention owner; reject stale identity and cold-entry
   replay. Do not globally hold all setup states or add another timer.
3. Prove early completion, missing/late batch, duplicate/replay, identity reset,
   fast-peer/slow-client handoff and fresh-ended entry locally; then rerun this
   exact healthy row plus a targeted delayed-client row under an authorized
   no-play window. Finish Run Back and two successor turns on both clients.

Preserve scoring, canonical announcement/chip duration, balances, database
settlement and postgame RPCs, disconnect recovery, geometry, and other games.
No database migration is proposed. Shared-owner changes require enumerating
all game call sites and checking their existing guards before editing.

The exact fixture was cancelled in teardown. Independent administrative SQL
confirmed zero rows in games, players, rounds, dealer_games, game_results,
gameplay_transfer_batches, session_player_snapshots, private provenance and
the private Yahtzee postgame claim;
the fixture request was absent. No historical session was changed.

Evidence root: `artifacts/yahtzee-presentation/live-20260909-2330/`.
Summary: `artifacts/yahtzee-presentation/live-summary.json`; cleanup:
`artifacts/yahtzee-presentation/live-independent-cleanup.json`.
Retained original trace SHA-256:
`32AB2789D4B43D3AE5642A192053BD7D71D0B84816CEDEFDBD09D99A6370B74F`.
No passing qualification or production-smoke claim is made for Yahtzee.
