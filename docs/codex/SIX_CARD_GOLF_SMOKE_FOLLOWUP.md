# Golf smoke corrections — local candidate, October 22, 2026

Base: live `8e7af0299a3eb269f5ffbe62d1aadbe9f5f64878`.
Branch: `codex/golf-smoke-followup`. Owner approved local implementation only.
No main merge, push, deployment, migration, admission change or production gameplay.

## Diagnosis and correction

- The drawn-card button itself submitted `reject`. It is now a noninteractive
  artifact; a separate Discard pill to its right appears only during the viewer's
  legal pending-stock decision. Existing command dedupe and replacement targets remain.
- Card transport already queues recognized moves but had no readable completed-turn
  hold. Its existing queue now holds the landed board for the frozen Scoring Delay
  before the next turn's motion. The default is 1200 ms. Server actions and deadlines
  remain unchanged; this time is presentation time, not extra decision time.
- Scoring used the persisted clock while the final card was still moving. A live
  viewer now finishes observed motion, waits Scoring Delay, then counts the complete
  sequence and retains the scorecard for the frozen Results duration (5000 ms here).
  An already-arrived next-hole snapshot remains authoritative and cannot be acted
  upon through the retained prior-hole presentation. Recovery seeks persisted time.
- Golf's chip admission accepted terminal settlement immediately. It now waits for
  the same completed scorecard boundary as winner announcement/celebration, including
  when the ledger notification precedes the first Golf snapshot. The canonical ledger
  still owns balances and transfer retirement. No settlement write is delayed.
- Hole-nine settlement adds an authoritative revision. Move detection now recognizes
  that exact additional revision, preserving the last replacement before counting.
- Automatic hole results use the nine-hole pencil scorecard, without a close button.
  The compact scoreboard adds “tap for all”. The new hole's existing SVG strokes
  draw in for one second; prior holes/totals stay stable, and reduced motion disables it.
- Opponent tableaus use the canonical small face tier and explicit block grid cells.
  Active-player card geometry and face tier remain unchanged. No shared renderer changes.

## Verification

55 focused tests pass across Golf, financial admission and Game route tests.
The added integration mounts the actual Game and Golf components with a simulated
SDK boundary, not a mocked Golf board. It exercises the whole final counting/scorecard/
winner/Session Ended sequence, early terminal session state, repeated and stale snapshots.
Separate tests cover paused clock shifts, reconnect seeking, successor retention,
stock rejection, final settlement revision and pre-snapshot financial admission.
TypeScript and production build pass. No dependency installation is needed.

`dev/six-card-golf/smoke-followup.mjs` captures actual isolated local draw/reject,
portrait/landscape opponent cards and a legally completed hole. Its final-hole
sequence is explicitly a public presentation fixture, not a money/settlement proof.
`smoke-followup-bots.mjs` exercises an actual local human/two-bot match with private
draw backs, queued motion and six represented local positions. Both pass without
page errors. Screenshots and timed sequences are in
`qualification.local/six-card-golf/review-20261022-smoke/index.html` on port 5202.

Canasta code, its parallel checkout and live play-money-only access are untouched.
Golf admission, rules, scoring, stakes, hidden information, server recovery and all
database/financial authority remain unchanged. Unrelated Cribbage snapshot and
Supabase temporary files stay excluded. Owner review and publication approval remain.
