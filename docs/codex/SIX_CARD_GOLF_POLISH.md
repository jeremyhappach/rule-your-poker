# Golf local polish — October 22, 2026

Branch: `codex/golf-leaderboard-polish`, based on published
`568f8cc5d7eae5a8dac4097232860cad3132e570`. Local implementation and preview only.
No merge, push, production mutation, migration, admission change or deployment.

## Owner request and implementation

All seven requested surfaces are implemented locally:

1. Remove both exposed-card subtotal helpers. In-play standings use completed
   hole results exclusively; scoring's running per-player hole subtotal remains.
2. Preserve observed moves across newer revisions instead of cancelling the
   current flight. Private opponent pending draws use backs, never private ranks.
   Draw-only, stock replacement, discard pickup, reject, and final replacement
   have separate presentation steps. Flights take 350 ms; selection/drawn holds
   take 180 ms. Shell retirement paints before the next flight starts. An exact
   two-revision stock draw plus replacement/reject can be reconstructed from
   public card-count changes. Unrecognized gaps, identity changes, reconnect and
   pauses still seek current authority. Server bot schedules are unchanged.
3. Remove only Golf's TurnSpotlight mount. Canonical announcements, active timers,
   off-turn disabled/dimmed discard, and persistent FINAL TURN remain.
4. Original vector red numbered flag, silver pole and grass base to the left of
   the centered six-card bundle, inspired by the viewed owner reference. No
   reference watermark or stock artwork was copied.
5. Blue compact Player / Score / Thru leaderboard on the right. Score is a dash
   and Thru blank before completion; completed zero totals use E. Tap opens
   Player / 1–9 / Total with unfinished cells blank. Green header, light grid and
   original vector pencil numerals preserve the requested handwritten look on
   every device without external fonts. The same scorecard becomes the felt
   centerpiece at the existing winner-hold boundary, alongside canonical winner
   announcement/celebration and financial presentation. Settlement remains
   immediately authoritative. Session Ended removes the scorecard and artifacts.
6. Larger centered viewer-turn piles, discard left / stock right. Existing
   canonical anchors follow actual responsive card geometry. Occupied cards
   offset, outgoing faces remain faces, and outgoing backs flip at discard.
7. Golf's entry in the canonical felt label map now produces `$x GOLF`; other
   games' entries and the shared plate renderer are unchanged.

Final-reveal animations admit at the persisted scoring phase offset after a
preceding card flight; they do not restart a full animation late and truncate it
at the next server beat. The 1200 ms Scoring Delay, 5000 ms Results duration,
whole-turn allowance, consent, card privacy, rule identity and finances remain.

## Evidence and limits

The new review is served at
`http://127.0.0.1:5202/qualification.local/six-card-golf/review-20261022-polish/index.html`.
`checkpoint.json` there contains the exact UI source SHA-256 fingerprint.
`polish-evidence.json` records a real four-human local board/replacement and
320×568, 390×844, 844×390 and 1024×768 layouts. The hand fits its pane, is centered
between the flag and leaderboard, and preserves six positions. Short landscape
uses the canonical pane's available space; smaller cards remain owner-smoke work.

`bot-evidence.json` records an actual local human/two-strategic-bot match and
timestamped screenshots. After correcting a brief transport retirement overlap,
the recorded trace has at most one flying card and at least six represented
opponent positions. Bot draws stay concealed. Neither browser run has page errors.

The history and game-over screenshots use explicitly labelled browser-only public
result fixtures rendered by the actual Golf component. They do not modify database
cards or results and are not a new financial/complete-match qualification claim.
The existing released settlement proof remains applicable because authority and
financial code are unchanged. These changes have 53 focused tests, TypeScript and
the application Vite build as their local checks. Owner device/visual acceptance
and publication approval remain outstanding.

Reproduction: `GOLF_LOCAL_PORT=5202 node dev/six-card-golf/serve.mjs`, then run
`polish-review.mjs`, `polish-bots.mjs` and `polish-gallery.mjs` from the same dev
directory via Node. The server uses only the existing loopback database; its
default port and human-only fixture behavior remain unchanged.
