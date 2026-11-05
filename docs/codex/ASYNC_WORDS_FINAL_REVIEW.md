# Async Words final-turn review — 2026-11-05

Jeremy approved the correction after read-only source and hosted evidence.
The reported child is `f37440a8-db31-4c8a-b2ff-b268ea0f64e8` in match
`6177af46-d1a3-4fb5-ab76-3daba2457afd`. mcru81 placed UP for 4 points on
turn 35. Rack adjustments change 384–246 to authoritative final scores 385–245.
There are 18 opponent turn receipts. Playback records confirm the results route
began with turns 1, 3 and 5, instead of the final turn. No production data was
changed during diagnosis or qualification.

## Correction and preserved authority

`ChildResults` previously chose the oldest unseen attempt, replaying every saved
opponent turn. Words uses direct gameplay entry, so ordinary turns do not consume
the generic attempt-review queue. Its saved-board adapter also set `finished`,
which suppressed the shared tile reveal, and discarded the authoritative winner.

The terminal Words adapter now reads the existing side-effect-free
`delayed_words_inspect`, validates child/match/viewer identity and completion,
and selects only the matching final opponent placement receipt. The display uses
the authoritative final board, scores, rack adjustments and winner. Only the last
move is supplied to replay presentation; its main word and crosses are included.
The shared countup uses the pre-adjustment total, then displays the final total.
Own finishes, final passes, forfeits and legacy results show the completed board
without reviving an earlier opponent placement.

The completed snapshot remains immutable. The read-only replay projection admits
tile animation while retaining `phase=complete`, `canAct=false`, no rack and no
gameplay owner. Replay storage identities are separate from live Words receipts.
No rules, scoring formulas, settlement, schema, active Words entry, inspection,
other-game review selection or match-finale eligibility changed.

After replay/countup, the existing three-second settled-board hold must finish.
The existing idempotent `delayed_review_ack` then acknowledges covered unseen
opponent turn records without replaying them. Only after successful acknowledgements
does the existing Game Complete presentation begin. Its child receipt and fresh
server-qualified `reviewsComplete` still control Match Finale versus Match Home.
Partial ACK failures remain retryable; no bulk backfill or review-gate bypass.

## Qualification

- 301 focused Async/Words tests pass and cover multiple earlier opponent plays, final crosses,
  countup, adjusted scores/winner, a full three-second hold, game and match order,
  partial ACK failure/retry, reload, already-seen final turns with older pending
  receipts, hidden playback, reduced motion, own/pass/forfeit endings and identity.
- `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` and the
  production Vite build pass. Installed TypeScript is used; no tools installed.
- `node dev/async-words/final-review-browser.mjs` exercises real result/board/finale
  components and CSS over isolated loopback RPC fixtures, at 390×844 and 844×390.
  Both match-ending and remaining-game cases pass: only final UP/PA animates,
  376→384 then adjusted 385/245, settled-board pause, ordered ACKs, Game Complete,
  and the correct destination. Browser errors and horizontal overflow are absent.
  Screenshots and the request/timing record are in
  `qualification.local/words-final-review/` (local evidence, not customer gameplay).

Release checkpoint: `release-async-words-final-review-20261105`.
Production deployment identity is reported in the delivery response.
Physical-device production smoke remains Jeremy's acceptance step: review an
opponent-finished Words game with earlier plays, confirm only the last play/crosses,
countup, adjusted totals and pause, then Game Complete followed by Match Finale
only when the match is ready. Repeat with another game still unfinished.
