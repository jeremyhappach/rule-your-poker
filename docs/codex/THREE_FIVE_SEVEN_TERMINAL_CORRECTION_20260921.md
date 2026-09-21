# 3-5-7 atomic terminal presentation correction

Candidate: `bb9b9ea3ff8fb4e7b385f2eaa108afd730ffbea6` on
`codex/farkle-playable`. This corrects the boundary established in
[the focused diagnosis](THREE_FIVE_SEVEN_SESSION_ENDED_BOUNDARY_20260921.md).

## Scope and focused acceptance

Only `buildThreeFiveSevenSnapshot` changed at runtime. It admits `session_ended`
only for a completed round whose game, dealer-game, hand and round match the
authoritative pointers, with a session-ended timestamp and no pending end.
The prior `in_progress` / `game_over` behavior and rejection of other statuses
remain intact. Existing sync, stale identity, reveal, chip ordering, sweep credit,
completion and Session Ended owners were not modified. Neither settlement nor
Farkle, other-game product code or migration history changed.

114 focused tests passed across the builder, frame/progress guards, financial
admission, terminal sweep credit, postgame wiring and completion hook. The new
builder tests execute the actual function extracted from Game.tsx, including the
atomic end frame, invalid/stale identities and reveal/cursor ordering. A normal-win
session-ended hook proof rejects stale callbacks and consumes completion once.

The focused terminal browser proof passed against the isolated local database:

- Connected host reached exactly one Session Ended panel through the unchanged
  terminal/credit completion path.
- Panel balances were +3 / -3, matching each player's persisted chips, terminal
  snapshot and the aggregate recorded chip changes.
- Exactly one terminal settlement and two distinct human snapshots persisted.
- Fresh peer and then fresh host mounted into the lobby. No terminal panel was
  reconstructed; settlement identity, balances and snapshots remained unchanged.
- Continuous observer reported zero violations/progress problems; canonical
  fixture deletion passed.

The first attempt timed out navigating to `/auth`, before creating a game. The
one allowed focused retry passed in 214.326 seconds. This is recorded as a
cold-start timing flake, without weakening assertions. That retry began while the
reviewed correction was uncommitted; the unchanged product/proof bytes were
committed during the run. Its namespace retains the initial parent SHA, as
explicitly recorded in `focused-summary.json`.

## Final gate and stop

At the exact candidate SHA, `npm run build` passed typecheck and ran the complete
application suite: 249 files / 1,685 tests; 245 files / 1,679 tests passed, four
files / six tests failed. Failures:

| Unchanged test file | Result |
| --- | --- |
| `cardFaceContract.test.ts` | direct-renderer review timed out at 15 seconds |
| `AnteUpDialog.test.tsx` | Sit Out submission timed out at 5 seconds |
| `DealerGameSetup.runBack.test.tsx` | Yahtzee timeout; subsequent Horses assertion failure |
| `AddTransactionDialog.account.test.tsx` | retry/remount timeout; subsequent missing-button assertion |

The cause of these failures is unresolved. They are not waived or represented as
product regressions or confirmed flakes. No unrelated implementation/test edits
were made. The chained harness and Vite build stages were not reached; the five
unrun terminal cases (Cribbage, Gin, Horses, SCC, Yahtzee) were not started. Prior
unaffected browser passes remain reusable, but Wave 2 is not qualified or merged.

SQL passed all 158 assertions, including seven-game regressions and recovery,
plus both post-recovery metadata checks. Read-only production verification found
zero drift across all 384 function fingerprints, owners, security attributes and
grants. Creation=false, admin_only=true, production_defaults_approved=false;
Farkle defaults, games and terminal handoffs all remain zero.

Cleanup passed: zero auth users/profiles/game fixtures; only the three expected
private control rows and seven existing-game defaults remain. All 384 local
functions match. This task's frontend/scheduler are stopped. Unrelated generated
snapshot/cache changes remain unstaged and uncommitted. No production writes,
migrations, main integration or production defaults occurred.

Sanitized evidence:
`supabase/farkle/wave2-qualification/20260921-357-terminal-correction/`.
Raw browser traces and complete local test logs remain ignored locally.
