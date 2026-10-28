# Words polish — local review candidate — 2026-10-28

Owner-approved scope is implementation, tests and a local preview only. No hosted
migration, production admission change, deployment, integration or push is authorized.
Base: `39f5855202efcce6dc42473a5bfcd0b323c6afc9`; branch `codex/words-polish`.

## Delivered scope

- Persistent Async Words access in the bell, including its empty state; removed
  from Start Game. Pending notices give the bell a red background. Lobby-only
  ringing repeats every ten seconds and respects reduced motion. New pending
  revisions request the existing doorbell cue through platformAudio. Sound
  preferences, browser unlocking and expiry remain authoritative; visual ringing,
  unchanged refreshes and reading an outstanding turn do not create new cues.
- Compact invitation form with initial active-player results, immediate filtering,
  username/recent-opponent sort and stake pencil. Keyset pages contain 50 players,
  explicitly disclose further results, and preserve exact cursor precision.
  Recent order uses successful authoritative command receipt timestamps, with
  acceptance/settlement fallback. Only the caller's own match relationships enter
  this order. No availability-of-funds gate is introduced.
- Pending invitations hide provisional totals. Acceptance creates one persistent
  inviter notice under the existing user/match/kind uniqueness constraint.
- Match lists show authoritative own/opponent turns with green/yellow treatment.
  The bell re-reads match authority before direct navigation: exactly one current,
  unheld, unexpired own turn opens that child; other cases return to match home.
- Shared Words rack gestures auto-place after two aligned, contiguous draft tiles.
  Occupied squares are skipped; row/column edges, blanks, manual correction and
  reset to one/zero draft tiles are covered. Rack taps do not zoom or submit.
- Shared own/opponent score presentation holds +points for 1 second, counts up
  during a 600ms float/fade, then holds 2 seconds. Async own completion returns
  home afterward; live Words stays at the table. Terminal rack adjustments remain
  separate from word points. A fixed score-area allowance avoids covering the
  canonical announcement rail or changing layout during the animation.

## Authority and presentation

`supabase/delayed/polish-local.sql` is an unregistered local candidate. It adds
opponent paging/index, acceptance notification production, and an async state
trigger that records the accepted move's exact actor, turn and new tile squares.
This is presentation metadata in the existing authoritative action transaction;
it does not score again, move money, change admission or extend async deadlines.
Normal completion/forfeiture and immutable child/parent results retain their owners.

New live deals freeze a 3600ms post-reveal presentation allowance through the
existing presentation configuration. The unchanged live trigger starts the full
gameplay clock after this allowance. Existing live configurations and timestamps
remain binding: a late/legacy presentation catches up by its original handoff,
even if that means shortening the new visual hold. The deployed live presentation
trigger hash and local trigger hash match (`6120140551b7766332abbd010eb10e65`).

Async snapshots previously had no move-presentation event. New accepted moves now
produce it; historical events are not fabricated. The current shared reveal
configuration supplies focus/cadence in both modes. Async availability remains
36 hours, Last Call 24 hours, with child-only forfeiture and no player pauses.

Seen-event receipts use sessionStorage keyed by child/dealer identity and viewer,
with exact turn identity. First opening an unseen opponent turn replays only its
latest committed word. Refresh/reentry resumes elapsed presentation; an elapsed
receipt shows final state immediately. Leaving the page does not freeze elapsed
time. Another tab/device may present that latest event once independently. None
of these receipts are scoring, balance, action or deadline authority.

## Verification and local preview

Local database is cloned from a template matching all 27 captured deployed
async/Words authority definitions. Proofs and screenshots are under ignored
`qualification.local/async-words/`.

- `polish-proof.mjs`: stable 55-opponent pagination, eligibility, filtering,
  recent acceptance/actual-play order, acceptance replay/read, one word score and
  presentation event on replay, unchanged 36h/24h and zero interim transactions;
  original normal/tie/forfeit/canonical rollback/privacy/admission proof retained.
- `polish-races.mjs`: independent connections race acceptance and identical word
  commands; one acceptance notice, one score/event and the same command receipt.
- `polish-browser.mjs`: actual authenticated local async RPCs, two viewers,
  invitation/acceptance, direct navigation, CAT placement/score/return, opponent
  reveal and reload receipt, phone (390x844) and desktop (1440x900).
- `polish-live-browser.mjs`: actual live Words RPCs and shared PtownWordsTable,
  canonical announcement, score animation, full server-timed handoff and reload.
  Its local shell supplies fixture chat context; it is not a new full Game-route
  terminal/financial qualification. Existing release proofs remain necessary.
- 78 focused Words, notification, audio and draft assertions passed across the
  focused runs and final reruns. Two parallel UI timeouts and a later worker
  timeout were retained in the logs; final serial UI verification passed all
  20 tests in 2.46 seconds with unchanged assertions (30-second runner ceiling).
  The notification and score-receipt rerun passed all six tests, including
  deferring an unseen opponent event while an async match is held.
- Application TypeScript project check passed. Final production bundle passed
  in 38.05 seconds with the existing chunking/Browserslist warnings. Local
  authority, concurrent retry and both phone/desktop browser flows passed.

Preview server: `node dev/async-words/route-server.mjs`, loopback port 15319.
It uses only the isolated local PostgreSQL clone and synthetic fixture identities.
Auth tokens are in `browser-context.json`; open `/delayed?token=<fixture token>`.
The server must see a passing proof receipt. No hosted backend is used by this
preview bridge. Synthetic committed browser/race fixtures stay in the disposable
local clone; rollback proof fixtures do not persist.

## Remaining limits and coordination

Async time-bank quantity and extension duration are pending the owner answer.
No bank grant or 36h/24h policy change is included. Existing synchronous banks
remain intact. Full Ptown invitation/acceptance theming remains deferred.
Physical-phone interaction and audible sound acceptance remain owner smoke.

The transition assurance task is editing `src/hooks/usePtownWords.ts` and its
tests. This candidate does not modify either file or consume that unpublished
work. Reconcile through the coordinator before any later integration. No
production publication is permitted by this local-review approval.
