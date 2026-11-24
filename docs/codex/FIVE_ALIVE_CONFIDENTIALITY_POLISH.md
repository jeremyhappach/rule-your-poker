# Five Alive confidentiality and live gear polish

Approved November 23, 2026. Owner production smoke remains pending.

## Correction and boundaries

- Five Alive already has the canonical $1 default and Async stake validation.
  The defaults UI incorrectly tested only Live eligibility, hiding the ante for
  an Async-only multiplayer game. It now uses existing Async capability metadata
  too; the descriptor uses the shared stake editor. Live admission stays unchanged.
- `sealedProjection` exposed complete opponent guesses after mutual completion.
  It now retains guess count but strips earlier words and feedback, including all
  guesses on failure. The replay additionally masks old unredacted payloads and
  exposes final correct letters only as their tiles open.
- `delayed_match_record` independently returned raw rounds. Migration
  `20261124005508_five_alive_opponent_history_privacy.sql` changes only its
  Five Alive response: own history intact; opponent earlier guesses redacted.
  Exact-definition guard and idempotence preserve other-game behavior, membership
  checks, privileges, saved state, scores, receipts and financial authority.
- `FiveAliveBoard` previously hid its keyboard and changed finished geometry
  immediately on the completed snapshot. Both now wait for the existing tile
  reveal completion. Input remains disabled while revealing, with the same
  treatment for success and sixth-miss failure in Arcade and Async.
- The live gear control was mounted but inherited dark mobile icon styling on
  the Blue Hour header. A scoped foreground/hover rule restores contrast for
  seated, observer and waiting variants. The three existing Game route call sites,
  hit targets, overlays, handlers and Blast's admin/play-money authorization stay
  unchanged. No second settings surface or game control owner was added.

## Validation

- Shared rules: 10 tests pass.
- Focused component checks pass: default $1 edited/saved as $7; exact Async
  creation payload; completed-history placeholders and score; replay/ACK behavior;
  each tile's keyboard/geometry for correct and six-miss results in both modes.
- Candidate migration applied twice inside a rollback proof. The proof passes
  again after deployment. It exercises real and fake money, selected stake $7,
  winner, tie, six misses, duplicate/late replay, continuation, unauthorized and
  anonymous history, atomic failure rollback, canonical player chips, balanced
  transfers, snapshots, account postings and terminal lifecycle. All fixtures
  roll back. Financial implementation is unchanged.
- `dev/five-alive/privacy.rollback.proof.sql` reuses the established financial
  proof and compares both viewers' history against authoritative state.
- Browser proof uses actual components with isolated local transport:
  `node dev/five-alive/presentation/confidentiality-proof.mjs`. It samples each
  reveal frame, checks masked opponent projection/replay, and exercises the
  existing gear/Blast/Auto Ante/turn controls at 320, 390 and 1000 pixels.
- Full `npm run build` passes: TypeScript, 4,395 application tests, 241 harness
  tests, 46 release-tooling checks, Vite and the static-size gate (89,833,678
  bytes / 219 files, below 90 MB). Browser proof passes with 151 Arcade and 150
  Async reveal frames preserving the keyboard, no browser errors, and passing
  gear actions at all three widths. Local evidence is under `qualification.local/`.

## Async lobby investigation — read-only

Measured production Chrome, unthrottled, 393 × 499 viewport, authenticated as
Happach Gmail. Bundle `index-B0tKRqzm.js`. Warm navigation started at the Live →
Async click; usable means first match content in the DOM followed by two animation
frames. Times are milliseconds from that click. No lobby, RPC or loading changes.

| Run | Match DOM | Usable/paint proxy | Initial list start / duration | Subscription list start / duration |
| --- | ---: | ---: | ---: | ---: |
| 1 | 579.8 | 593.5 | Resource buffer full | Resource buffer full |
| 2 | 398.6 | 425.7 | 29 / 320 | 64 / 331 |
| 3 | 534.3 | 544.1 | 33 / 461 | 90 / 442 |

The measured critical wait is `delayed_list`, not blocking rendering. `MatchList`
starts it on mount; `useUpdates` starts another on realtime `SUBSCRIBED`. The
second increments the epoch, so the first result is discarded. The duplicated
requests overlap, not run sequentially. In runs 2 and 3 the accepted response
finishes at approximately 395 and 532 ms; render/paint adds approximately 31
and 12 ms. No main-thread long task of 50 ms or more was observed. Optional
settings/account requests run in parallel rather than gating list rendering.

Read-only rollback-contained database `EXPLAIN ANALYZE` measured `delayed_list`
at 151 ms for Happach Gmail and 306 ms for Hap. These are separate server samples,
not a subtraction from the browser requests; remaining end-to-end time includes
network/API overhead and scheduling.

Earlier cold resource entries show main JS starting at 83 ms (113 ms download),
the lazy Delayed chunk at 594 ms (44 ms download), and list calls at 644 ms
(531 ms duration) and 696 ms (480 ms duration). Last list data arrives near
1,176 ms. This is a resource trace, not a measured cold time-to-usable.

The reported 2–3 seconds was not reproduced. The evidence identifies list RPC
latency plus duplicate mount/subscription fetching in the measured path; it does
not fully explain the slower reported case. A cold iPhone/PWA navigation trace
would be the next diagnostic if it persists. No speculative optimization shipped.

## Owner smoke

1. Open Five Alive defaults; confirm $1/current saved ante and save a new amount.
   Create a real-money Async invitation and confirm its selected stake survives
   acceptance and the final result. Existing play-money setup policy is preserved.
2. Solve a word after earlier wrong guesses on each device. Opponent earlier rows
   stay gray through replay, re-entry, Word Results and completed match history.
   Repeat with six misses; none of those words should be exposed.
3. Watch correct and sixth-miss tile flips. Keyboard and layout remain until the
   last tile finishes, including the last word of the match.
4. In live play, open the gear menu, use an ordinary setting, close it and take a
   turn. Eligible admin play-money sessions retain Blast This Game.
