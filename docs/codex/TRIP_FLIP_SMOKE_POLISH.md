# Trip Flip smoke corrections — 2026-10-19

Approved corrective pass in Arcade and multiplayer. Checkpoint:
`trip-flip-smoke-polish-2026-10-19`. Physical iPhone Safari acceptance is pending.

## Production scoring investigation

Read-only production evidence identified Arcade run
`2efcb14a-5a2f-4a37-bcce-06d988a534f0`, started at
2026-10-20 01:21:31 UTC (October 19, 8:21 pm CDT). Its first-round result exactly
matches the report: zero Trips, two Runs, 1,200 Run points, 5,000 suited bonus,
1,250 timer bonus and 7,450 total. Round two was subsequently abandoned; no
completed two-round Arcade result was expected or written.

All 32 committed first-round moves were reconstructed from command receipts and
replayed locally through the deployed classifier and board reducer:

- Revision 9 cleared 7♠–6♠–5♠: 600 + 5,000.
- Revision 20 cleared 4♠–3♦–2♣: 600.
- Revision 25 placed 5♥–4♥–6♥: no ordered Run, so no clear or award.
- No qualifying Trip appeared in the committed sequence. The round banked ten
  dots at 125 each, producing the recorded 7,450 total.

The evidence supports a misunderstanding of the completed combinations, not a
missing Trip award. No scoring correction or historical mutation was made.
Receipts retain command fingerprints and revisions, not complete historical
snapshots. The played fan prefix is recoverable; the unplayed first-round stock
and old Special target are not. The replay uses filler for that unplayed stock
and a nonmatching target; the recorded result independently confirms zero
Special bonus. It does not claim to recover the original complete hidden deal.

Production and local function-definition hashes matched:

| Shared owner | MD5 of deployed definition |
| --- | --- |
| `private.trip_flip_combination` | `970093f817902fda9e60865a987c49e4` |
| `private.trip_flip_board_reduce` | `86bfcbae83713c762863e74e6d2daefe` |

Arcade calls the shared board reducer directly. Multiplayer reaches it through
its existing apply/reduce chain. Both retain frozen `trip-flip/1`.

## Presentation correction

The existing active score pill now translates to the canonical gameplay
container's exact center, using the accepted TriTowers result timeline and
platform scoring audio. Its size and identity remain intact; the opponent's
pill stays in its scoreboard slot. The large itemized result panel is removed.
The count uses authoritative `scoreBefore` and `score`, never a client sum of
components or the already-incremented live score. The existing six-second
result deadline controls count-up, final hold and automatic progression.

Elapsed presentation time comes from the persisted deadline, including pause
shifts. Reconnect and late entry retain the shared admission/recovery behavior;
old count-up audio is not replayed and no deadline is extended. Existing final
Game Over, Arcade record and winner-only multiplayer achievement handling stay
in place.

Tableau stack pitch changes from 50 to 64 per 100×150 reference card, revealing
about 43% of a buried card instead of 33%. Uniform container scaling preserves
the compact four columns, overlapping cards and aspect ratios. Disabled buried
faces cannot select cards. Rules explicitly show ascending/descending Runs and
the invalid 5♥–4♥–6♥ example, including the same requirement for suited Runs.

## Validation and acceptance

- Deterministic SQL fixtures: ordinary, one-Joker and two-Joker Trips; mixed and
  suited ordered Runs; unordered rejection; consecutive clears in both adapters;
  duplicate/stale rejection and authoritative component reconciliation.
- Production receipt replay: all 32 moves, both clears and the reported total.
- Independent-connection concurrency/rollback regression proof passed.
- Ten focused view/presentation tests; full build, typecheck, 2,529 application
  tests and 241 harness tests passed.
- 84 scene/viewport checks: 320×568, 390×844, 430×932, landscape, shortened
  viewport, 120% text and simulated safe areas. Screenshots inspected; exact
  pill centering, opponent visibility, aspect ratio, overflow and buried-card
  hit-testing passed.
- Authoritative browser/audio checks cover both modes, cumulative count bounds,
  one synchronized 2,800 ms count cue, mute, reload without replay and unchanged
  deadline/automatic continuation. Same-page Arcade → multiplayer → Arcade
  audio ownership passed.
- Full browser gameplay passed: fan/column/cell moves, reload, both Arcade rounds
  and leaderboard return, four multiplayer turns through real deadlines,
  observer redaction, settlement and terminal continuation. The test permits one
  explicit retry after a correctly rejected stale intro-boundary action.

Evidence scripts are in `dev/trip-flip/`; generated local JSON/screenshots are
ignored under `qualification.local/trip-flip/`. No schema, scoring, financial,
recovery-worker, admission or production-history changes are part of this pass.

Jeremy's remaining production acceptance: play both modes on iPhone Safari;
check buried rank/suit readability and ineligible taps, score-pill motion and
speaker synchronization, both rounds, reconnect, and final results/continuation.
