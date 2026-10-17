# Solo TriTowers Arcade — October 16, 2026

Jeremy accepted multiplayer v2 production smoke and approved the Solo adapter,
qualification, migration, recovery publication and activation after all gates pass.
Release checkpoint: `solo-tritowers-2026-10-16`. Owner production smoke follows
publication; it remains the acceptance truth.

## Shared authority

Both modes freeze `tri-towers/2`. The existing SQL board deal, legal-action,
finish, shuffle, exposure/redaction and clock functions are unchanged. The existing
bonus threshold check is now `private.tri_towers_bonus_qualified_v2`, called by both
orchestrators. No TypeScript gameplay reducer or independent scoring settings were
introduced. Two base rounds, at most one earned bonus, first-action Ready,
round-only timeout, 120-second play and five-second results retain v2 semantics.

`supabase/arcade/tri-towers.sql` owns Solo scheduling. Its service-only step RPC
locks the owned run, samples database time after the lock, catches up at persisted
deadlines, checks command fingerprints/revisions/round identity and calls the board
core. Late commands cannot undo a committed timeout. Existing Arcade runs,
receipts, revisions, result writer and indexed recovery remain the owners.

Completion validates the ordered cumulative score chain. Result scores are never
summed. Two results are required below the round-two threshold; three at or above
80,000. A timeout is a completed round, including zero scores. Explicit abandonment
never creates a result. Terminal persistence is immediate and independent of
client presentation. The five-second result hold precedes the existing 2.5-second
final overlay; authoritative first/matched/lower/broken classification and replay
protection are shared with Run21. Count-up audio uses the common platform manager.

No session, seat, dealer, bot, stake, chip, wallet or settlement path is used.
Multiplayer v1, accepted v2, real-money restrictions and historical records remain
unchanged. Solo does not pause when hidden, disconnected or displaying Rules.

## Qualification and release evidence

- `dev/arcade/tri.proof.sql`: rollback-contained ownership, disabled admission,
  private cards, shared core action parity, first-action clock, stale/duplicate/
  late commands, timeout catchup, exact 79,999/80,000/80,001 bonus boundaries,
  cumulative totals, terminal replay, PB classification, ranking, injected atomic
  failure, abandonment and Run21 start. Guards reject writes to every non-Arcade
  public/private table (102 in production).
- Candidate and installed proofs passed. The first installed attempt encountered
  a live-worker deadlock and rolled back. The proof now acquires its test locks
  with NOWAIT in deterministic order, and the installed rerun passed. No guard or
  synthetic row remains after rollback.
- `tri.evidence.json`: concurrent identical/different actions and concurrent
  recovery; one result each. A real-clock zero-browser run completed two Ready
  windows and the intervening hold through the existing recovery service: 65
  passes, maximum 9.4 ms, no due backlog.
- `tri.browser.evidence.json`: phone/landscape/desktop, Rules, first card/draw,
  single Take Score, absolute deadline on reload, automatic rounds, final total
  held at least 2.5 seconds, correct leaderboard return, Play Again, abandonment
  and completed-reconnect suppression. No browser errors.
- `tri.run21-regression.evidence.json`: Run21 Arcade/artwork/record/replay browser
  regression. Full application/harness tests, TypeScript and production build pass.
- `tri.installed.json`: production migration `20261017002318_solo_tri_towers`,
  installed function hashes and initial disabled admission. Only the intended
  existing start/commit/help functions and multiplayer qualification call changed.
  Recovery bundle version 4 includes both mode dispatches.

The migration inserts an initially disabled ruleset. Activation is a separate
update of that ruleset only after compatible production client/API and recovery
verification. Existing runs always recover independently of new-run admission.

## Owner production smoke

1. Open Arcade → TriTowers → Play. Verify no opponent, turn or chip controls.
2. Tap an exposed legal card or Draw during Ready. The round gets 120 seconds;
   keep playing, then use the single Take Score control.
3. Observe the five-second result hold and automatic round two. Repeat; a total
   of at least 80,000 after round-two bonuses earns one bonus round.
4. Finish and observe the prominent total for 2.5 seconds, followed by the
   TriTowers leaderboard and Play Again. A strictly improved existing personal
   best celebrates; a first score or tie does not.
5. Start again, reload/background briefly, and confirm the clock continues.
   Abandon that run explicitly and confirm it is unranked.
6. Compare Last 30 Days/All Time and personal best. Check score audio with mute
   enabled and disabled; reload a completed run to confirm no celebration replay.

Existing security-advisor findings outside this adapter were not changed: the
pending-transfer RLS setting, recovery search path and account password protection
remain separate follow-up work. New Solo authority is service-only; browser roles
cannot inspect private runs or invoke the step RPC.
