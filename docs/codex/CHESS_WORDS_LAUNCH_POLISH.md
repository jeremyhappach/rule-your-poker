# Chess / Words launch polish — local checkpoint, November 12, 2026

## November 12 production authorization and qualification

**Production receipt:** runtime commit
3c322c6ca144dc8a6fd2567866beed7e42f2c504, Vercel
dpl_HANg4oX22GavvH9jCXVAHRkE4Mtm, READY on holm357.com and
ptown-poker.vercel.app. GitHub release run 43349865136 completed successfully and
published the matching release_publication signal at 2026-11-13 02:17:50 UTC
(November 12, 8:17 PM Central). The guarded activation followed production API
and credentials verification; preview_only=false, real_qualified=true,
enabled/admission_enabled/async_enabled=true and bots_enabled=false. No financial
or gameplay rules changed during activation. Thirteen eligible accounts outside
the preview tester list now qualify for Chess admission.

Production checks passed: exact SHA on both domains; live/Async capabilities;
authenticated native API with settled live/Async snapshots and retained photo
IDs; all nine original Storage hashes; all three public sound videos playing to
completion; fresh ended-session entry returning to the lobby; no page errors.
Active Words games missing a persisted background: live 0, Async 0. Both synthetic
Chess smoke fixtures are finished/terminal. Current evidence:
qualification.local/chess/production.json. Production gallery:
https://holm357.com/chess-preview/. No additional migrations or photo uploads
were required in this release pass. Physical iPhone/PWA owner smoke remains open.

Jeremy approved the revised audio on preview c621de788 and explicitly requested
production release. That instruction supersedes the publication holds recorded
in the historical checkpoints below. Preview deployment
dpl_6bs4ydbmsqdTHeJyzVk5JN3mrgGD is READY and its three hosted sound recordings
match the approved source files byte-for-byte and play through with AAC audio.

Financial gate: **PASS**. The complete installed-authority rollback proof was
rerun on xvhmbuppghwmwpwrkzao immediately before release. It proves both money
modes, win/draw, actual canonical chip/ledger/final snapshots, injected financial
failure, unauthorized calls, invalid stake, duplicate/late terminal requests,
continuation and Async recovery. The earlier independent-connection race proof
remains valid: gameplay/financial authority is unchanged since that qualification.
Actual chess_requests uniqueness is (mode, match_id, request_id); both update
tables remain in supabase_realtime. The recovery cron remains active. No
synthetic rows from the rollback proof remain.

Fresh hosted smoke passed on the approved SHA: native Node API; actual touch
move and opponent realtime slide; both live +3-minute banks and replayed request
IDs; persistent background and no animation replay after reload; legal checkmate
with exact 105/95 canonical chips from 100/100 at stake 5; Async 36-hour unopened
window, continuous 5-minute opened clock, both banks, UI opening/reload behavior,
opponent realtime knight hop and canonical terminal settlement. Fresh entry to
the ended live session returns to the lobby. No browser page errors. The two
synthetic fake-money sessions were settled through normal authority. Evidence:
qualification.local/chess/release-hosted.json and release-hosted*.mjs.
One harness assertion used JavaScript's lexicographic sort for numeric balances;
correcting its comparator confirmed the expected balances without product changes.

Publication fast-forwards main from 698ab0e5d and uses the unmodified approved
push helper. supabase/chess/activate.sql is the guarded, idempotent admission
change applied only after the matching production app is READY. It removes the
tester-only restriction and enables real-money admission qualified by the proof;
live/Async remain enabled and bots remain disabled. Original photos and stable
IDs stay in private arcade-artwork/game-backgrounds. Existing Words assignment
and backfill semantics are unchanged; no additional asset upload is needed.

Rollback: close new Chess admission/Async offers first while leaving enabled=true
and real_qualified=true so existing matches can finish. Do not remove Chess
authority or assigned background objects. Reverting the application to the prior
production checkpoint requires accounting for any newly active Chess games.
Physical iPhone/PWA audio unlock, mute, reduced motion, touch and background-return
smoke remains owner acceptance; desktop/portrait emulation is not that proof.

## Historical checkpoints

This is an incomplete implementation checkpoint, not a release. Jeremy explicitly
requested no deployment/publication and no background-management/admin screen.
No hosted schema, Storage objects, production data, admission or deployment changed.

## Source and scope reconciliation

The initial workspace was the older, dirty `codex/six-card-golf-v1` checkout.
It was preserved. Work is isolated in
`C:/Users/jerem/source/repos/ptown-chess-words-launch-polish`, branch
`codex/chess-words-launch-polish`, based on `codex/chess-preview` at `7fc8fc2c3`
(current main `698ab0e5d` plus the two existing preview commits).

Chess exists only under `dev/chess-preview/`: unauthenticated local SSE/file
persistence, standard promotion and a 36-hour preview deadline. It has no
production game catalog entry, authenticated live/Async authority, durable
recovery or canonical settlement. Read-only hosted inspection found no Chess
tables. Jeremy explicitly chose to include full production Chess integration
in this task, while keeping publication held. That work remains unfinished.

## Confirmed Chess rules

Jeremy supplied these decisions directly in the November 12 chat:

- A pawn reaching the last rank revives one of its owner's captured queens,
  rooks, bishops or knights. Captured pawns and kings are excluded (explicit
  follow-up confirmation). Consume the selected captured piece so it cannot
  be reused. If that owner has none eligible, offer ordinary Q/R/B/N promotion.
  Opponent-owned inventory is never shared.
- Five-minute turns, with two +3-minute banks following the existing Words
  per-player/per-game pattern. Live turns start immediately; Async gameplay
  timing starts when its player opens the turn, then runs continuously.
- Retain the existing Async availability window before opening (36 hours,
  Last Call at 24 hours). Gameplay expiry forfeits this Chess game.
- Use canonical two-player stakes. The winner receives the opponent's stake.
  Draws, including stalemate, cause no transfer and return both stakes.
- Stalemate is immediate draw when the player to move has no legal move and
  is not in check. The proposed three-minute clock is superseded.

## Implemented background phase

The supplied ZIP's `original-backgrounds` directory contains nine standalone
photos and four composited Words screenshots. The four timestamped images
ending `205653`, `205745`, `205905`, `210053` are excluded. All nine actual
photos are preserved byte-for-byte. `photos.json` records original filename,
SHA-256, stable content-versioned ID, Storage path and per-photo crop position.

Original bytes (3,655,916 total) are staged only in ignored
`qualification.local/game-backgrounds/assets/`, not `public`, `src` or `dist`.
`dev/game-backgrounds/prepare-assets.mjs` reconstructs the staged set from the
extracted handoff. Nothing has been uploaded. The client uses the existing
authenticated `arcade-artwork` Storage download pattern and a solid fallback.
Future authorized upload must retain these immutable object names and bytes;
retiring a background must not delete objects used by assigned games.

`GameBackground` is presentation-only. It resolves a persisted ID, fills the
existing game host with one original photo and a dark gradient, and hides the
prior image immediately on identity change. Both live and Async Words use the
same `PtownWordsView`. The shell and board viewport become transparent where
the existing side gutters expose the photo. Board/control geometry is unchanged.

The unapplied `supabase/game-backgrounds/candidate.sql` adds a private active
pool and a trigger on the existing live/Async Words state tables. It assigns
`state.backgroundId` once when playable state is created (Async acceptance),
and preserves it across reducers and pool retirement. No browser randomization
or client persistence is used. Existing projections already retain this field.

`backfill.sql`, intended in the same future migration transaction, assigns only
unassigned active Words games. Revisions increase once, preserving strict snapshot
guards. Async uses parent-before-child locks and its existing parent revision
publisher to notify both viewers. Competing/repeated backfills cannot reassign
or repeat the revision bump. Ended games and already assigned games are excluded.
These files are local candidates, not a registered or installed migration.

## Local evidence

- TypeScript app check and 49 focused component/Words/final-review tests passed.
- Production Vite build passed; no source photos entered the output bundle.
- Disposable local PostgreSQL proof passed candidate/backfill rollback,
  initial creation, both-viewer projection, unchanged gameplay state, concurrent
  and repeated backfills, immutable assignment through whole-state replacement,
  current active pool, retirement and denied browser selection. Both Async
  recipient revision rows advance once. The disposable database was dropped.
- Native Chrome rendered all nine photos in both modes at 393x852, 375x667
  and 320x568 (54 checks). Board, viewport, rack, toolbar and actions retain
  identical geometry with/without backgrounds. Screenshots were inspected.
- Evidence is ignored under `qualification.local/game-backgrounds/`.
  The browser harness uses actual SQL snapshots and local photo transport;
  hosted Storage delivery, physical iPhone/PWA and owner smoke are untested.

## Changed owners / next work

- `src/lib/gameBackgrounds/{catalog.ts,photos.json}`: stable asset manifest.
- `src/components/{GameBackground.tsx,gameBackground.css}`: shared photo layer.
- `src/components/ptownWords/{PtownWordsView.tsx,ptownWords.css}` and
  `src/lib/ptownWords/model.ts`: shared Words wiring and snapshot field.
- `supabase/game-backgrounds/{candidate.sql,backfill.sql}`: held persistence.
- `src/components/GameBackground.test.tsx`, `dev/game-backgrounds/*` and the
  additive SQL execution helpers in `dev/words-gameplay/database.mjs`: proof.

Remaining Chess work: shared versioned house-rule core; authenticated move,
bank and expiry authority; canonical financial and lifecycle integration;
live/Async catalog and route adapters; stable per-game background assignment;
sculpted opaque pieces; touch/mouse/tap board and invalid-drop return; captured
tray and promotion; per-viewer move/capture animation/audio dedupe; full
rollback/concurrency/recovery/financial qualification and portrait browser QA.
Do not treat the preview, this background proof or a successful build as Chess
production qualification. No push, migration installation, asset upload or
publication is authorized by this checkpoint.

The repository's mandatory execution-budget checkpoint ended this pass after
the independent background phase. The accepted-pattern shortcut is insufficient
for Chess: there is no existing authenticated Chess authority or financial
adapter to polish. All requested revival/clock/stake decisions are now recorded;
the next bounded implementation phase is that missing production foundation.


## November 12 continuation — local Chess implementation

Implemented files: api/chess.ts; server/chess/operation.ts; src/lib/chess/*;
src/hooks/useChess.ts and useChessAccess.ts; src/components/chess/*;
src/components/delayed/ChessTurn.tsx; src/components/rules/ChessRules.tsx;
Game/Delayed routes, DealerGameSetup, setup authority, catalog, Async branding,
rules-mode typing and the existing terminal-retention adapter.

Persistence candidate: supabase/chess/{schema.sql,transport.sql,candidate.sql}.
Regenerate with node dev/chess/prepare.mjs. Exact hosted owner definitions and
hash guards are recorded in dev/chess/installed*.json. Apply the held shared
background candidate first, then Chess. No migration was registered or applied
on a hosted project. All Chess admission/real-money flags default to false.
The API uses the established RUN21_SUPABASE_URL/service-role environment pattern.
Browser clients send intents only; service-only load/commit RPCs enforce actor,
identity, expected revision and request fingerprint under canonical row locks.
The existing recovery cron calls Chess recovery for expiry and postgame finish.

Nine original PNGs stay outside public/src/dist in ignored asset staging, intended
for the existing private arcade-artwork Storage bucket under game-backgrounds/.
Stable IDs and crop metadata are in src/lib/gameBackgrounds/photos.json. SQL picks
from the active pool at live creation or Async acceptance. Words active-game
backfill locks the owner rows, assigns only absent IDs, bumps the live revision
or Async child plus parent revision once, and preserves all assigned IDs. Competing
backfills are idempotent. No images were uploaded; the existing solid background
is the fallback until separately authorized installation/upload/publication.
Crusens uses an original-image crop/scale to keep its existing sign above Chess.

Local checks: app TypeScript; 46 focused rules/catalog/background tests; Vite
production build; disposable PostgreSQL proofs in play and real-money modes:
actual legal checkmate, 105/95 canonical chips from 100/100, balanced transfer
batch, immutable result, duplicate/late/terminal request replay, authorization,
postgame continuation, live/Async legal stalemate with zero transfer, banks,
expiry, zero-client recovery and independent-connection same-request/competing-
move races. Real Async additionally proves two balanced SessionResult postings
(total 0, absolute total 14 for stake 7). Synthetic mutations roll back before
isolated concurrency fixtures are committed; the disposable database is dropped.
Chrome checks at 393x852, 375x667 and 320x568 cover square cells/board, touch drag,
tap, rejected drops, capture poof, opponent knight hop, reload/remount dedupe,
revival selection/consumption, reduced motion and all nine photo selections.
Ignored evidence: qualification.local/chess. Hosted transport/Storage, physical
Safari/PWA and owner smoke remain unverified. No revival or timer decision remains.

Earlier 'remaining Chess work' above describes the prior checkpoint and is
superseded by this continuation. The original main worktree was not modified.

## Hosted preview qualification — November 12 continuation

User authorized a hosted preview, SQL installation and original asset upload;
production promotion is still held. Baseline 84f2628b9 was reviewed against main.
All fourteen recorded hosted function hashes matched. Target: ptown-poker-prod
Supabase xvhmbuppghwmwpwrkzao; Vercel ptown-poker / prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds.

Installed migration: 20261113001204_chess_words_launch_preview. Background triggers
and Chess schema install before the active Words backfill; backfilling before the
constraint update caused pending trigger events, so the failed transaction was
rolled back and the ordering corrected. Nine original PNGs (3,655,916 bytes) were
SHA-256 verified and uploaded through the existing Supabase CLI to private
arcade-artwork/game-backgrounds. Full-size photos remain outside the deployment.
Both live and Async active Words counts without background IDs are zero after
installation. Existing assignments remain immutable; backfill uses owner locks,
bumps child/live revisions and Async parent revisions once, and publishes updates.

Financial proof: supabase/chess/financial-proof.sql and dev/chess/hosted-proof.mjs.
The actual hosted candidate and installed authority passed rollback-contained
win/draw cases in both money modes, actual canonical chip/ledger/snapshot checks,
injected failure after chip changes, invalid stake, role/membership rejection,
late/duplicate terminal requests, continuation/closure and Async recovery.
dev/chess/proof.mjs additionally passes legal checkmate/stalemate, clock/banks,
zero-client live recovery and independent-connection duplicate/competing requests
in a disposable database. dev/game-backgrounds/proof.mjs passes concurrency,
immutable assignment, retirement/current pool and both participant projections.

The preview has an explicit private.chess_preview_users admission list. It does
not expose Chess to ordinary production users; preview_only remains true, bots
and real-money admission remain false. Production activation requires a separate
decision. Preview runtime credentials are scoped to this Git branch.

Full npm run build passed: app typecheck, 4,052 application tests, 241 harness
tests, 46 release-tooling tests, Vite and the existing size gate. Gate failures
from the new Chess registry/access hook were corrected without removing checks.
dev/chess/record-video.mjs captures actual ChessView screen frames and actual
platformAudio output into MP4 with H.264/AAC. Small clips and their player page
are public/chess-preview; these are recordings, not separate animation code.
Hosted browser/API, video decoding and physical iPhone/PWA evidence are recorded
in the final preview report; physical owner smoke remains required before release.

### Hosted Node boundary correction

Preview 80808a691 completed all Vercel gates. Opening its generated share link in
a browser establishes the required cookie; a share token is not an automation
bypass header. Both authenticated users downloaded all nine originals with exact
hashes. All three hosted H.264/AAC recordings decoded, played and had nonzero
audio. Downloadable recordings now retain short static holds around each effect.

The first authenticated Chess API request exposed ERR_IMPORT_ATTRIBUTE_MISSING
for configuration.json under Node 24. rules.ts now declares `with {type:'json'}`.
nodeRuntime.test.ts verifies the unbundled module in a real child Node process,
preventing Vite's JSON bundling from masking this failure. This changes no rules,
database or settlement behavior. Hosted live/Async Chess remains unverified until
the corrected preview passes its full gates and authenticated smoke.

### Fifteen-minute extension checkpoint

Correction committed/pushed as cf6d9f62b5567c1313750cdc54a5ffa6bb82f324.
Full local gates pass again: 4,053 application tests, 241 harness tests, 46 release
tooling tests, typecheck, Vite and size gate. Corrected Vercel preview is
ptown-poker-56eihgcwk-jeremy-8e2b.vercel.app, deployment
dpl_26QittfE7jMvgSkSDymzgCc2TBAU; full hosted build was still running at checkpoint.
No main integration or production promotion occurred.

Browser share-link access, exact old preview SHA, all hosted sound-video decoding,
and live/Async Words background rendering and reload passed without page errors.
Both users' authenticated Words projections agree on the background after every
pass through completion. Realtime subscription did not reach SUBSCRIBED in this
environment; neither realtime transport nor opponent animation is claimed as a
hosted pass. Chess HTTP smoke found the import error above and must be repeated
on the corrected deployment. Timer/banks/settlement remain covered by the prior
database and local proofs, not an elapsed-time hosted-browser Chess test.

All six synthetic fake-money fixtures are ended/settled using canonical authority:
Words completed through authenticated passes; live Chess expired under server
recovery; the synthetic unopened Async Chess deadline was advanced for cleanup
and processed by chess_sync. No historical session was changed or deleted.
Evidence: qualification.local/chess/{hosted-words.json,words-sync.json,
release-runtime-fix.log,videos/playback.json}. Hosted smoke script must create
fresh fixtures before reuse because its recorded IDs are now terminal.

### Revised Chess movement and capture effects — November 12

Jeremy rejected the original sounds and clips. The old cues shared a short,
bass-heavy exponentially decaying noise buffer; capture lasted only 160 ms and
effect timers could start sound before the CSS animation painted.

The shared ChessBoard now starts each cue on its own animationstart event and
finishes presentation on animationend. Both live and Async continue to mount
that same board. A 360 ms slide uses sustained filtered friction; the 480 ms
knight hop has a lift cue and a soft wooden landing at 80% of the hop. Capture
uses an 800 ms granular crumble, nine visible piece fragments and 24 dust motes,
then advances the mover. Durations come from lib/chess/presentation.ts. Global
audio preference, once-per-viewer move consumption and audio ledger remain the
owners. Reduced motion/hidden-page transitions settle presentation immediately.
No chess rules, timers, financial behavior, SQL or background storage changed.

The recorder captures actual ChessView screen frames and shared mixer output.
Its recording-only zero-valued source keeps silent holds on the audio timeline;
without it Chrome could omit gaps in encoded AAC. No effect audio is substituted.
dev/chess/verify-video.mjs decodes the final MP4s, checks encoded onset against
the animation timestamps, checks the full audio duration, and extracts real
video frames and PCM for review. It serves byte ranges for correct MP4 seeking.

Final local release gates pass: app typecheck, 4,062 application tests, 241
harness tests, 46 release-tooling tests, Vite and the unchanged 90 MB size gate.

Validation: nine new presentation/waveform tests cover both modes, capture event
bubbling, no pre-animation audio, rerender/remount suppression and reduced motion.
Chrome 157 exercises native gesture unlock (no autoplay bypass), mute, unmute,
fresh audio after unmute and no replay of suppressed moves. Three portrait sizes
retain touch drag, invalid return, capture, opponent knight and revival behavior.
Encoded clips show slide travel, knight lift and fragmented dissolve; each has
an H.264 video track and AAC audio track with continuous silent holds.

The agent cannot perceive audio input in this environment. Signal levels,
onset/duration and frames were inspected, but this is not a subjective listening
pass. Jeremy's audition and physical iPhone/PWA speaker/unlock/background-return
checks remain required. Hosted realtime and full Chess integration checks listed
above remain outstanding; this effects correction does not claim those passes.

## iPhone / Async follow-up

Requested after production iPhone smoke. Slide gain is now 45% of its approved
level; PCM, timing, knight and crumble remain unchanged. Each Async visit admits
one server turn after an ownership inspection and returns to Match Home when
that turn ends, after the frozen own-move animation completes. Rendering and auto-open both reject later turns, including a
reconnect that skips directly to another own turn. Non-owner entry returns home;
Chess no longer offers the old live View board link. Live subscription is unchanged.

Color-coded name pills sit immediately above the unchanged square board. The
Async header aligns back/title/speaker/History; the dotted clock has explicit
flex space and both bank labels are +3m. No SQL, timer rules, settlement or
background persistence changes. Nine new focused regression cases pass, along
with the existing motion/audio cases. Chrome portrait checks retain board widths
372.21875 / 354.21875 / 299.21875 at 393 / 375 / 320 pixels, verify header centering,
non-overlapping controls, name proximity and visible 24-dot timer. Updated real
recordings pass encoded timing, mute, unmute and reduced-motion checks.
Final recovery review adds an entry-revision floor: old pending receipts stay
unpresented while their canonical recovery read finishes. Focused regression
coverage includes that race. Final full local build passes: 4,071 app tests, 241 harness tests, release tooling,
typecheck, Vite and bundle size. Hosted preview f540d8a1623e8537c5313cc39e4977f1657a75a6 is READY:
https://ptown-poker-49t1cnbfo-jeremy-8e2b.vercel.app
Deployment dpl_ByBxoQMfusJ8d6ve8ER9y7gBPnuL passed its full build gates.
Two independent Chrome mobile contexts passed: live opponent slide; Async own
animation then lobby return for both sides; non-owner entry rejection; unopened
availability between turns; server rejection of the previous actor; five-minute
clock and both +3m banks; deadline/background persistence; each viewer's own
color/name pill on the left; next-turn opponent knight presentation once; and
an old saved receipt deliberately delivered ahead of fresh reads without leaving
the admitted turn. All three hosted recordings played to completion unmuted.
No browser page errors. Both fresh play-money fixtures ended through normal
commands, with no cleanup error. No historical match was edited.
Evidence: qualification.local/chess/async-handoff-hosted.json and screenshots.
Live fixture: 2b5679d5-be29-4c90-8da6-8a8ff1a23e16 / session
9d7cceb9-9299-4f8d-902d-e4d9a46ece8e. Async fixture:
cf3108f9-f1d1-44fc-ad28-57f5cf164362 / parent
b3d3ceac-544b-4d94-a238-ce4d5016445f.
A Run21 five-second timeout occurred once in the final local suite; that test
and the entire unchanged build then passed. Final local totals: 4,071 app tests,
241 harness tests, 46 release-tooling tests, typecheck, Vite and size gate.
Production manifest still identifies 3c322c6ca144dc8a6fd2567866beed7e42f2c504.
Physical iPhone/PWA two-device handoff, safe areas, touch and speaker-volume
acceptance remain unverified. No production promotion occurred.

## Crisp sound / move-first capture revision

Jeremy requested a crisper twip, a quieter three-part knight cue, and then
explicitly corrected capture order to movement first, crumble after arrival.
The short 160 ms swept twip replaces sustained friction while retaining the
quiet slide gain and animation-start synchronization. Knight peak drops from
0.14 to 0.06; a rounded lift tone, small mid-hop twip and low wooden landing
occupy separate intervals. Capture now leaves the target visible during travel,
starts fragmentation/dust and its sound on actual arrival, and completes Async
submission presentation only when the crumble ends. Reduced motion/hidden-page
fallbacks still settle instantly; existing dedupe and mute ownership are retained.
No clocks, rules, persistence, database or geometry changes.

Actual screen/Web Audio recordings pass encoded timing and separation checks:
slide peak 0.0458, knight peak 0.0588, capture peak 0.1733. Slide has 10 audible
10 ms windows; knight has 17, with distinct lift/slide/landing. Capture recording
proves move then crumble and a quiet interval between their sounds. Native
Chrome mute, unmute, replay suppression and reduced motion pass. Listening
acceptance remains Jeremy's; the agent cannot perceive the recorded audio.
Hosted preview 34e313c1c5bbb140f5c926208e2a0e30d636bbf1 is READY:
https://ptown-poker-bxwqnl63n-jeremy-8e2b.vercel.app/chess-preview/
Deployment dpl_HyWyzDrywf24Apkktb8UjEiRkUuz passed the unchanged full Vercel
build/release gates. All three hosted MP4 hashes match the implemented screen/
Web Audio recordings; all play to completion unmuted in mobile Chrome with
nonzero AAC audio and matching audio/video duration. No browser page errors.
Evidence: qualification.local/chess/crisp-hosted.json and crisp-gallery.png.
Local focused Chess checks pass (21); portrait/browser checks pass at 393, 375
and 320 px without changing board size. Local full builds twice hit unrelated
five-second test timeouts (Words inspection, Run21 and Take Two across runs);
the final two timed-out files pass individually (15 tests). A further reduced-
worker rerun was stopped during typecheck to stay within the execution budget,
so no clean full local build is claimed. No timeout or gate was weakened; the
exact candidate passed the complete hosted build. Listening and physical
iPhone/PWA acceptance remain Jeremy's. Production manifest still identifies
3c322c6ca144dc8a6fd2567866beed7e42f2c504; no production promotion occurred.

# Chess subtle slide / preview synchronization — November 12, 2026 — candidate

Jeremy rejected the pitched twip and loud crumble. Restore the original
friction-based slide character with a gentle low-pass and a full-travel envelope
instead of the short swept tone; retain the quiet 45% slide mix. Reduce crumble
peak from 0.18 to 0.065 (about -9 dB). Knight cue and move-then-crumble sequencing
are unchanged, as are gameplay, geometry, mute, reduced motion and viewer dedupe.

Investigation found a second failure in the preview recorder: queued CDP image
decodes delayed visible video by roughly a second while audio remained live.
The earlier event-timing proof did not establish encoded picture/audio sync.
Acknowledge screen frames immediately and discard arriving frames while a prior
frame is decoding, avoiding a stale-frame queue. The revised video verifier
compares decoded pixel changes in each mover's source square with encoded audio
onset (within 80 ms), in addition to the actual animation/source event checks.
All three new recordings pass; actual AAC peaks are slide 0.0436, knight 0.0591,
capture 0.0600. Capture still moves before crumbling. Native gesture unlock,
mute/unmute, reduced motion and no replay pass. Focused tests: 21 passed.
Full local release build passes: typecheck, 4,074 app tests, 241 harness tests,
46 release-tooling tests, Vite and the 90 MB size gate. This run limits local
worker concurrency to four, without changing any tests or timeout thresholds.
Hosted preview ed9c327ca0de98b7f94bfe097baadc996aa521c2 is READY:
https://ptown-poker-dzlk6u2s6-jeremy-8e2b.vercel.app/chess-preview/
Deployment dpl_DqCYdnQthuZsUp4pGV3KMtoevokK completed the unchanged build gates.
All three hosted MP4 files match the newly verified recordings byte-for-byte
and play through unmuted, with nonzero AAC audio and no browser page errors.
Evidence: qualification.local/chess/subtle-hosted.json, subtle-gallery.png and
videos/playback.json. Encoded audible/visible onset differences are -47 ms for
slide, +49 ms for capture movement, and +27 ms for knight. This supersedes the
prior recorder's event-only synchronization claim. Runtime cue timing still
comes from actual animation events; no artificial delay was added to gameplay.
Production remains 3c322c6ca144dc8a6fd2567866beed7e42f2c504. Listening acceptance
and physical iPhone/PWA verification remain Jeremy's; no production promotion.

# Chess corrections — November 12, 2026 — production live

Jeremy approved the subtle-slide studio and explicitly requested production.
Release the tested runtime from ed9c327ca, including the prior Async/portrait
corrections on this branch, through a clean main fast-forward and the unmodified
main push helper. All runtime files match the qualified preview; subsequent
commits only record verification and this authorization. Full local qualification
passed: 4,074 app tests, 241 harness tests, 46 release-tooling tests, typecheck,
Vite and size gate. No schema, rule, settlement, admission or asset-ID changes.
Production is live at 3cab749a08d63fa3e6a25bc71fd10ed0900a2328, deployment
dpl_2awBX3CVze52yM46C6Dv49QftBEx (READY). Both https://holm357.com and
https://ptown-poker.vercel.app serve the exact SHA. GitHub release run
43367207408 passed qualification, production verification and release-signal
publication. The approved preview runtime is unchanged; only documentation
differs from ed9c327ca. The release checkpoint tag is
chess-corrections-production-20261112.

Production smoke passed: live/Async capabilities in the existing qualified money
modes; authenticated reads of settled live/Async fixtures with persisted
background IDs; all three sound MP4s matching approved bytes and playing through
unmuted at the revised levels; ended live entry returning to lobby; zero browser
page errors. Evidence: qualification.local/chess/corrections-production.json
and corrections-production-gallery.png. No schema, background assets, gameplay
rules, admission, settlement or historical match data changed. Prior two-session
preview handoff/bank/recovery proofs remain applicable; this production pass did
not create or replay games. Jeremy approved the sound studio. Physical iPhone/PWA
audio unlock/mute, two-device Async handoff and portrait smoke remain owner checks.

# Chess ghost drag / reused capture sound — November 13, 2026 — preview candidate

Requested as a final polish pass, with an interactive preview before release.
The original piece now stays filled at home and pulses during a drag; an outline
follows the finger. Legal release removes the outline and pulse while the source
stays solid awaiting the canonical snapshot, then the normal source-to-target
animation runs. Illegal drops clear the preview without moving the source and
reuse the TriTowers triInvalid asset through the platform mixer.

Capture retains move-then-dissolve ordering and uses run21BustCueAt with the
actual run21-bust-b.wav recording. The dissolve lasts the established Run21
1,100 ms failure window so its full 1,020 ms recording completes before Async
handoff. No generated capture noise remains. Slide and knight PCM hashes are
identical to the approved production versions. Shared mute, visibility, reduced
motion and once-per-viewer presentation ownership remain unchanged.

A standalone /chess-preview/try.html entry offers Moves, Capture, Reset and Mute
using the actual ChessBoard and shared reducer/audio. Vite emits it only for
preview deployments; production builds retain the single application entry.
The fixture creates no match, financial state or game commands. Its sound toggle
is local to this isolated preview. Production rules, Async admission, clocks,
banks, layout and persistence are unchanged.

Focused checks: 39 passed. Native Chrome touch ghost/source continuity, invalid
drop recording, legal move, capture sequencing/full Run21 recording, mute,
reduced motion, desktop mouse and tap play all passed without page errors.
Full npm run build passed unchanged: typecheck, 4,078 app tests, 241 harness
checks, 46 release-tooling tests, Vite and the 90 MB deployment-size gate.
Portrait regression passed at 393x852, 375x667 and 320x568, including unchanged
square board geometry, opponent move/reconnect presentation and revival.
Production build exclusion and correct main build-manifest entry were checked.
Hosted preview verified November 13, 2026:
- Commit c1a3966502934e9c7d1fd48a16dcfa9aa871b9c2; checkpoint chess-ghost-drag-preview-20261113.
- Deployment dpl_7BbCRVHYyUmW3i4fbos3Jbu6JWZh, READY, preview target; full hosted npm run build completed in 11 minutes.
- Interactive preview: https://ptown-poker-em9hx77x3-jeremy-8e2b.vercel.app/chess-preview/try.html?_vercel_share=C92mcd7HkrmXychal4FszzEjxVANI7wO
- Hosted build manifest matched the exact commit and retained assets/app-DcI_5Y0y.js as the main entry.
- All six real Chrome interaction checks passed: touch ghost/source continuity and invalid-drop TriTowers recording; legal touch move; move-then-capture with complete Run21 recording scheduled within 20 ms of dissolve onset; mute/no replay; reduced-motion instant/silent fallback; mouse drag and tap play. Zero page errors.
- Local complete gates: typecheck, 4,078 app tests, 241 harness checks, 46 release-tooling tests, Vite, 89,883,525-byte output below the unchanged 90 MB gate. Three portrait sizes and opponent/reconnect presentation tests passed.
- Evidence: qualification.local/chess/ghost-build.log, interaction-hosted.log, interaction-browser.json, interaction-drag.png and ghost-portrait.log.
- No new authenticated multiplayer/Async matches or settlement proofs were run in this presentation-only pass. Existing authoritative rule/Async/financial paths are unchanged; opponent and Async presentation regression tests passed. Physical iPhone/PWA audio unlock, drag feel and device playback remain Jeremy's acceptance checks.
- Production remains at 3cab749a08d63fa3e6a25bc71fd10ed0900a2328 (HTTP manifest checked); no main integration or production promotion was performed.


The candidate provides the playable preview. New video exports failed the strict
encoded picture/audio onset gate and were not published; existing production
MP4 files are unchanged. No recording gate was relaxed.

Changed files for this preview:
- src/components/chess/ChessBoard.tsx and chess.css: source pulse, outline drag, release/rejection behavior.
- src/lib/chess/sound.ts and presentation.ts: shared TriTowers/Run21 cues and capture duration; slide/hop PCM preserved.
- src/components/chess/ChessBoard.presentation.test.tsx, src/lib/chess/sound.test.ts and presentation.test.ts: drag/source, cue reuse, mute/reduced-motion and capture timing regressions.
- chess-preview/try.html, dev/chess/interaction.tsx and interaction.css: isolated playable preview.
- vite.config.ts: preview-only entry and correct application manifest ownership.
- dev/chess/preview.tsx and verify-video.mjs: approved sound preload and exact Run21 asset expectations; strict recording sync gate retained.
- docs/codex/CURRENT_RELEASE.md, CHESS_WORDS_LAUNCH_POLISH.md and STABLE_CHECKPOINTS.md: candidate and verification receipts.

# Chess ghost drag / Run21 capture — November 13, 2026 — production authorized

Jeremy approved both changes in the verified c1a396650 preview and explicitly
requested production. Release the approved runtime through a clean main
fast-forward and the unchanged push-origin-main.cmd helper. The production
build excludes the interactive fixture; application runtime remains the approved
board/source-pulse/ghost and shared TriTowers/Run21 audio implementation.
No schema, gameplay rule, Async admission, clock/bank, settlement, background or
layout changes are included. Production qualification/publication is in progress.

# Chess ghost drag / Run21 capture — November 13, 2026 — production live

Jeremy approved both changes in the hosted c1a396650 preview. Production now
serves 049a47c2108ca4a40ab352682c81717e92c7db93 on https://holm357.com and
https://ptown-poker.vercel.app. Vercel deployment dpl_3vPPLGmssJRyFDSB7c3GSxvgRigS
is READY with target production. Checkpoint: chess-ghost-drag-production-20261113.
The clean branch was fast-forwarded into main and pushed through the unchanged
.codex/scripts/push-origin-main.cmd helper.

Production-mode local qualification passed: typecheck, 4,078 app tests, 241
harness tests, 46 release-tooling tests, Vite and the unchanged 90 MB size gate
(89,879,070 bytes). The production output excludes /chess-preview/try.html.
Vercel independently completed the full build gate. No source changes followed
the approved preview; only release documentation changed.

Production smoke passed: both domain manifests match the exact SHA and serve
the ghost-drag runtime; source-pulse/outline CSS is present; Run21 bust and
TriTowers invalid WAVs match the existing source bytes; both authenticated test
accounts retain live/Async capabilities; settled live/Async snapshots preserve
background IDs; ended live entry returns to lobby. Zero browser page errors
and no error/fatal logs in the deployment-scoped runtime scan. Evidence:
qualification.local/chess/ghost-production-build.log, ghost-production.json,
ghost-production-smoke.log and ghost-production-smoke.png.

GitHub release run 43457509531 initially passed qualification but exhausted its
unchanged 10-minute production wait while Vercel was still building. The connector
could not rerun Actions (integration write permission); the signed-in GitHub UI
started attempt 2 after production became READY. Attempt 2 passed qualification, exact production verification and release-signal publication.
No gate, timeout or release logic was weakened.

The approved presentation changes preserve rules, Async admission/handoff, clocks,
banks, settlement, layout and background persistence. No schema migrations,
historical-game mutations or new active financial fixtures were performed.
This pass verifies production delivery and read-only runtime health; physical
iPhone/PWA gesture/audio behavior remains Jeremy's production smoke check.

# Chess Async return hold — November 13, 2026 — hosted preview ready

Jeremy requested a preview before production, then a more translucent overlay.
Preview runtime: 3c39a01c690bde07687f5666b831bf2fd9cc4d67.
Checkpoint: chess-async-return-translucent-preview-20261113.
Vercel: dpl_DszyJQWAkZ9Ez47UxDEbjpXuAHqk, READY, target preview.
URL: https://ptown-poker-8zxwro0jx-jeremy-8e2b.vercel.app/chess-preview/try.html

Root cause: SubmittedChessTurn immediately navigated on move presentation
completion. That callback now begins a five-second presentation-only hold with
"Returning to lobby" centered on the board. Its 55%-opaque fill has no backdrop
blur, keeping pieces recognizable beneath it. The accepted own-move snapshot
remains frozen against opponent updates; the monotonic deadline cannot extend
on duplicate callbacks or rerenders, and unmount cancels navigation. Reduced
motion retains the same static hold after instant presentation. Illegal moves,
stale/recovered entry, non-move terminal snapshots and live multiplayer preserve
their existing behavior. No rules, clocks, banks, settlement, schema, audio or
board geometry changed.

The preview uses the actual ChessBoard and shared hold hook, with Moves/Capture/
Reset and an explicitly nonfinancial preview lobby; it creates no match or stake.
Hosted Chrome at 393 x 852 verified the exact build manifest, 55% opacity without
blur, completed animation before the hold, centered overlay, unchanged 373 px
square board, reset, and zero page errors. Hold durations: slide 5,016 ms;
capture 5,009 ms; reduced motion 5,008 ms. Evidence:
qualification.local/chess/lobby-hold-hosted.log, lobby-hold-browser.json and
lobby-hold-preview.png. Focused checks: 21 passed. Existing six native gesture/
audio checks passed locally. Full local npm run build passed unchanged:
typecheck, 4,080 app tests, 241 harness tests, 46 release-tooling tests, Vite and
the 90 MB size gate. The subsequent CSS-only revision passed Vite/size again
(89,885,523 bytes); Vercel independently completed its full build and is READY.

This smoke covers the actual presentation in the preview fixture, not a newly
created authenticated two-player Async game or physical iPhone/PWA. Existing
ChessTurn tests cover frozen snapshots and fast opponent updates during the hold.
Production remains 049a47c2108ca4a40ab352682c81717e92c7db93. No main integration
or production promotion; Jeremy must approve this preview before release.

# Chess Async entry pacing — November 13, 2026 — hosted preview ready

Jeremy approved the five-second return overlay, then requested a matching Async
entry sequence: "Opponent's Move..." for three seconds, fade out completely,
play the opponent's move, then "Your Turn" for two seconds.

The existing ChessBoard presentation owner now gates an unseen opponent move
only when ActiveChessTurn opts in. It commits the pre-move position before paint,
retains the per-viewer/game/ply receipt, and starts movement from the actual fade
animation-end event. The normal movement/capture completion event begins the
two-second Your Turn hold. Input stays blocked through these stages. It reuses
the approved 55%-opaque card without blur. Live multiplayer, own-move animation,
clock/open/bank rules, authority, settlement and background/layout are unchanged.
Reduced motion keeps static three-/two-second messages and settles silently;
hidden/unmount paths cancel pending stages without delayed audio or replay.
The approved five-second return behavior remains included.

The nonfinancial preview adds Opponent move and Opponent capture controls using
actual rules, ChessBoard, audio and fade events. Focused tests: 25 passed,
including stage timing/order, source-position hold, input lock, capture finish,
rerender/remount dedupe, reduced motion, visibility and cleanup. Full npm run
build passed: typecheck, 4,084 app tests, 241 harness tests, 46 release-tooling
checks, Vite and the unchanged 90 MB size gate. Native Chrome confirmed actual
fade completion before movement, sound at animation start, capture breakup before
Your Turn, three-/two-second holds, silent mute/reduced motion and subsequent
five-second return. All six existing touch/mouse/tap/audio regression checks also
passed. No schema change or new authenticated financial fixture.

Hosted preview is READY at commit 4dce00274713ba8d9fe04dd79f1738769be5d985,
checkpoint chess-async-entry-preview-20261113, deployment
dpl_Ee7eUYa5V2awkfsYuxsBjEzmypmn (preview target).
URL: https://ptown-poker-8hz8rzqvz-jeremy-8e2b.vercel.app/chess-preview/try.html
Vercel independently completed its unchanged full build. Hosted Chrome verified
the exact manifest and native fade-end before move-start. Slide: 3,002 ms lead-in
and 1,999 ms Your Turn; capture: 3,002 / 1,999 ms. Move audio was the existing
360 ms cue, followed on capture by the actual 1,020 ms Run21 bust. Mute and
reduced motion were silent; the board stayed 373 px square at 393 x 852, with
zero page errors and the subsequent five-second return intact. Evidence:
qualification.local/chess/entry-hosted.log, entry-browser.json,
entry-opponent.png and entry-your-turn.png. Static output: 89,887,127 bytes.
The new entry sequence is preview-only, pending Jeremy's visual acceptance.
This is actual presentation-fixture verification; no new two-player financial
match or physical iPhone/PWA smoke was performed.

# Chess Async return hold — November 13, 2026 — production live

Jeremy approved the lighter five-second return overlay. Main was fast-forwarded
and pushed with the unchanged .codex/scripts/push-origin-main.cmd helper.
Production SHA: b125e88f54cce044f0023f07e361a3afb5be7f6b.
Checkpoint: chess-async-return-production-20261113.
Vercel dpl_Ht4EnHLUw52aYStFexPkBoWWUGvm is READY with target production.
Both https://holm357.com and https://ptown-poker.vercel.app serve this exact
runtime, including Returning to lobby and the 55%-opaque fill. The new opponent
entry announcement is excluded from production and remains on the preview branch.
GitHub release run 43471122180 passed qualification, exact production verification
and release-signal publication; no gates were weakened or bypassed.

Production smoke confirmed unchanged Run21 bust/TriTowers invalid asset bytes,
live/Async capabilities for both existing test accounts, background IDs in the
existing settled live/Async snapshots, and ended live entry returning to lobby.
Zero browser page errors; no gameplay or financial mutations. Evidence:
qualification.local/chess/lobby-hold-production-smoke.log and
lobby-hold-production.json. The approved preview already proved the actual
five-second presentation and reduced-motion behavior; physical iPhone/PWA
acceptance in an active Async match remains Jeremy's smoke check.

# Chess Async opponent entry sequence — November 13, 2026 — production live

Jeremy approved the hosted 4dce00274713ba8d9fe04dd79f1738769be5d985 preview and
requested production. Main was fast-forwarded to
c82b3e2a5d9c59c2429dbcfd8b3032b3e4c5e0bd and pushed using the unchanged
.codex/scripts/push-origin-main.cmd helper. Application code is identical to the
approved preview; only release documentation differs.
Checkpoint: chess-async-entry-production-20261113.
Vercel deployment dpl_EVYMmbuVTEduss9nkyM9rFoKnWxr is READY, target production.
Both https://holm357.com and https://ptown-poker.vercel.app serve the exact SHA.

Async entry now shows Opponent's Move... for three seconds, waits for the
actual fade completion, presents the opponent move/capture with existing audio,
then shows Your Turn for two seconds before enabling board moves. The approved
five-second Returning to lobby hold remains. Rules, server authority, clocks,
banks, settlement, live multiplayer, board geometry and background behavior are
unchanged. No schema changes or gameplay/financial data mutations.

The approved candidate passed typecheck, 4,084 app tests, 241 harness tests,
46 release-tooling checks, Vite and the unchanged 90 MB size gate, plus focused
and native-browser timing/audio/reduced-motion/gesture checks. Vercel independently
completed its full production build. GitHub release run 43481210313 passed
qualification, exact production verification and release-signal publication.
No gates or timeouts were weakened or bypassed.

Production smoke passed: both manifests and bundles contain the approved entry
and return sequence; shared translucent/fade and drag styles are served; Run21
bust and TriTowers invalid assets match the unchanged source bytes; both existing
test accounts retain live/Async capabilities; existing settled live/Async API
snapshots retain background IDs; ended live entry returns to lobby. Zero browser
page errors. Evidence: qualification.local/chess/entry-production-smoke.log and
entry-production.json in the Chess polish worktree. No new active financial
match was created. Jeremy's remaining acceptance is the next Async turn on a
physical iPhone/PWA, including the announcement, move, Your Turn and return hold.

# Chess captured trays and local Undo — November 13, 2026 — local preview only

Jeremy requested both changes in an isolated preview and explicitly held all
production deployment until review/approval. Work is on local branch
codex/chess-trays-undo-preview. No branch/main push or deployment was performed.
Both production domains were read-only verified at
c82b3e2a5d9c59c2429dbcfd8b3032b3e4c5e0bd.

Local interactive preview: http://127.0.0.1:15441/chess-preview/try.html
Screenshot gallery: http://127.0.0.1:15441/qualification.local/chess/undo-review.html
The Vite process is left running for review. These URLs work on this computer.
The fixture is nonfinancial and uses the actual ChessBoard, ChessPlayers, draft
hook, shared rules and approved sounds. Captured inventories are generated by
legal reducer moves, not fabricated lists. Safety controls exercise disconnect,
revision refresh, another device's accepted move, leaving, and opposite viewer.

ChessPlayers owns the existing player pills and one tray affordance beside each.
The own badge shows captured opponent-colored pieces; the opponent badge shows
the viewer's lost pieces. Inventory remains indexed by victim color in the
existing authoritative captured state. UUIDs own identity; names are labels.
Trays have explicit captor labels, correct piece colors, counts, empty states,
close controls and Escape support. The old combined lower-board tray is removed;
the separate revival/promotion chooser retains the existing house rule.

useChessMoveDraft holds a legal move locally for three seconds with a landed
outline, small blinking Undo and countdown. The source and captured target stay
in the authoritative position/inventory. Undo removes only the local draft.
No request UUID, session-storage receipt or authority call exists before expiry.
Expiry claims the draft once and calls the existing authority with its original
revision. useChess.act rejects a mismatching current revision before creating a
request; this also closes the update-before-React-render race. Accepted moves
use the unchanged animation/audio owner and existing UUID/reconnect recovery.
Undo is never available after submission and cannot roll back accepted state.

Drafts cancel on identity/turn/FEN/revision changes, loss of action eligibility,
disconnection, offline/hidden/pagehide, or unmount. Reconnect/remount does not
revive them. Revision changes from banks conservatively cancel a draft. Existing
clocks continue normally. Promotion/revival starts its window after choosing a
piece; Undo does not consume that captured inventory. No schema, rule, financial,
background, audio-mix or existing Async entry/return behavior was changed.

Qualification: 41 focused checks; full npm run build passed with typecheck,
4,100 app tests, 241 harness tests, 46 release-tooling tests, Vite and the unchanged
90 MB size gate (89,894,185 bytes). Native Chrome phone (393 x 852, touch) and
desktop (1280 x 900, mouse) proofs passed: owned/color-correct trays, unchanged
square size, drag/tap Undo, no send/sound during the window, one send on expiry,
synchronized slide/capture, safe cancellation paths, reduced motion and zero
page errors. The pre-render revision race and reversible revival inventory have
direct focused coverage. This was local fixture/hook verification, not a new
live financial match or physical iPhone/PWA test.

Evidence in the Chess polish worktree: qualification.local/chess/undo-tests.log,
undo-final-build.log, undo-browser.log/json, undo-review.html and six screenshots:
undo-{phone,desktop}-{my-tray,opponent-tray,undo}.png. The gallery loads all six.
Review is required before any production integration or deployment.
