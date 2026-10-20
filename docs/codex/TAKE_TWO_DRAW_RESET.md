# Take 2 stock draw speed-bonus reset — 2026-10-19

Jeremy explicitly approved resetting the turn-speed bonus after accepted stock
draws unless original-game evidence established otherwise. The retained research
in `TAKE_TWO_QUALIFICATION.md` documents draw deductions and score increments,
but no help screen, quotation or observed draw establishes that the meter does
not reset. The v1 no-reset statement was a P-Town choice, not original-game proof.

## Behavior and compatibility

New Arcade admissions and multiplayer configurations freeze `take-two/2`.
An accepted manual draw sets the shared authoritative `meterAt` to the action's
server time. The bonus starts at 500, holds one second, then follows the unchanged
150-points-per-second decay in five-point steps to 50. The 100-point draw penalty
and zero score floor remain. `startedAt` and the round deadline do not change.
Successful matches still award the bonus at their acceptance time and reset it.
Automatic current-card refill remains part of the successful match.

Both views display the same projected anchor. No optimistic meter reset, client
scoring, retry timer or separate mode formula was introduced. Existing locked
RPCs check UUID receipts, exact commands, revisions and authority before the
reducer runs. Duplicate/stale/rejected draws cannot reset it again.

V1 configurations remain byte-for-byte identical and accepted by deal/reduce,
including later rounds and resumed games. V1 draws retain historical behavior.
No active state or historical result is rewritten. V2 has a separate current
leaderboard, personal best and record comparison; v1 remains selectable as
Legacy in leaderboard info. The existing score-group owner already separates
these version IDs. The hidden admission/deal personal-best projection now also
uses the frozen version. Rules/help displays the selected or active version.

## Verification

- Local and production candidate rollback proof: complete original financial,
  ownership, duplicate/replay/late-replay, continuation, terminal, autonomous
  recovery and pause cases, plus v1/v2 draws, exact subsequent pair arithmetic,
  hold/decay/floor, empty-stock rejection, unknown version rejection, both RPC
  retries/stale actions, projected anchors and separate selectable boards.
- Existing production results are compared as complete JSON rows before and
  after the candidate migration/proof. Four existing v1 records were retained.
- Independent-connection races pass for duplicate/competing draws, final pairs,
  settlement and Arcade timeout, including injected failure after chip writes.
- Real browser flows at 393×662: both modes show 50 → 500 on an accepted draw,
  subsequent consecutive pair +900, duplicate unchanged anchor/stock, unchanged
  round deadline and preserved anchor after reload. Screenshots and JSON are in
  ignored `qualification.local/take-two/draw-reset-*`.
- Full typecheck/application/harness/build checks and 17 focused Take 2 tests
  pass. UI tests cover delayed/rejected draw responses and version-specific help.

Migration `20261020011009_take_two_draw_reset_v2.sql` is installed. The same
complete rollback proof passed against installed production authority, with
historical rows preserved and all synthetic proof writes rolled back.

Database sources: `supabase/take-two/draw-reset.sql`,
`draw-reset-proof.sql`; harness: `dev/take-two/draw-reset-proof.mjs` and
`draw-reset-browser.mjs`.
Checkpoint: `take-two-draw-reset-2026-10-19`. Physical-phone acceptance pending.

Smoke: start a new game in each mode; let Bonus reach 50; draw and confirm 500
with the normal deduction; immediately pair and confirm the larger increment.
Verify the overall timer continues. In leaderboard info, switch between current
v2 and Legacy v1 and confirm old records remain.
