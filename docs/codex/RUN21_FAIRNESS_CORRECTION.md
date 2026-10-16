# Run21 independent decks — October 15, 2026

New admission was contained at 20:55:08 CDT (01:55:08 UTC October 16).
`private.run21_production_release.qualified=false` blocks both money modes and
Run Back through the same setup RPC. A rollback-contained deployed proof verified
both setup entry points reject before creating records while existing participant
admission and reads remain available. Only Run21 setup/capabilities use this gate;
the shared setup RPC excludes Run21. Recovery and existing-match settlement do
not consult it. The worker remained healthy. No match or financial data changed.

## Defect and historical scope

The old round has one `secret.cards` array. Every player's board starts at zero,
and `present()` uses that same array. Watching the earlier turn therefore exposes
the later player's card sequence. This is an authority defect, not coincidence.

Read-only production evidence identified 26 persisted shared-deck matches:
21 financial-version-one fake-money matches and five financial-version-two
matches (two fake money, three real money). Two real-money matches are finished.
The unfinished real-money dealer-game is
`26e46f50-3c1f-4c98-99d4-bfbcf7dcf756`, in session
`56524fff-ba04-41f5-be01-969e1d9abb0b`. It is paused in round three: the first
player busted; the second has one presented card and no placement. It has no
winner or settlement receipt. Jeremy explicitly chose **leave paused for owner
review**. Do not resume, redeal, void, refund, rectify or settle it as part of this
correction. Private future cards and salts were not retrieved for this inquiry.

## Authority and compatibility

Newly admitted rows freeze `deck_version=2`. Existing rows retain version one,
including any match admitted but not initialized at migration time. The authority
creates both player decks before its single round-preparation CAS commit. Each
invocation uses the existing CSPRNG, rejection sampling and unbiased Fisher–Yates
shuffle. Every round receives two fresh invocations; handoff and recovery use the
persisted evidence without shuffling again.

Each private deck includes authoritative session, dealer-game, hand, round and
player UUID identity, 52 cards, salt and a player-scoped SHA-256 commitment under
`run21-shuffle/2`. Each board retains its own cursor. Public frames contain only
the commitment map and admitted cards. The persistence trigger rejects deck
replacement, changed round identity, removed rounds and dealing-version changes.
The financial RPC, action authorization, CAS/request dedupe, clocks, perfect 105
completion, shared shell, one ledger flight and postgame owners are preserved.

Historical matches keep the single-deck path for all remaining rounds. Existing
events and commitments are not rewritten, and replays continue showing what
actually happened. The migration checks match/event/receipt hashes and every
existing public/private function body. It changes no financial records or shared
routine. The setup-frozen 104/105 harness remains restricted by the existing
fake-money test-mode guard. Separate player evidence and suit permutations let
both participants prove the score without declaring shared dealing correct.

## Qualification and release status

Engine and authority proofs cover independent shuffle calls, 52 unique valid
cards, exclusive player draws, identity swaps, new rounds, one-player Pass,
concurrent initialization, duplicate requests, restart in both turns, private
projection/history/replay redaction, 104/105, legal perfect completion, Give Up,
bust, deadlines and legacy replay preservation. Tests use injected known decks;
they do not assert that random shuffles cannot happen to match.

Disposable PostgreSQL proofs exercise actual financial triggers, authorization,
canonical +$1/−$1 transfers, one receipt/result, matching final snapshots, injected
snapshot-failure rollback, competing commits, replay/late replay, ties, Run Back,
terminal Session Ended, real-money pause/return, fake-money bot recovery and
zero-client final settlement. Historical single-deck completion creates no
retroactive financial records. The packaged migration's strict deployed-function
hash check caught CRLF in the old local fixture; normalizing fixture SQL to LF
matches the deployed definitions without weakening the migration check.

Full regression: 2,400 passing checks, plus the subsequently added initializer
race regression. TypeScript and production build pass; existing bundle-size and
Browserslist warnings remain. The separate two-browser loopback proof uses real
local Supabase authentication/Realtime, the production handler and full app. It
covers three rounds, perfect 105 completion, Give Up, one visible $1 flight per
viewer, one continuation, Run Back/next-game setup and reload without replaying
the flight. After adding explicit live-watcher/deck-reload assertions, Run Back
passed but the Farkle-continuation scenario failed. Both players completed all
three rounds and SQL recorded one $1 settlement, result and transfer, but both
clients remained on the last 105 score screen for the 75-second handoff timeout.
Neither sent `/close`; neither reported a JavaScript error. The failure is before
terminal close, not evidence of a failed or duplicate financial settlement.
An isolated repeat passed in 1.5 minutes: both clients accepted settled revision
43/event 109, a close request returned 200, and Farkle setup completed. This
establishes intermittence, not a correction of the frozen failure. The successful
test asserted one flight before reloading and zero flights after reloading; the
new diagnostic finally-block initially overwrote its earlier flight capture with
the post-reload empty array. It now stores `lastDocumentFlights` separately.

The exact cause is unresolved. The relevant unchanged boundary is
`useRun21Local` accepting the final SSE snapshot, `ScoreCelebrations` releasing
its presentation hold, and `useRun21Terminal` receiving the settlement. Do not
assume reconnect caused it or patch the shell from correlation. The frozen local
repro is session `7897e425-09fb-48fb-b8ce-d3176a17c337`, dealer-game
`a77fdd6f-c25b-4e06-90a9-7e84bc19b857`; detailed evidence and screenshots are in
`qualification.local/run21-production/fairness-frozen-handoff-failure/`.

Production correction migration, worker deployment, commit/push and Vercel
publication have not occurred. The candidate is uncommitted on
`codex/run21-independent-decks`. Admission remains closed until every
qualification/release check passes. The production recheck at 02:17:04 UTC
confirmed the recovery worker active with a fresh successful completion and the
affected real-money match still paused, unsettled and unchanged at revision 68.
Owner production gameplay smoke remains the final acceptance truth.

## Terminal-handoff investigation — October 15, 2026

Jeremy approved focused investigation using the retained implementation and
failure evidence, with an explicit stop before materially broader server lifecycle
work. No product correction was added during this investigation.

### Trace comparison and limits

The failed run has no receipt-specific `gameplay_transfer_batches` lookup from
either browser and no `/close` request. Its final display is still the 105 scoring
frame. The recorded console has no `game_over` notification on either client;
the successful retry records that transition and a receipt-specific lookup before
its successful close. Both original SSE connections returned HTTP 200; Playwright
did not retain their streamed response bodies. Therefore the trace establishes
the boundary before terminal receipt lookup but cannot distinguish a final SSE
snapshot that never arrived from one not admitted to terminal presentation.

`useRun21Terminal` performs its receipt-specific lookup only when its input view
contains settlement. It then resolves the canonical batch cursor, waits on the
level-triggered `settled`/`reconciled` cursor state, and creates the cached close
Promise. The browser-local cache is scoped to session, dealer-game, result and
transfer-batch identities. Remounting during a pending close reuses that Promise;
effect cleanup cancels that mount's completion callback rather than issuing a
second close. The frozen failure never reached this lookup, so a missed chip
cursor transition or cached close Promise is not established as its cause.
Repeated-snapshot/remount tests for these later stages remain required; static
inspection is not a substitute for those proofs.

The stream handler relies solely on PostgreSQL revision notifications for live
refresh. Its subscription status callback handles initial subscription failure,
but rejecting that already-resolved Promise after a later channel failure does
not close the SSE response. The authority emits local commit notifications, but
the handler does not subscribe to them. These are concrete untested delivery
failure paths; neither is claimed as the proven cause of the frozen run. A
deterministic reproduction must capture final delivered/accepted revision and
presentation receipt state before choosing a transport correction.

### Confirmed zero-client continuation blocker

Fresh deployed definitions match the captured fingerprints:

- `run21_recovery_claim(uuid)`: `ed5180600a1b54baf7eaa29b21a800fa`.
- `run21_recovery_load(uuid,uuid)`: `f9781f1d3c36f30ce459594a62329566`.
- `run21_server_close(uuid,uuid)`: `e57f2fcd24eee243f38c9696c7ac1e54`.

Claim excludes every row with a settlement and requires `games.status` to be
`in_progress`. Settlement changes that status to `game_over` (or `session_ended`).
Load likewise requires `in_progress`; the worker does not call close. The sole
Run21 continuation path is `run21_server_close`, which requires an authorized
human participant and is requested by the browser after presentation. Thus
financial settlement is durable, but postgame continuation still depends on a
browser. Repeated worker wakes cannot repair that state.

The frozen local session was tested in a transaction at 21:29:39 CDT:
revision 43, settled, `game_over`, `finished=false`, one result and one transfer.
Two valid recovery-token claims both excluded it. Match fingerprint
`46f0599f689c56fd428c1bb46dc88c31` remained identical before/after the proof and
after rollback. No match/financial writes were made. Evidence and repeatable
script: `qualification.local/run21-production/terminal-postgame-diagnosis.{json,mjs}`.

Correction to the earlier qualification claim: `--disconnect-final` proves
zero-client **settlement**, then the existing test explicitly calls
`worker.close(game, users[0])`. Its terminal/next-game assertion therefore does
not prove zero-client **continuation**. No new lifecycle pass is claimed.

### Scope extension approved on 2026-10-16

1. Extract the existing Run21 continuation policy into one idempotent private
   server owner keyed to the immutable settled dealer-game/result/batch. Have
   settlement/durable recovery invoke that owner; retain the authorized browser
   close RPC as a replay-safe compatibility entry point to the same owner. Do
   not synthesize a participant identity or depend on a connected browser.
2. Apply the new continuation policy only to newly admitted qualified matches;
   freeze its version at setup. Preserve existing matches, historical financial
   records and the separately paused real-money match at revision 68.
3. Retain each live Run21 viewer's exact final identity/snapshot until that
   viewer's canonical presentation completes, using the existing
   `useLocalTerminalPresentation` pattern already used by Farkle/Yahtzee. The
   current Run21 render branch depends directly on `game.current_game_uuid`,
   which close clears; merely adding worker close could otherwise unmount a
   slower viewer. Fetching a retained result must target its immutable dealer-game,
   not whichever match is latest. Fresh reconnect reconciles completed transfers
   without replaying a flight. Preserve the shared ledger and unrelated games.
4. Finish deterministic delivery/remount/ordering proofs and select only the
   transport correction demonstrated by them. Prove zero-client continuation
   without any manual/browser close, duplicate/concurrent completion, late close
   after a successor, final snapshots/authorization and all requested browser
   presentation cases before the already-authorized release workflow resumes.

Jeremy explicitly approved this Run21-only ownership and presentation extension
on 2026-10-16. Implementation and qualification are recorded below. Admission
remains closed until every release gate passes.

## Bounded continuation

Continue only the intermittent final-score handoff investigation before any
release. The independent-deck pattern does not establish why an unchanged client
transport/presentation boundary missed terminal progression. Retain the failing
session; compare final accepted SSE revision/settlement, held celebration receipt
and terminal admission in the next reproduction. Do not weaken assertions, add
polling/timers, infer causation from reload, or broaden into unrelated game work.
The owned local application, Supabase stack and native PostgreSQL were stopped
after evidence capture; database volumes and artifacts were retained. Production
recovery was never stopped. Repository execution-budget/scope rules require a
focused continuation decision instead of an open-ended additional investigation.

Evidence: `supabase/run21/fairness-containment.evidence.json`; ignored detailed
results under `qualification.local/run21-production/fairness-*` and the two-browser
artifacts under `qualification.local/farkle-full-stack/run21-polish-output/`.
Repeat the SQL proof with `node supabase/tests/run21/financial-authority.proof.mjs
--independent-decks` plus `--real-money`, `--sudden-death`, `--terminal`,
`--disconnect-final` or `--legacy` as appropriate. All synthetic fixtures stay
local; no synthetic production financial transactions are permitted.

## Approved terminal continuation implementation — 2026-10-16

The continuation owner is `private.run21_finish_postgame(dealer_game_id)`.
It verifies the complete immutable receipt, locks the existing round/session/match
in the established order, and executes the existing Run21 continuation policy once.
Settlement, browser close and recovery use this same operation. Existing matches
retain lifecycle version 1; newly admitted matches receive immutable version 2.
The recovery claim includes eligible settled-but-unfinished version-2 matches.
Paused matches remain excluded. No canonical financial routine, chip ledger or
other game's policy is replaced.

The route adapts Run21 to `useLocalTerminalPresentation`, retaining the observed
match, participants and presentation mode after the server advances. State/SSE
reads and close target the retained dealer-game UUID. A late old close cannot
cancel its successor's timer or replace the successor's authority cache. The
canonical ledger remains the single flight owner. Remounts reuse a pending close
Promise; a completed receipt releases presentation without another close.

### Delivery boundary and frozen-trace limits

The frozen failure stopped before receipt-specific batch lookup: neither browser
observed the terminal receipt or requested close. The successful retry received
the terminal revision, resolved its journal cursor and completed both flights.
The original trace lacks SSE bodies; it cannot prove which notification was lost.
It does not establish a missed settled-cursor transition or failed close Promise.

Actual HTTP stream tests reproduce two transport defects: local authority commits
did not wake SSE subscribers, and realtime failure after connection left an open,
silent SSE response. Local commit subscription and stream termination now cover
those paths, including channel loss during the initial read. The existing client
reconnect resumes from its cursor.

An authoritative session advance also triggers one scoped read for the retained
match. That recovers the same missing-terminal-snapshot boundary without polling,
inferring settlement, rotating a dealer or requesting an additional close.

### Qualification progress

Normal two-browser qualification passed three rounds and transitions to Run Back
and Farkle, with one canonical $1 flight per viewer. A separate fault run passed
with one disconnect, four dropped terminal frames and 58 duplicate/reordered
deliveries. Terminal payload capture is repeated before successor reload, because
reload resets the browser recording buffer. Frozen failure artifacts are retained.

Full source regression passed 2,168 tests in 308 files. The additional immutable
terminal identity test and the 241-test harness suite passed separately. Typecheck,
isolated production build, retention, reconnect, stale-snapshot rejection and
remount during a pending close Promise passed.

### Final qualification and installed authority

The complete SQL matrix passed, then passed again using the installed production
function definitions: fake money, real money with cold-process zero-client
recovery, tie/sudden death, Session Ended and historical single-deck completion.
Concurrent browser close and recovery preserve the exact completed session row,
one dealer game, one settlement and one canonical transfer. Fault-injected missed
continuation is repaired by a fresh worker without a browser or manual close.
The timeout race proves one accepted command plus only the expected existing
pause/automatic-play trigger revision; no extra financial movement occurs.

Actual final payload capture retained 83 and 90 SSE frames. The faulted viewer
disconnected once, discarded four terminal frames and received 81 duplicated or
reordered frames. Both scoped catch-up reads succeeded; each viewer completed one
flight and reached ordinary setup. Payloads, screenshots and traces remain under
`qualification.local/farkle-full-stack/run21-lifecycle-terminal-capture-output/`.

Installed migrations: `20261016142441_run21_independent_decks` and
`20261016142505_run21_authoritative_continuation`. Recovery worker version 4 is
deployed. All 26 historical matches retain deck/lifecycle version 1. The protected
production match is still paused, unsettled and unfinished at revision 68.
Security advice has no finding for the newly introduced functions. Existing
unrelated platform advice is outside this correction.

Release tag: `run21-independent-decks-2026-10-16`. Admission remains gated until
the matching live build manifest and production worker health are verified.
No synthetic production financial transactions were used. Jeremy owns the final
production gameplay smoke and the separate historical-match disposition.
