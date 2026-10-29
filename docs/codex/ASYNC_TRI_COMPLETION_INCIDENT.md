# Async Tri-Towers completion presentation — October 29, 2026

After the local checkpoint below, Jeremy approved production release.
`1b222a254` is now on main and production READY; the publisher receipt retry
and approved sibling follow-up are tracked in `ASYNC_COMPLETION_AUDIT.md`.

Production investigation is read-only. No customer action/recovery RPC was called,
and no customer session, state, score, balance or receipt was changed. The active
game screen is not exposed on this computer; browser inventory/AX inspection
found the coordinator chat and GitHub tabs, not the held game on the other device.

## Exact authority

- Parent: `5fc51132-1cfe-47b2-8b54-0d6520404a99`, fake-money, active, revision 50.
- Created 11:43:45.988675 UTC; accepted 11:45:05.313775 UTC.
- Participants: Hap `d7dc1928-3727-4351-b0ff-0e80c81c2953` and Happach Gmail
  `fb835d1f-db2f-4de4-84e2-ce0074512e46`.
- Four children: Words, Words, Run21, Tri-Towers. The two Words turns have handed
  to Hap; Run21 also belongs to Hap.
- Tri child: `4001c41d-45ab-40e9-bc15-391c536af999`, ordinal 4, stake 5.
- Accepted final command: `90dc860c-bb77-4448-8d23-ddc480d4f0a0`, remove index 2,
  actor Happach Gmail, expected revision 47/segment 1; receipt revision 48.
- Attempt completed at 11:47:25.560 UTC (6:47:25 a.m. Chicago), reason `cleared`,
  score 45,780, time bonus 580, stock bonus 6,000, scoreBefore 0.
- Saved attempt board is stage_complete; authoritative presentation deadline is
  11:47:33.560 UTC. Frozen tri-towers/5 rules: clear celebration 3,000 ms plus
  result hold 5,000 ms.
- Child is now revision 48/segment 2, actor Hap, current board null, round 1,
  turn 1, completed false, terminal false. The whole two-player child is not done.
- Child outcomes: 0. Parent settlements: 0. Canonical financial game rows: 0.
  The 45,780 score is a persisted provisional attempt; no repair is needed.

## Root cause and correction boundary

`DelayedTurn.tsx` detects the actor/segment handoff and displays ownResults' saved
board. However it passes raw board.result into TriTowersBoard, omitting the shared
presentation result identity, elapsed time, display score and stage. It also
changes roundKey to the newly advanced segment, so useTriRoundPresentation cannot
admit a live completion within the prior board scope. Finally it only navigates
an ended mounted route when there is NO saved result; a valid saved board remains
on screen indefinitely. These defects reproduce the reported static summary.

Approved local correction: preserve the completing attempt's identity across the
handoff, project the persisted result through existing roundResultPresentation,
and return to match home after the authoritative board presentation deadline.
Latch the current attempt rather than following later attempts. Duplicate updates
must not restart presentation; late recovery seeks the original window, and fresh
reentry remains a direct return. Do not introduce a new gameplay timer, score
calculation, shared animation owner, financial write or child settlement.

The boundary is the async adapter. Shared TriTowersBoard, shared presentation
hooks, live-game lifecycle and the separate cross-game transition audit need no
edits for this correction. No message was sent to another task without direct
human messaging authorization.

## Reproduction and approval checkpoint

Added `src/components/delayed/DelayedTurn.triCompletion.test.tsx`, rendering the
actual shared Tri board against a synthetic API projection with the production
score/timing shape. Before any product correction: 3 fail, 1 pass. Failing cases
cover stable identity/celebration/count-up/return, duplicate completion and late
mounted recovery. Fresh reentry passes. These are presentation tests, not a claim
of full native gameplay or physical-device acceptance.

Jeremy approved this exact correction for local implementation and validation.
The approval was also confirmed in the direct local-only question reply.
Publication and customer-state repair remain explicitly excluded.
Evidence is retained under `qualification.local/async-combined/tri-incident-*`.

## Local correction and validation

Only `DelayedTurn.tsx` changes product behavior. It retains the entered segment
and round, selects that round's immutable attempt, and supplies the shared
result projection with a stable child/player/round/completion identity. It uses
the saved board deadline to return to match home after presentation. Duplicate
responses cannot rewind the server-anchored presentation clock. The shared board
also receives the existing tab-active and held flags to suppress interrupted
presentation through its canonical owner.

Focused validation passes 39 tests: seven async adapter regressions, 14 shared
round-presentation tests, nine shared result-projection tests and nine delayed
server-adapter tests. The adapter cases cover celebration/count-up/return,
duplicate delivery with an older timestamp, fresh reentry, overdue recovery,
later-round updates, whole-child completion and forfeit without an attempt.

The local browser fixture under `dev/async-combined/tri-completion-*` renders the
real adapter, canonical shell and Tri board, with synthetic transport and no
database connection. It is a presentation-boundary check; it does not replace
production gameplay or physical-device owner acceptance. Shared hooks, server
rules, financial authority, privacy projection and deadlines are unchanged.

Application typecheck passed with the installed TypeScript compiler
(`node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`). The preferred
`bunx tsgo --noEmit` was unavailable (registry 404); no tool was installed.

Headless Edge at 390×844 passed the local browser sequence: the final-card click
submitted exactly one action with revision 47/segment 1; all-clear appeared in
the original `child:1` scope; score visibly counted through 2,019 to 45,780; a
duplicate update did not restart it; match return occurred after 8,055 ms; fresh
reentry returned directly without another action. No page errors or external
requests were observed. The three captured frames were visually inspected.
Fixture setup initially scanned unrelated entries and timed out during cold
module loading; constraining its dependency entry and waiting for navigation
commit resolved setup without changing product code or the result assertions.

Evidence: `tri-incident-focused.log`, `tri-incident-typecheck.log`,
`tri-incident-browser.json`, and `tri-incident-{celebration,count,final}.png`
under `qualification.local/async-combined/`. Browser/server fixtures closed after
verification. This is a local review candidate only: no push, deployment,
migration, admission/recovery change, or customer-match mutation was performed.
