# 11 Up smoke corrections — 2026-10-18

Owner request: eight scoped smoke corrections; implementation through production
publication authorized. Checkpoint tag: `eleven-up-smoke-corrections-2026-10-18`.
Production acceptance remains pending.

## Changes and boundaries

- Audio: `AudioManager.unlock` retired waiting timeline events when its context
  was still suspended. It now retires only previously scheduled sources during
  unlock. Mute, interruption, background and account boundaries retain their
  existing retirement rules. Receipts prevent rerender/recovery/reload replay.
- Both modes use new immutable admission versions: 11 Up 3 and TriTowers 5.
  Exhausted stock plus no legal moves remains active until Take Score or timeout.
  Clearing all balls/towers still completes automatically. Older versions retain
  their old behavior; the new recognition-time policy has separate score groups.
- Multiplayer 11 Up keeps the corrected scoreboard and left-aligns chip rows.
  Its Game Over shows authoritative named winners/ties, final score and separately
  attributed achievements. Winner pills pulse; positive-payout winners receive
  the shared canonical confetti receipt. All-player zero-transfer ties produce no
  transfer/confetti. Arcade's existing result and progression remain unchanged.
- Settlement writes a three-second server deadline with immutable result identity.
  Connected clients require both elapsed deadline and completed/reconciled chip
  cursor before retiring the presentation. The existing shell retention owner
  holds the match across setup/waiting/session-end handoff. Server recovery and
  idempotent close select the canonical destination. Reconnect seeks the deadline;
  it does not replay a historical celebration. Standing-up participants can read
  their finished result to acknowledge the retained presentation.
- Blast's exact failure was `eleven_up_matches_game_id_fkey`, not a uniqueness
  key. Existing 11 Up and TriTowers parent/child foreign keys lacked cascading
  deletion. Cascades now follow the canonical session graph. The admin-only,
  fake-money-only Blast RPC and its existing financial contract are unchanged.
  No uniqueness protection was removed. Run21 already had cascading ownership.
- `private.multiplayer_score_results` records every eligible player's own 11 Up
  score once, including losers, in the settlement transaction. Complete ordered
  rounds, the qualified bonus round, final-score agreement and human identities
  are required. Bot or incomplete matches do not qualify; unfinished/abandoned
  play cannot insert facts; Blast removes its entire result graph. No extra real
  money admission or unrelated game's score pipeline is activated.
- The common result view compares only existing compatible rule groups. One
  transaction advisory lock serializes Arcade/multiplayer record comparisons.
  Personal/overall facts compare against prior results before insertion. Peer
  scores participate in overall record and rank calculations; both tied winners
  can match/set records. Rank follows the existing performance-row competition
  ranking policy. A tied rank <=10 earns a top-ten fact even when deterministic
  display ordering puts that row outside the ten visible leaderboard rows.
  Historical achievements remain facts as of completion. Authenticated history
  is restricted to auth.uid(); private tables/functions have no browser grants.

## Backfill scope

Read-only inspection found one existing settled, finished 11 Up match with stage
evidence. No historical row was altered or backfilled. It needs a separate
eligibility review and explicit backfill decision; its old rules must remain in
their compatible old leaderboard group.

## Validation

- `bun run validate`: TypeScript, 2,423 application tests, 241 harness tests pass.
  Two additional terminal integration tests pass (hold, financial cursor,
  acknowledgement, exactly-once close, expired reconnect). Final focused Arcade,
  TriTowers hook/recovery and terminal checks pass, including v5 presentation
  compatibility. Production Vite build
  passes; existing bundle-size/dynamic-import warnings remain.
- Candidate and installed migration: complete rollback proofs cover actual
  canonical winner/partial-tie/all-tie chip deltas, balanced transfer journal,
  snapshots, duplicate/replay/late replay, auth/stakes, recovery, terminal states,
  interruption rollback, Arcade financial isolation, new/old rules, manual take,
  timeout/all-clear, per-player records, ties, no-achievement, eligibility and
  leaderboard/history attribution. Actual configured 11 Up, TriTowers and Run21
  Blast graphs delete/retry correctly; interruption restores the graph.
- Independent PostgreSQL backends 576306 and 576310 competed on one new synthetic
  11 Up settlement. Expected/observed: chips 100/100 -> 105/95; one game result,
  one transfer batch, two final snapshots, two score rows. The synthetic session
  and two temporary users were deleted immediately; cleanup was verified.
- Chrome desktop, Chrome touch emulation and Edge desktop: real AudioContext
  permission/unlock, event playback, mute, delayed preference and reload receipts
  pass. Physical Safari/WebKit is unavailable on this Windows host.
- Eight result-layout fixtures at 320x568, 390x844, 844x390 and 1440x900, solo and
  two-player: overlay/scoreboard separation, named result, no Continue, winner
  pulse, left chip alignment and no document overflow pass. Screenshots and raw
  local validation output are under `.codex/evidence/eleven-smoke/`.

## Owner production smoke

1. Start new 11 Up and TriTowers games in Arcade and multiplayer. Exhaust the
   stock with no move: the clock continues until manual Take Score/timeout.
   Clear a board: it still completes automatically.
2. On laptop and iPhone Safari, interact normally, listen on active/opponent
   and observer views, mute/unmute and reconnect; check no duplicate cues.
3. Finish multiplayer 11 Up: winner name/score, left chip rows, winner pulse,
   chip transfer/confetti and about three seconds of Game Over. Check next-game,
   waiting and Session Ended destinations without Continue, including reconnect.
4. Inspect each player's own history and compatible leaderboard; verify personal,
   overall and top-ten wording and ties. Check the loser retains their own score.
5. Blast disposable fake-money 11 Up, TriTowers and Run21 sessions and retry.
   Confirm each session disappears without affecting other sessions.
