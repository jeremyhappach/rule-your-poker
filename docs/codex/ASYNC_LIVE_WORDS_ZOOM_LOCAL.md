# Async presence, Words scales and result presentation — local review

2026-10-30. Owner authorized local implementation and interactive preview of
per-child playing presence/live cards and three shared Words scales, then added
Quintzee final bonus labels and hiding the bell inside async routes. Publication
remains explicitly held for visual review. No push, deployment, hosted migration,
customer repair, new credentials or money-mode expansion occurred.

## Preview

### Isolated initial pulse check (supersedes shared-demo pulse instructions)

Open **http://127.0.0.1:15407/pulse**. Run
`node dev/async-combined/pulse-preview.mjs` if this separate server is stopped.
One visible page contains Alex's actual active Words board and Blair's waiting
match card. No submission and no second window are needed. Scroll down to the
right-hand child card if needed. It shows Playing now with the existing three-second
amber glow. Reduced-motion preferences intentionally make it static; the page
explains that state. Reload or Restart views restores both viewers.

The October 30 failure is now explained by read-only evidence: the old shared
15403 fixture retained revision 11, actor `b` (Blair), after Alex placed CAT on
turn 10. It was not terminal (`finished:false`). Opening Blair's home does not
reset the scenario, so Take Turn was correct for that retained handoff. There
is no provenance proving who issued that move. No old preview state was reset.

The new server has one immutable child with actor `a`; it rejects turn-changing
commands. It has separate state, port and Vite cache from the handoff demo.
The actual presence hook and CSS run over local SSE. Immutable game subscriptions
need no SSE connections, avoiding the HTTP/1 per-origin connection limit with
both viewers in frames. The demo does not change motion rules or the old demo files.

PASS: explicit viewer identities and active/waiting permissions; initial real
presence with no action; nine rendered-color samples across a complete three-second
animation; rejected mutation; three reloads and another opening without retained
handoff; reduced-motion static behavior. Evidence: `pulse-original-state.json`,
`isolated-pulse.json`, `isolated-pulse-visible.png`. This is synthetic HTTP/SSE
qualification only, not authenticated hosted private Realtime. Publication held.

### Gameplay-start boundary correction

Owner clarified that presence starts with active gameplay, never submission.
Words already follows this: active/connected playable board, current actor,
finished/paused guards and completion of prior-move presentation. Its existing
36-hour turn deadline starts at acceptance/handoff; opening the board does not
start a new timer. Presence adds foreground activity to that already-running turn.
No new Words Start action or clock was introduced.

The shared round adapter needed a local correction. The former generic
`playing/ready` check admitted Quintzee's pre-Start presentation placeholder and
excluded Run21 because its board has no phase. `roundGameplayRunning` now reads
only the authoritative board: Run21 requires a started clock and `now >= startedAt`
(after its configured intro), no result and an unexpired deadline; Tri-Towers,
Quintzee and Box Drop require `phase: playing`, no result and an unexpired gameplay
deadline. Pre-Start/null, intro, ready and completed boards never publish. Existing
actor/segment, held, error, Cards tab and availability-expiry guards remain.
ReviewGate keeps the gameplay owner unmounted during opponent-result review.
No timer, automatic Start policy, rule, privacy policy or authority changed.

The presence topic still uses the immutable 36-hour availability window for
identity/authorization, not as evidence that gameplay started. The actual board
clock controls publication. Background/leave/offline stops the hook; abrupt
transport loss retains the existing bounded presence lease behavior.

Focused regression: 98 tests pass across presence, actual async adapters,
Tri-Towers completion and saved-result review. Cases include Quintzee pre-Start
and intro, Run21's exact start time before placement, and Words before submission
then authoritative handoff. A separate handoff server on 15409 validates the
two-client pulse and subsequent Take Turn without touching the owner's 15403 or
immutable 15407 demo. See `pulse-boundary-tests.log`, `pulse-boundary-typecheck.log`
and `isolated-handoff.json` for final results.

### General interaction/handoff preview

Run `node dev/async-combined/live-preview.mjs` from this checkout. The running
loopback preview is **http://127.0.0.1:15403/** on JeremyLaptop.

- Root opens the playable Words board directly. Exact full/medium/closest URLs
  are `/delayed/match/play/words?viewer=a&zoom=0&fresh=1` (use zoom 1 or 2).
- Open Alex's fresh board first, then `/delayed/match?viewer=b` in a **separate
  browser window**. Keep both visible side by side. Only the first child pulses.
  Backgrounding Alex's board intentionally stops presence. At closest scale,
  choose C and place on PT; choose A and place immediately right; choose T and
  Submit Word. Blair's first card changes to Your turn without refresh; the
  opponent score stays masked. Fresh links reset this shared synthetic match.
- Quintzee offers upper-only, fill-only, both and neither, for own results and
  opponent replay. Reload to repeat the scripted final count-up.
- `/scenarios` holds secondary checks. `/scenarios/bell?viewer=b` is explicitly
  a notification test screen, with a bounded 52×44 bell, not the product lobby.

The actual game views, canonical shells, delayed routes and notification provider
run with synthetic HTTP/SSE transport. The preview accepts fixture Words commands;
it is **not a rules, database settlement or hosted Realtime proof**. No production
account, session, credential or financial state is connected. The `/start` links
reset only this process's fixture match.

October 30 preview follow-up: laptop/phone entry, all three exact links and
single/double tap checks pass with screenshots inspected. Headed Edge confirms
two-window pulse on the exact child and submission/handoff without refresh.
The automated browser kept background tabs visible, so the hidden/visible hook
check explicitly simulates `document.hidden`; native tab occlusion is not proven.
The earlier owner's failed pulse check has no confirmed historical cause. The
server is reachable now; the previous same-window tab instructions were unsuitable
for a visible-board-only signal and are corrected. Evidence:
`owner-preview-entry.json`, `owner-pulse.json`, `owner-words-*.png` and
`owner-pulse-{visible,handoff}.png`. Only preview files/documentation changed;
product code and publication hold are unchanged.

## Ownership and behavior

`playingPresence.ts` owns ephemeral presence. Its private topic binds the permitted
match UUID, child UUID, current actor UUID and exact authoritative availability
deadline. The server policy authorizes both participants to read and only the
current actor to track. Unrelated users cannot subscribe or publish. No payload
identity or alias becomes authorization. The topic changes on handoff, including
returns to the same player; held, expired, removed and terminal matches are denied.

WordsTurn and DelayedTurn publish only on their visible playable board, outside
result/review presentation. Hiding, leaving, going offline or finishing retires the
channel. Per-connection presence keys preserve another active tab/device. Changed
heartbeat IDs renew a 35-second local lease; repeated snapshots do not. A ten-second
check bounds stale display to at most approximately 45 seconds on an active client.
Background clients clear immediately and reconnect/refetch on return. This is a
presence heartbeat, not gameplay polling. Reduced motion retains static accessible
“Playing now” text. Presence never writes gameplay, deadlines, scores or finances.

`Delayed.tsx` still loads permitted projections after `delayed_match_updates`,
reconnect, foreground and online events. Cards never infer handoff from presence.
List/child request generations now reject late replies; the existing home revision
guard remains. Completion updates cards in place, with no automatic navigation.
Existing unseen-score and private-rack projection owners remain unchanged.

Shared `PtownWordsView` now has full/medium/close states. Medium is halfway between
the container-fitted tile and the existing 48px closest tile. Full fit is capped at
the closest scale so it cannot become larger than close on a roomy desktop. When
the whole board already fits at 48px, additional zoom need not enlarge it.
At 390px the inspected cells measured approximately 24/36/48px.

Owner's October 30 refinement supersedes navigation-first input. Each board click
classifies its intent before changing selection: an active selected tile or a
movable staged tile takes the immediate tile-action path at every scale and never
enters zoom handling. Only navigation taps with no selected tile use the deferred
gate: single tap advances one scale, double tap retreats one scale. Rapid tile
select/place/move gestures cannot become double-tap zoom. Rack/HUD actions do not
zoom; draft/selection/dialog changes retire pending navigation. Keyboard activation
remains immediate. Touch drag cancels a pending tap;
the actual cell geometry owns hit testing, and resize preserves the visible center.
Directional third-tile placement, blanks, undo, recall, draft recovery and opponent
reveal camera restoration are retained. Only an accepted own word automatically
returns to full. No extra zoom buttons or second board were introduced.

The presence animation now targets the entire `.delayed-turn-status` containing
Playing now. Its background, border color and soft shadow cycle over three seconds;
text, padding, border width and geometry remain stable. Reduced motion keeps the
whole container statically tinted. Publication timing, identity, privacy, expiry
and gameplay clocks are unchanged. The isolated `/pulse` browser proof measures
changing container colors and border, stable bounds and unanimated text, then
verifies the reduced-motion state.

Owner palette refinement: opponent pulse uses the established amber base
`#443c1f` / border `#b59a44`, brightening to `#62532a` / `#d7b75a` with an amber
shadow. The Playing now label is pale amber. Reduced motion uses the original
opponent colors. My Turn remains unchanged green (`#163c2c`, border `#4baf77`).
The refreshed 15407/pulse check passes a full animated cycle with amber-only
background/border samples, stable bounds, unchanged green My Turn comparison,
and minimum sampled text contrast 5.51:1. Screenshots were inspected; evidence
is `isolated-pulse.json`, `isolated-pulse-visible.png` and
`pulse-own-green-comparison.png`. This is a local CSS-only product correction;
no presence logic, timers, authority, Words input or publication changed.

Refinement validation: 123 focused tests pass, including the shared view in both
sync/async modes at all three scales. Application `tsc --noEmit` passes. Actual
Chromium mouse/touch checks cover phone/desktop placement, staged selection/move,
rapid taps, deselection, directional autoplace, undo/recall, drag suppression,
navigation/pan and accepted-word reset. The same source runs at the existing
15403 Words URLs and 15407/pulse; browser handoff commands were isolated on 15409.
Evidence: `tile-precedence-tests.log`, `tile-precedence-typecheck.log`,
`tile-precedence-browser.json`, `isolated-pulse.json` (colors/border/bounds) and
`owner-preview-entry.json`. One browser attempt timed out during concurrent local
validation; the unchanged serial rerun passed. No hosted Realtime or physical-device
acceptance is claimed; no publication or customer mutation occurred.

Owner's early-resolution refinement supersedes final-count-only label timing.
`QuintzeeBonuses` derives independent pending/achieved/failed states from permitted
committed category scores. Upper achieves at the configured threshold, or fails
when all six upper categories are committed below it. No mathematical early-failure
heuristic is used. Fill All fails on the first recorded zero and achieves only when
all twelve scores are positive. Missing categories remain unfilled, not zero.
Terminal timeout/no-matches results close otherwise unresolved objectives.

Achieved designations are bold green and their configured bonus helper is green.
Failed designations are red and struck through; their helper is omitted. Pending
styles remain unchanged. A positive filled card with configured zero bonus still
shows achievement with +0. The shared view applies this during own Arcade,
synchronous and async play, plus authorized revealed opponent results/replays.
Live opponent bonus resolution is withheld until a result is revealed. No new data
is fetched, inferred from dice/potentials, or exposed from unrevealed score records.

These are pure render calculations. No eligibility, scoring, celebration/audio,
clock, manual Start/roll, review admission, result hold or bonus accumulation changed.
Existing score-presentation tests retain replay/reentry deduplication. React review
confirmed no new effect, state owner, event handler or fetch in the label component.

Row/pace refinement: `x/63` stays on the UPPER BONUS label row, right-aligned in
its column in every objective state. Content-sized bonus columns prevent phone
overlap. A white signed pace value occupies the row beneath the counter while
Upper Bonus is pending or achieved; it disappears on definitive failure and stays
hidden in unrevealed opponent views. The component directly reuses
`getUpperBonusProgress(scores).pace` from `src/lib/yahtzeeScoring.ts`, including
Yahtzee's positive-plus/negative/zero formatting. Its `isAchievable` flag is not
used: Quintzee retains the approved all-upper-committed failure boundary.
Only committed, permitted scores feed the helper. Configured thresholds/amounts,
Classic/modern styles and score/celebration owners are unchanged.

Focused pace/bonus/score-presentation/Yahtzee regression passes 59 tests and
application typecheck passes. All 27 browser scenarios pass, including a 320px
phone check. Geometry checks in `quintzee-early-browser.mjs` assert label/counter row alignment, right
edges, non-overlap, white pace beneath the counter and failure omission through
mid-game states, reloads and final own/replay states. Current evidence uses
`quintzee-pace-tests.log`, `quintzee-pace-typecheck.log` and the existing
`quintzee-early-browser.json`/screenshots. Same direct preview URLs remain active;
Words/pulse and production state were not changed.

Direct mid-game fixtures at `http://127.0.0.1:15403/quintzee`:
`?mid=pending`, `?mid=upper_achieved`, `?mid=upper_failed`, `?mid=fill_failed`.
These freeze committed-score examples and do not send gameplay commands. Append
`&theme=classic` to inspect the Classic presentation. Existing final URLs remain:
`?bonus=upper|fill|both|neither`, with optional `&replay=1`. These finish after
1.5 seconds and enter the established count-up; labels now resolve as soon as
committed facts establish them. No Words/pulse state was reset.

Affected regression: 133 tests / 9 files pass, including score/celebration lifecycle,
explicit Start, review, zero confirmation and exact early bonus cases. All 26
phone/desktop browser scenarios pass: four mid-game states and reloads, Classic
achieved/helper styling, and all four retained final own/replay combinations.
Screenshots were inspected and application typecheck passes. Evidence:
`quintzee-early-tests.log`, `quintzee-early-typecheck.log`,
`quintzee-early-browser.json`, `quintzee-mid-{phone,desktop}-*.png`.
These are local synthetic render fixtures, not new hosted or production qualification.

`NotificationBellContent` returns null on `/delayed` and its child routes. The
provider, unread state, invitations and realtime subscriptions continue. Main
lobby, Arcade and synchronous tables retain their existing bell behavior.

## Security dependency and release hold

Read-only hosted inspection found no policies on `realtime.messages` and confirmed
the current private match/child/removal schema. The candidate
`supabase/delayed/playing-presence.candidate.sql` adds a narrowly scoped private
authorization helper plus Presence-only SELECT/INSERT policies. It does not grant
general access to private tables, Broadcast or arbitrary topics. Realtime caches
authorization for a channel connection; the topic's immutable actor/window binding
and current authoritative card eligibility prevent an old connection from indicating
play on a new turn. See [Supabase authorization documentation](https://supabase.com/docs/guides/realtime/authorization).

This is a **new scoped permission dependency**, prepared for review only. It is not
a registered or installed hosted migration. No new credentials are required. Before
publication, owner review must cover the visual candidate and this policy change;
the approved release phase must register/install it and verify the real authenticated
Realtime service with two accounts, unauthorized reads/tracks, reconnects and cached
old topics. No public-channel fallback is allowed. Client publication alone is not
qualification of secure presence. Existing production release remains unchanged.

## Validation and limits

- **PASS:** 3,296 source/server tests across 465 files; focused subset 99 cases.
- **PASS:** application TypeScript check and one production build using process-local
  loopback fixture settings; no environment files changed.
- **PASS:** eight rollback-contained local SQL/RLS checks: actor/participant/outsider/
  anonymous authorization, exact scope, actual SELECT/INSERT policy execution,
  handoff, child terminal, parent removal, settled parent and expiry. The older local
  fixture's global incident was closed within the rollback transaction, and its
  missing removal/Realtime policy tables were modeled there. All changes rolled back.
  This proves the candidate SQL predicates/RLS, not the hosted Realtime protocol.
- **PASS:** 17 real-view browser scenarios covering two-client presence/handoff,
  multi-device departure, masked score, three scales, double tap, placement/undo,
  pan/resize, desktop, reduced motion and eight Quintzee own/replay combinations.
- **PASS:** additional actual Chromium touch drag, 200% text/resize, and provider/
  bell route refresh checks. Screenshots were inspected; an initial preview-only
  Quintzee wrapper-height defect was corrected and the browser set rerun.
- **PASS:** full compiled App, no module aliases: phone/desktop cold and warm main
  bell → async list → lobby, direct entry and refresh; four round-game routes through
  saved review, handoff, playable board and reload, with no async bell flash. Explicit
  Quintzee Start remains one command and no automatic roll is sent.
- **NOT RUN:** real hosted private Realtime, production publication, customer gameplay,
  physical-device/Safari acceptance or new financial settlement proofs. Financial
  functions, synchronous rules, parent-only settlement, negative balances, 36-hour
  turns and 24-hour Last Call are unchanged.

Evidence is under ignored `qualification.local/async-combined/`: `live-aggregate.log`,
`live-focused.log`, `live-cards.log`, `live-build.log`, `playing-presence-proof.json`,
`live-browser.json`, `gesture-extra.json`, `bell-app-browser.json`,
`bell-games-browser.json`, `words-{full,medium,close}.png`, `words-large-text.png`
and `quintzee-*.png`. Owner visual approval and subsequent hosted qualification are
pending; local tests do not establish production acceptance.
