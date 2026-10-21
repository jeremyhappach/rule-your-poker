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
the **uninstalled candidate SQL**. Existing shared catalog/shell/route owners have narrow additive Golf integration. Recovery dispatch/publication registration and release guards
are now prepared in guarded release SQL. Their real scheduler/Realtime execution still needs a complete Supabase environment.

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

1. Physical iPhone Safari acceptance remains pending. The latest 63-case rendered matrix now checks actual artifact intersections, 44-pixel local targets, unchanged chip anchors and working public-tableau inspection. Compact public previews intentionally open readable full-size cards; concealed values stay hidden.
2. Guarded closed-admission SQL and installed-proof artifacts are prepared. The local host lacks the actual pg_cron extension and logical replication; scheduler execution and Realtime delivery cannot be qualified here. A formal migration identifier has not been assigned (the Supabase CLI is unavailable); no production migration exists.
3. Timeout/action and final-action races, exact successors, earned service final settlement, old requests after a newly admitted match and corruption hold now pass locally. Actual scheduled recovery still needs the deployed/full-stack proof.
4. Complete mixed-bot matches and Run Back consent now pass. Full authenticated `Game.tsx` routing, including production Session Ended/cold-entry handoff, remains unqualified. The local loopback adapter is not the complete Auth/PostgREST/Realtime stack.
5. TypeScript and production build pass. Latest regression outcomes and retained timeout evidence are recorded in the follow-up section below; do not conflate split-run results with one green full-suite invocation.
6. Fresh deployed-authority comparison, installed-production financial proof and matching app/database publication remain mandatory before activation. Both money-mode admissions remain closed; Jeremy has not performed production smoke.

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

## Expanded local qualification — 2026-10-20

Starting checkpoint: `815ac99d3ff4f2b964433dec880311da2ba450c9`.
Approved rules, admission policy, stake consent and financial authority are unchanged.

The middle-seat public artifacts now clear the canonical 1%-versus-4% seat
inset plus a whole adjacent tableau. The local tableau/pile group is centered
using card dimensions. Nameplates attach outside the public grids. These are
artifact/name placements only: the canonical seat and chip cells are unchanged.
All 63 configurations (2/3/4 seats, every viewer, seven sizes) pass pairwise
card/pile intersection checks, viewport bounds, local 44-pixel targets, exactly
one interaction layer, and public inspection dialogs. Removing public artifacts
in the rendered DOM leaves every measured chip rectangle identical. Screenshots
include both left- and right-side compact projections and enlarged inspection.

Database evidence:
- `candidate-followup.log`: complete rollback suite, including core rules,
  six human matches, all winner counts in both modes, after-chip failure,
  recovery/corruption, and six additional complete mixed-bot matches.
- `mixed-proof.sql`: 2/3/4 participants in both modes; ordinary redacted bot
  decisions and actual recovery actions finish nine holes. At least one match
  earns its final action and settlement entirely in the service recovery path,
  without a browser callback. The fixture advances due times, not card values
  or winners. New Run Back matches require new human consent; old receipts do
  not affect their first hole.
- Both independent-connection race logs pass duplicate/lost-response handling,
  successor races, expired action versus recovery, final-action contention,
  settlement replay and terminal continuation. Recovery may SKIP LOCKED while
  a rejected action holds the row; a subsequent worker wake recovers exactly
  once. Real-money pause is resumed by the authorized host. Stake 9 produces
  exact final balances 91/109 and a single result/transfer batch.
- `install-local.mjs` installs authority into `golf_installed_1792543146476`,
  then runs the entire proof against installed definitions inside rollback.
  Final assertions: admission false/false, zero Golf matches/revisions, actual
  `supabase_realtime` publication membership and authenticated private-state denial.
  No real cron or logical replication evidence is inferred from that membership.

Release preparation:
- `release.mjs` emits guarded SQL and a complete installed-authority proof.
  Six reference signatures/hashes are checked, allowing only LF/CRLF equivalence.
  The deployable script rejects missing pg_cron, missing publication or nonlogical
  WAL before installing Golf. A legacy test `cron.schedule` stub does not satisfy
  the extension prerequisite and is never used as scheduler evidence.
- Prepared SQL SHA-256:
  `fedd1d34fd385102212165c2d3eb552057166d7061e8b4c79fc78097a013caef`.
- Artifacts: `qualification.local/six-card-golf/migration.sql`,
  `installed-proof.sql`, `release-manifest.json`, `installed-local.json`.
  These are local artifacts, not a production migration/history entry.

Rendered lifecycle scope:
The local browser harness mounts the real Golf table, canonical shell, shared
Session Ended results/action/announcement components and actual local database
results. It uses a thin loopback RPC/subscription adapter. Its fixture-specific
cold-lobby routing does **not** prove authenticated `Game.tsx` routing. That remains
an explicit full-stack gate. Golf's actual retention hook, stake setup, saved
Run Back stake and noncaller explicit consent have 26 passing component checks.
The preview adapter was corrected to support subscriptions without a status
callback, as used by the shared results component; no production transport code
changed for that harness correction.

Verification also passed the application TypeScript check, production bundle
and all 241 harness tests. The initial full application run hit two unchanged
Run21 timeout cases (5s and 60s) while other qualification was running and was
stopped. Its log is retained. Timeouts were not increased and Run21 code was not
changed. The remaining-suite and isolated-Run21 outcomes are recorded below.

Final checks for this local checkpoint:
- `regression-followup-rest.log`: 2,549 tests in 365 files passed.
- `run21-followup-isolated.log`: all 18 unchanged Run21 authority tests passed
  in 29.58 seconds. Total: 2,567 passing application tests across two final runs,
  not one uninterrupted green full-suite invocation. The cause of the earlier
  concurrent-run timeouts is not established.
- `session-ended-browser-verified.log` and `session-ended-browser.json`: two
  humans completed nine holes through 162 actions; exact +5/-5 settlement,
  shared audio, actual shared Session Ended results, local Back to Lobby with
  unchanged settlement, and silent cold reload passed with zero page errors.
  Match: `dffcd429-59ba-49b8-bddb-2a4a2e89b7c1`.
- `session-ended.png` shows no Golf cards, but retains a visible +5 presentation
  label below Back to Lobby at capture time. Terminal visual retirement is
  therefore not fully qualified; the full application run must establish and
  correct its owner/lifetime if it persists across the Session Ended boundary.
- `layout-followup-final.log`: 63 cases passed. Representative evidence:
  `layout-4-0-568x320.png`, `layout-4-3-568x320.png`,
  `layout-4-0-390x844.png`, and `inspect-4-0.png`.

All named logs/screenshots are under `qualification.local/six-card-golf/`.
Repeat with the existing local prerequisites: `node dev/six-card-golf/proof.mjs`,
`node dev/six-card-golf/concurrency.mjs` (also `--real`),
`node dev/six-card-golf/install-local.mjs`, and with the local preview running,
`node dev/six-card-golf/layout.mjs` and
`node dev/six-card-golf/full-browser.mjs --end-session`.
Local proof scripts create isolated fixtures/databases; they are not read-only
production commands. Do not point the harness at production.

No merge, push, production migration, deployment or admission activation was
performed. Real pg_cron/logical Realtime, fresh deployed authority comparison,
installed production financial proof and authenticated full application routing
remain blocking gates. The local reference proves SQL behavior but cannot
replace those service-level checks. Physical iPhone Safari and Jeremy's smoke
remain pending. This bounded qualification pass stops at its local checkpoint.

## Route and migration reconciliation — 2026-10-20

Local starting commit: `79292bcedecddc2b08b1b46447884631d6ed5f09`.
Reconciled main: `88c798396bd0202551e36dcf4cd9efa39c9ef555`.
Only the Golf candidate branch receives main; main itself is not changed.
Additive conflicts preserve both games in consent, catalog, setup, retained
presentation and shared SQL registration. Golf Rules now use main's common
fixed-version resolver. No approved rules, financial amounts or pause behavior
changed. The unrelated Cribbage snapshot remains excluded.

The +5 label was a shell-owned positioned chip-delta effect lasting beyond
terminal admission. The existing route's Session Ended phase now disables that
renderer synchronously; late deltas are consumed without replay. The financial
ledger remains authoritative and untouched. Golf's own controls and open
inspection dialogs also retire. The browser harness keeps the actual GolfTable
mounted through Session Ended, matching the production route lifecycle.

Actual `Game.tsx` route tests use its auth guard and shared shell with simulated
SDK responses and a contract-compatible gameplay body. They pass cold
ended-session routing, confirmed sign-out, connected retention, stale completion
rejection, exact completion, shared Results and local Back to Lobby. Initial
fixture failures (UPDATE sent to DELETE listeners; missing HUD portal target)
are retained in logs and do not establish production route defects. No live
Auth/PostgREST/Realtime service qualification is inferred from these tests.

Evidence under `qualification.local/six-card-golf/`:
- `regression-integration.log`: 2,597 tests in 372 files passed, including
  all 18 Run21 authority cases in the same run.
- `route-final.log`: all three newly added actual-route cases passed.
  `ChipPresentationDeltaRuntime.lifecycle.test.tsx` also passes immediate
  retirement, late-arrival suppression and a new successor's distinct delta.
- `session-ended-retained.log`: nine-hole two-human browser run, 162 actions,
  exact +5/-5, zero browser errors, no cards/public tableaus/controls/result
  artifacts/delta labels at Session Ended, unchanged settlement after Back to
  Lobby, silent cold reload. Match `264f3ee8-03bc-4b2f-a41c-c7644c469eaa`.
  Updated `session-ended.png` is the retained-component capture.
- `candidate-integration.log`: complete candidate rollback suite including
  mixed bots and service-earned final settlement passed.
- `concurrency-integration.log` and `concurrency-integration-real.log`:
  both-mode duplicate, timeout/action, final-action, successor and settlement
  races passed on the reconciled registration.
- `installed-final.log`: complete installed Golf plus Race Poker
  core/financial/failure-rollback proof passed in local database
  `golf_installed_1792546226509`. Admission false/false, zero Golf matches and
  revisions, real publication membership and private-state denial verified.
- `race-preservation.log`: separate Race Poker core, both-mode financial and
  after-chip-write failure proofs passed through Golf registration, rolled back.
- `harness-integration.log`: 241 tests in 12 files passed.
- `typecheck-complete.log` and `build-final.log`: TypeScript and final production
  build passed. Earlier reconciliation/test-fixture type errors were corrected.

Official CLI 2.121.0 created migration `20261021011905`; the guarded SQL is
tracked in the normal migration directory. Seven newline-normalized reference
hashes include main's Race Poker authority. The generated source has normalized
LF and SHA-256
`815408fbc2cf2a37948b87a91656fc7d56e1d546d28e8f45c48961fd1c73e121`.
Local pg_cron is absent and WAL is replica; the full migration rejects those
prerequisites before creating Golf. The authority/publication subset is proven
locally, but no actual scheduler or migration-history application is claimed.
The installed local proof includes isolated heartbeat seeds and is explicitly
marked unsuitable for production unchanged.

No credentials were created, security settings changed, production accessed,
main updated, code pushed, deployment performed or admission activated.
Remaining service-level gates and the exact later production sequence are in
[the closed-admission release plan](SIX_CARD_GOLF_RELEASE_PLAN.md).

Final retained-component rerun with the real route's neutral lobby branding:
`session-ended-final.log` passed for match `fbc9224b-3f89-41b8-9795-fbcf1294dd47`,
162 actions, nine holes, exact +5/-5 and zero page errors.
`route-terminal-contract.log` passed all three route cases with an authoritative
terminal result/completed-round fixture and active/completion callbacks.
`final-affected.log` passed 29 affected checks. The current screenshot is
`qualification.local/six-card-golf/session-ended.png`.

## Final terminal announcement correction — 2026-10-20

Visual review of that neutral-branding capture found that the shared lobby
announcement cleanup also removed the legitimate Session Ended heading.
The cleanup now preserves only the exact current game's `session_ended`
ambient while the canonical Session Ended phase is active. Late gameplay
announcements and other-session announcements still retire; leaving the phase
clears the exception. No second announcement owner or timer was introduced.
Settlement, rules, pauses and financial ledger authority remain unchanged.

After this correction, `terminal-phase-final.log` passes 30 tests across the
actual Game route, persistent shell, chip-delta retirement and Session Ended
panel. `terminal-phase-browser.log` passes the complete two-human match
`082cad69-f89d-497a-aec3-7c21c136895d`: 162 actions, nine holes, exact -5/+5,
zero browser errors, shared audio, local Back to Lobby without settlement
changes and silent cold replay. The updated `session-ended.png` was visually
reviewed: Session Ended, Results, HUD and Back to Lobby remain, while Golf
cards/controls and the transient +5 delta are absent.

`typecheck-terminal-final.log` is clean and `build-terminal-final.log` passes
(20.85 seconds, existing chunk-size warnings). The full 2,597-test regression
run preceded this small final guard correction; the affected 30-test suite and
production build were rerun afterward. The 241 harness tests and 63 layout
cases were not repeated for this announcement-only correction.

These remain local results. Live authentication/PostgREST/Realtime, actual
scheduled pg_cron recovery, deployed-authority comparison and production-safe
candidate/installed proofs remain release blockers. No production deployment
or activation is claimed.

Main advanced during qualification to
`3f3dfb3e199d31097646c349363b6b8d77486daa`. Its isolated Box Drop numeral
contrast CSS is incorporated unchanged. The only merge conflict joined the
two release-note introductions; both entries were retained. No Golf source or
SQL changed in this final reconciliation. The combined production build is
recorded in `build-main-final.log`.
