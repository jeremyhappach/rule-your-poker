# Six-Card Golf — local candidate, not release qualified

The implementation approval remains in force. The later coordinated-release instruction limits this pass to an isolated local candidate: **no merge, push, deployment, production migration, or admission activation**.

Current worktree: `codex/six-card-golf-candidate`, based on current main `44dbd5a7d4de4635b258f731558fe346473d82b9`. Only the earlier Golf SQL/proofs/checkpoint were copied from `codex/six-card-golf-v1`; unrelated original edits remain untouched. The lobby catalog integration follows the new main implementation.

## Frozen product contract

| Area | six-card-golf/1 |
|---|---|
| Mode | Canonical multiplayer table only; no Arcade |
| Admission | 2–4 accepted participants including strategic bots; at least one human; existing approved-account eligibility |
| Match | One dealer-game, frozen accepted roster/rules/stake, nine predecessor-linked holes |
| Table | Six fixed positions, two rows of three; retain exposed/cancelled cards |
| Deal | Fresh securely shuffled 52-card deck per hole; no jokers |
| Opening | Reveal any two distinct positions; no peeking/rearrangement |
| Order | Canonical clockwise; first left of hole dealer; rotate hole dealer, independently of session caller |
| Stock | Persist private pending draw; replace any position face up, or reject without compulsory reveal |
| Discard | Pickup must replace a tableau card; displaced card is public |
| Scores | A=1; 2=−2; 3–10 face; J/Q=10; K=0; equal ranks vertically cancel to zero; negative scores retained |
| Ordinary ending | Sixth exposed position gives each other participant exactly one final turn |
| House ending | Count completed turns without a new exposed position; reset on exposure; warn at 4N; at 5N queue all N from next actor through trigger actor |
| Final queue | Once started, subsequent exposure cannot restart/extend/shorten/cancel it |
| Score visibility | Completed-hole cumulative totals only in play; no partial subtotals; reveal remaining cards and score only when final queue empties |
| Timing | 30-second whole turn/opening; draw does not reset; paused time does not advance gameplay |
| Timeout | Real human timeout pauses unresolved decision; fake-money automatic play must retain canonical all-human safeguards |
| Conservation | `6N + stock + discard + pending = 52`, pending 0/1, exact unique partition; recycle all but top discard only when stock needed |
| Integrity | Impossible depleted pool rolls back or holds corrupted committed state; never redeal/score/settle to repair it |
| Privacy | Hide even own concealed positions; pending only actor; bots use whitelisted public/actor observation |
| Result | Lowest nine-hole total; shared winners, no playoff |
| Finance | Each loser pays S once; winners divide `(N−K)S` through canonical clockwise whole-chip remainder; all tie persists result with zero movement |
| Release | Candidate and installed-authority financial proofs, matching app/database, rendered qualification before any activation; Jeremy owns production smoke |

## Implemented locally

`supabase/six-card-golf/` contains the private rule reducer, secure shuffle,
conservation validation, whitelisted projection, observation-only bot policy,
consent adapter, immutable payload-bound action receipts, linked hole progression,
canonical transfer settlement, pause/recovery adapter and closed release gates.
The canonical table adapter, public six-card seat artifacts, completed-hole scoreboard, Rules dialog, stock/discard controls, persisted client intent recovery, capability-gated catalog/setup, Ante Up copy, Run Back configuration and terminal-retention wiring now exist. Canonical card flight/audio is implemented; browser and mobile visual qualification remain incomplete.

Only public revision notifications and authorized snapshot/action RPCs are
exposed; private cards are excluded from public history frames.

The shared ante dispatcher and frozen configuration guard are extended only in
the **uninstalled candidate SQL**. Existing shared catalog/shell/route owners have narrow additive Golf integration. Recovery dispatch/publication registration and release guards still
need their final integration.

## Evidence executed

All database execution below was in isolated local PostgreSQL databases.
`dev/six-card-golf/proof.mjs` installs candidate SQL inside BEGIN/ROLLBACK and
executes:

- Core scoring, negative totals, rank cancellation, legal opening, replacements,
  pending-draw privacy, progress reset/warning/end thresholds, both final queues,
  recycling, conservation and bot observation equivalence.
- Six complete human matches: 2/3/4 seats in both money modes, nine linked holes,
  consent, duplicate/altered/stale requests, final-action replay, actual canonical
  chip changes, deferred journal flush, final snapshots and settlement replay.
- Every co-winner count for 2/3/4 seats in both money modes (18 cases), canonical
  remainder, all-player zero-transfer ties and Session Ended disposition.
- Six injected failures after actual chip changes but before final snapshots,
  proving rollback of balances, transfer journal, result, snapshots and settlement.
- Mixed human/bot consent, autonomous opening and turn, paused-time preservation,
  and real-human timeout preserving an unresolved private pending draw.

`node dev/six-card-golf/concurrency.mjs` and its `--real` variant passed with
independent PostgreSQL connections under the authenticated role: duplicate
opening/draw, lost draw response, competing replacements, wrong actor, concurrent
settlement, and late replay. Both finish with exact balances 91/109 for stake 9.
Their evidence JSON is under `qualification.local/six-card-golf/`.

The isolated reference database predates deployed canonical pause helpers.
The proof imports the current versioned pause owner and all-human pause helper,
and supplies local-only recovery-context/timestamp helpers. These are excluded
from candidate SQL. Full production/reference parity remains a release gate;
passing this local suite is not installed-authority qualification.

## Resumed local validation — 2026-10-20

- TypeScript passed before the last presentation-container correction; a final rerun is recorded separately in qualification.local/six-card-golf/typecheck-final.log.
- Production Vite bundle passed (2,969 modules); ordinary chunk-size warnings remain.
- Four projection tests passed, plus catalog and shell tests: 34 total focused checks.
- Full application run: 2,550 passed / 9 failed. Six failures were the new access hook missing from the existing setup test mock; that mock was corrected. Three other cases timed out under the combined run. All three affected files passed in an isolated recheck (29 tests). The full suite has not been rerun green as one invocation.
- All 241 harness tests passed.
- SQL core, six complete human matches and the 18 winner/tie configurations with financial rollback passed again. Candidate SQL retains a 10-second statement timeout; the multi-match local proof explicitly uses a longer transaction-local test allowance after candidate installation. Synthetic scheduler heartbeat is refreshed between proof groups/admissions; this is not installed scheduler qualification.
- Extended recovery proof passed: deferred departure preserves the committed seat/liability, deletion is rejected, an arrival waits, and fake-money all-human automatic-play pause preserves pending draw/tableau/queue/progress. Real-human timeout and deliberate-pause preservation also pass.
- Actual browser automation passed two-human opening, private stock draw, reload retaining the same pending card, replacement and screenshots at 320×568, 390×844, 430×932, 844×390 and 390×664.
- Those browser assertions do NOT establish visual acceptance. Inspection found small landscape cards and crowded text. The first run also exposed missing canonical play-area reservation causing HUD clicks to be intercepted; the existing shell spacers corrected that. Opponent artifacts were subsequently moved into the canonical felt-height container; reinspection still shows right-edge clipping, so that change is not a claimed geometry fix.
- Local preview startup needed an isolated Vite cache, bounded entry discovery and exclusion of qualification artifacts from watching. Early fixture/navigation timeouts were not counted as successful browser evidence.

Evidence files live under ignored qualification.local/six-card-golf: browser.json, table-*.png, initial.png, regression-recheck.log, harness.log and typecheck-final.log. Earlier independent-connection concurrency evidence is preserved; it predates the latest roster/recovery changes.

This bounded pass stops at the repository execution-budget circuit breaker. No additional product choice is required; the next work is the responsive canonical artifact geometry and outstanding qualification, under the same approved contract and release hold.

## Remaining implementation and release blockers

1. Finish and visually qualify canonical two/four-seat geometry, especially landscape card readability/tap size, text collisions, opponent projection, safe areas and changing Safari chrome. Do not label viewport bounds checks as layout approval. Card transport/audio now has focused and browser evidence; see the latest checkpoint below.
2. Finish closed-admission migration assembly, current deployed-definition guards, recovery scheduler and public revision publication registration. No Golf production authority/migration exists. Reference/installed-authority parity remains unproved.
3. Extend independent-connection proofs for timeout/final-action races and earned zero-client settlement. Successor races, old requests after terminal continuation and corrupted committed-state hold now pass; continuation into a newly admitted match still needs proof.
4. Qualify complete mixed-bot matches, Run Back consent, chip transport, terminal hold, Session Ended and cold-mount routing through the actual application route. Two-human nine-hole browser operation passes in the direct canonical-shell harness; this does not establish full-route coverage.
5. Final application regression is green: 2,563 tests across 366 files, with one worker. The full application TypeScript check and production build pass. The earlier parallel timeout remains recorded as qualification-resource sensitivity, without a proven root cause.
6. Installed-authority proofs and coordinated release approval remain mandatory before any publication or activation. Both money-mode admissions remain closed; Jeremy has not performed production smoke.

The accepted Boxdrop pattern supplied consent/finance ownership, but its fullscreen board does not provide Golf's shared hidden tableau, multi-hole identity or responsive canonical table artifacts. These differences require the remaining presentation and lifecycle work; no approved rule has been changed.

## Local qualification follow-up — 2026-10-20

Starting checkpoint: `4349b7aba5d671ffeb64015b77d463f271387a62`.
No game rules or production authority changed in this follow-up.

- Added canonical tableau transport endpoints, projection-based card flights and
  shared launch-time audio. Private pending cards travel as backs without rank or
  suit in transport diagnostics. Initial/reconnect snapshots seek without replay.
  Settlement callbacks are guarded against superseded flights.
- Local cards now use the existing HUD hand area in taller containers and the
  felt in short containers. Actual rendered width drives canonical face sizing.
  Opponent tableaus have public-only inspection dialogs. Scores remain totals
  from completed holes; no concealed-card-derived subtotal exists.
- Full two-human browser match passed: nine holes, 162 actions, one settlement
  of +5/-5, conserved total balance 200, terminal completion callback, actual
  shared Web Audio starts on both clients, and no audio replay after reload.
  This mounts the canonical shell directly, not the full application route.
- 63 rendered combinations cover 2/3/4 participants, every viewer, and seven
  portrait/landscape sizes. All checked cards stay inside the viewport and local
  interactive cards are at least 44 pixels wide. Visual inspection and rectangle
  intersection checks still find opponent-tableau overlaps in 12 short-landscape
  cases (3/4 participants, 568x320 and 844x390). Name/card crowding also remains.
  These are failed visual qualification, not passing layout evidence.
- Corrupted committed card partition proof passes in a rollback transaction:
  actual recovery pauses, keeps state unchanged, leaves settlement empty and
  records only restricted fault metadata. The synthetic corruption disables the
  integrity trigger solely for injection, then restores it before recovery.
- Independent connection proofs pass in both money modes with successor races,
  exactly one linked successor, stale prior-hole rejection, immutable old
  receipts, one terminal settlement, autonomous terminal continuation, and old
  receipt replay after continuation. Exact balances remain 91/109 for stake 9.
  Terminal/successor fixtures isolate those boundaries; they do not replace a
  legal full-match proof or prove zero-client settlement from earned final play.
- Twelve focused projection/transport/shared-seat tests pass. Production Vite
  build passes with existing chunk-size warnings.
- Full suite with two workers: 2,558 pass, one Run21 test times out at 60 seconds.
  The unchanged Run21 file passes all 18 cases in isolation (42 seconds total).
  Final serial-suite and full application TypeScript outcomes are recorded below.
- A later basic browser run timed out before its first enabled card click while
  other qualification was running. Its log is retained; no cause is claimed.

Evidence: `qualification.local/six-card-golf/full-browser.json`,
`layout.json`, `layout-4-0-568x320.png`, `layout-4-0-390x844.png`,
`layout-2-0-320x568.png`, `concurrency-extended.log`,
`concurrency-extended-real.log`, `presentation-tests.log`,
`full-regression.log`, `run21-recheck.log`, `full-regression-serial.log`,
`typecheck-app.log`, `build-qualification.log`, `browser-qualification.log`,
and `full-browser-final.log`. Evidence is local and ignored by Git.

Still blocked: landscape visual quality; complete mixed-bot qualification;
remaining timeout/final-action races; earned zero-client settlement; Run Back,
Session Ended and cold routing through the full application; closed migration
assembly and recovery/publication registration; installed-authority and matching
production release proofs. Physical iPhone Safari and Jeremy's smoke remain
pending. Both money-mode admissions stay closed. No migration identifier or
production deployment exists for Golf.

Final follow-up results: `tsc --noEmit -p tsconfig.app.json` passed after
correcting an incomplete test fixture; `vitest run src --maxWorkers=1` passed
all 2,563 tests in 366 files (429.56 seconds). The final transport fixture also
passed its four focused tests. The final nine-hole browser rerun passed on the
current presentation code: 162 actions, +5/-5 settlement, 91/92 shared audio
source starts, terminal completion and silent reload. Its exact local match is
`cb39d99a-ddf9-40c8-8dcd-0ff2c1df9b2b`. The earlier basic-browser timeout remains
preserved; this successful full run supersedes it as current operation evidence
without explaining its cause. No additional implementation is started in this
bounded checkpoint. The next pass begins with the unresolved canonical mobile
artifact geometry and remaining release qualification; no product-rule decision
is needed.
