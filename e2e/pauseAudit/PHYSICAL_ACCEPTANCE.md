# Physical-device acceptance — pending, not executed

Use an approved synthetic environment and isolated accounts, never a customer
session or actual wager. Record candidate digest/build, game, money profile,
settings, session/dealer-game/round identities, device/browser, client roles,
server revisions, pause/resume times and canonical transfer/settlement receipts.

Run each of the 21 multiplayer games with two humans: host on device A, non-host
on B. Alternate which is actor; repeat with a third human observer on C where the
catalog supports three seats. Cribbage/Gin remain two-seat tests. Treat any other
catalog seat/money restriction as an explicit exclusion, not a pass. Fake-only
Quintzee/Canasta do not earn real-money evidence. Async/solo host pause is N/A.

1. Host pauses during an actionable turn, waits longer than the original
   remaining budget, then resumes. Neither device may act while paused. Record
   server remaining budget and resumed deadline; no extra/lost active time.
   Only the actual actor regains controls. Continue without refreshing either
   client and verify the first accepted action has the correct identity/revision.
2. Repeat at deal, roll/reveal, scoring/count-up, result overlay, queued and
   running pot transfer, settlement, and successor admission, wherever applicable.
   Required presentation completes once; old callbacks cannot complete a new
   hand. Prove canonical balances/ledger are conserved and settlement is once.
3. Non-host B remains visibly connected but misses the resume event (controlled
   network fault). Host resumes. Observe automatic authoritative recovery and
   private game state reconciliation, record delay, then play the next turn/hand
   without reconnect button or refresh. Repeat with B as actor and observer.
4. Delay a completion rejection until after resume, and separately drop the
   response after server commit. Verify retry preserves exact request identity,
   presentation is not repeated, and authority dedupes scoring/settlement.
5. While paused: background/lock B long enough to establish actual suspension;
   restore it after host resumes. Separately disconnect/reconnect and reload.
   Record cold-mount behavior separately from live-flow animation continuity.
6. Duplicate/reorder pause and resume delivery; repeat pause/resume quickly.
   Trigger the applicable real-money forced-pause policy using synthetic money
   mode; separately verify fake-money autoplay. Do not substitute one policy
   for the other. Finish the game, Run It Back, and enter a different game.

Fail on refresh-required recovery, wrong actor controls, stale paused flags,
timer drift beyond the server policy, duplicate/lost presentation receipts,
premature successor admission, identity regression or any financial mismatch.
Keep evidence per game/role/phase/profile; a successful two-device smoke does
not certify other ordered game transitions or untested suspension/network faults.
