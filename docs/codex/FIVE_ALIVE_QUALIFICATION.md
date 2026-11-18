# Five Alive local qualification — November 12, 2026

## November 17 production approval resumed — production Async gate passed

Jeremy confirmed the existing preview approval and explicitly authorized resolving the Async gate and pushing this candidate to production. This supersedes the preview hold below; no further preview approval is required. The current candidate retains the passing 4,603-test/full-build qualification and 89,688,520-byte output. No product code changed after those checks. The fresh production fake-money Async smoke passed with the corrected, traced runner and approved test accounts on deployed commit `11aef9610cb373ae216780d6028b1427cdc9e0c2`. Match `8a89f74f-4643-43b9-9e46-98dd6f7c167e`, child `9a64cc86-0471-42fc-a403-0e658927a9f7`, finished 1,568–490. The first viewer received the review live, pending review survived reload, both ACKs and terminal returns passed, earlier strategy stayed sealed/redacted, and 24 submissions passed exact per-tile timing/feedback. Both score count-ups preserved the five-second hold. Database readback verified one settlement, one result, one balanced fake-money transfer (+1/−1), two matching snapshots, session_ended, and zero real-money postings. The historical failed match remains untouched. Evidence: `qualification.local/five-alive/async-gate/{production-smoke.json,review-delivery-trace.json,settlement-readback.json}`. The Async blocker is closed; candidate publication and post-deployment smoke are next.

## November 17 traced Async smoke correction — isolated pass; preview hold remains

**Outcome:** reproduced a smoke-runner dismissal failure using the deployed Five Alive modules from `11aef9610cb373ae216780d6028b1427cdc9e0c2`, the actual App entry/router and production WebSocket transport, against isolated project `tyuxxkalhqbqkbvvkcfx`. An immediate Escape did not close Word Results. The old production runner assumed dismissal and continued waiting for an opponent review that the still-open scorecard intentionally deferred. No gameplay correction is justified by this evidence.

The trace separates all three boundaries: the first viewer received `postgres_changes` revision 8 on both the match and Five Alive channels; `/api/delayed` returned HTTP 200, child/review revision 8 and an unseen word-review receipt; the viewer was visible and online, with `dialog: open` and no active reveal/award. Replaying that observed open-panel condition against the deployed code deferred the review. Clicking its real Close button released “Opponent completed in 3” without a reload or new game action. This establishes the reproduced failure mechanism; the original frozen production run lacks a retrospective trace and has not been changed or re-smoked.

**Correction:** `closeWordResults(page)` in `dev/five-alive/presentation/acceptance.mjs` clicks the accessible Close control scoped to Word Results and waits until that panel is hidden. Both assumed Escape dismissals in the preserved production smoke runner now use this helper. Existing opponent-review, privacy, timing and score assertions remain strict; no timeout was increased. The helper is also exercised by the hosted proof. A new Session regression proves that an already-delivered review stays queued while Word Results is open, releases on confirmed closure and restores after remount. Existing review presentation and privacy owners are unchanged.

**Hosted verification:** `dev/five-alive/hosted-review.proof.mjs --full-app --round=2` passed on the current candidate with the corrected runner. It used fresh Edge contexts, actual `src/main.tsx`/App routing, real disposable Auth sessions, real PostgREST review begin/ACK, real Realtime and unchanged Five Alive API handlers through the isolated bridge. Both participants received 20 recorded revision events; the first viewer presented the opponent result, its pending review survived reload, both viewers acknowledged, both next-word keyboards became usable, and authoritative displayed totals matched **548–784**. No browser errors or forbidden/production requests occurred. The isolated email-verification reminder was dismissed with Continue playing; no email was sent.

Evidence under `qualification.local/five-alive/hosted/`:
- `review-trace-escape-failure.json`: deployed-code Escape left Word Results open; strict dismissal check timed out after 35 seconds.
- `review-trace-confirmed-modal-cause.json`: delivered revision/receipt, open-panel hold, then immediate release on Close.
- `review-trace-round-2.json`, `review-trace-candidate-fixed-runner.log`: corrected full-App hosted pass, pending reload and both ACKs.
- `review-trace-summary.json`: compact cause and verification evidence.
- `review-trace-cleanup.json`: canonical removal of both disposable fake-money matches; zero settlements, results and transfer batches; accounts disabled; admission/recovery flags closed; health restored; zero open incidents.

The two disposable matches were `5ff41366-5446-475d-a134-455923fa5e7d` and `992ef792-82f0-4199-8aaa-bd9478cb1bb5`. Setup admitted only these fixtures inside isolated transactions and restored admission flags before commit. The temporary bridge was restricted to those children, the two test users and the two Five Alive service RPCs; it was restored to its original HTTP 410 implementation (version 7, JWT verification retained), then read back to verify closure. Both local hosted servers were stopped and local broker configuration restored. No production project was queried or changed in this pass. Completed financial/race/vocabulary qualification was not repeated.

Validation: the focused Session file passes all 14 tests, including the added regression. Final standard `npm run build` passed with exit 0: full TypeScript, **4,316 app tests / 588 files, 241 harness tests / 12 files, 46 release-tooling tests (4,603 total)**, Vite and the unchanged **90,000,000-byte** size gate. Output is **89,688,520 bytes / 185 files**, leaving **311,480 bytes** of headroom. Evidence: `qualification.local/five-alive/polish/async-review-release-checks-verified.log` and `async-review-build-size.json`.

The initial check caught an unsupported Testing Library `exact` option in the new test; anchored accessible-name expressions corrected it without weakening the assertion. The next full run stopped on the unchanged Farkle defaults test (`DefaultsAndRules.test.tsx:99`, missing `Default stake` label). Its 17 tests then passed unchanged in isolation; one unchanged full rerun passed all standard gates above. The failed run and focused rerun remain in `async-review-release-checks-final.log` and `async-review-farkle-check.log`. No unrelated test or product logic was modified to obtain that pass.

Final diff/status review preserved the pre-existing polish changes and unrelated Cribbage snapshot. `git diff --check` passes after removing one extra EOF blank line from the smoke helper. The local preview server was restarted; a fresh isolated browser verified the exact localhost URL, rendered sound/animation/game controls and zero page errors.

**Release remains held for Jeremy's preview approval and a future authorized production smoke using the corrected runner.** The isolated reproduction/correction is verified; production acceptance is not claimed. Existing sound, animation and responsive-layout preview remains http://127.0.0.1:5196/dev/five-alive/presentation/polish.html. Prior source changes, lossless size remediation and unrelated Cribbage changes are preserved. No commit or push was made. Vocabulary remains 1,021 qualified answers; growth by 8,979 remains post-launch work.

## November 17 bounded blocker pass — size fixed; Async unresolved; preview hold restored

**Current authorization:** Jeremy explicitly restored preview review before publication. Do not push, deploy, activate gameplay, or change production settings. This supersedes the direct-production approval recorded below. Work remains uncommitted on `codex/five-alive` at `a324799c0e91179e5e690ffbd4499b950814d1a0`; production remains at `11aef9610cb373ae216780d6028b1427cdc9e0c2`. The unrelated Cribbage snapshot working-tree change is preserved.

### Static-size gate — passed

Recompressed only `public/icons/ptown-poker-v2-512.png` and `public/icons/ptown-poker-v2-maskable-512.png` using the existing `scripts/storage/png-lossless.mjs` encoder. Each file shrank from 491,436 to 332,945 bytes: **316,982 bytes saved**. Both remain 512 × 512, with byte-identical decoded RGBA pixels, transparency and metadata preserved. Decoded-pixel SHA-256: `00c05e407ac2e3c790a04306a7b601dc484edcffb601251b8722812d0ffb2f4e`. No artwork, recording, game rule, dependency, or size threshold changed.

`npm run build` completed with **exit 0** after these asset changes: full TypeScript; **4,315 app tests / 588 files**, **241 harness tests / 12 files**, **46 release-tooling tests**; Vite compilation; and the unchanged size gate. Total: **4,602 passing tests**. Static output is **89,688,520 bytes / 185 files**, leaving **311,480 bytes** below the 90,000,000-byte ceiling. Evidence: `qualification.local/five-alive/polish/{size-remediation.json,release-checks-size-remediation.log,build-size-remediated.json}`. The final measurement command was `node scripts/build-size-report.mjs dist --max-bytes 90000000 --json qualification.local/five-alive/polish/build-size-remediated.json` (exit 0).

### Async first-viewer gate — still open, no speculative runtime patch

Inspected the frozen failure, actual Session/review ownership, API projection, deployed review wrapper and notification catalog. Production access in this pass was **catalog-only**: the parent revision trigger writes both participant notification rows; `delayed_match_updates` is in `supabase_realtime`, authenticated SELECT is granted, and policies require the row's viewer identity plus enabled-account access. No production application rows or game/financial functions were queried or invoked; the frozen match and receipts remain untouched.

Added `dev/five-alive/presentation/async-waiting-proof.mjs`, a fresh-browser local replay using the real components and shared rules. It repeats the recorded first word EXIST (tier 2): first player STARE / AMPLE / CHEST / EXIST; second player PLANT / PLANT / EXIST. It checks retained four-row waiting history, Word Results followed by Escape, sealed opponent strategy, first-viewer “Opponent completed in 3”, masked prior turns, pending review through reload and reconnect, review ACK, next word, and **343–490** scores. **Passed**, including the instrumented repeat; no page errors or external requests. Evidence: `qualification.local/five-alive/polish/{async-waiting-evidence.json,async-waiting-proof.log,async-first-viewer-review.png}`. This is a local presentation replay and **does not establish hosted delivery or resolve the production failure**.

Exact unresolved evidence remains the production runner's 35-second timeout at `results/production-smoke.mjs:116` after child revision 8 / segment 2. Both review identities were saved; second viewer ACK succeeded; first viewer remained unseen. The old run did not retain the first viewer's WebSocket subscription/delivery, state-response admission, or visibility at that point. The recorded sequence does not fail locally, so a correction has not yet been justified.

Added smoke-only `dev/five-alive/presentation/review-trace.mjs` to record sanitized channel events, API revisions/review receipts and visibility/dialog/reveal phases (no tokens, headers or guess words). It is exercised by the local replay. The preserved, ignored production runner now imports it and will save `review-delivery-trace.json` before closing its contexts on a future explicitly permitted run; syntax check passed, **runner not executed against production**. No permanent product instrumentation was added. Existing isolated Auth credentials were checked without changing account access or release flags; this was not a rerun of completed Auth qualification.

### Preview and next resume point

Existing sounds, left-to-right reveals, retained history, five-second awards and responsive layouts are unchanged by this blocker pass. Interactive preview: http://127.0.0.1:5196/dev/five-alive/presentation/polish.html — Enable sounds, then use Invalid word, Wrong guess, Solve 1–6 and the layout selector. Restart with `node dev/five-alive/presentation/polish-server.mjs`. Existing screenshots: `qualification.local/five-alive/polish/{narrow,phone,tablet,laptop}.png`.

**First open technical gate:** obtain an instrumented hosted first-viewer reproduction separating subscription/delivery, returned state and presentation admission, then implement only the proven correction and repeat the relevant smoke. Keep the frozen production reproduction untouched during qualification. The size gate is complete; do not repeat completed unrelated qualification. Preview approval is also pending. No commit, push, deployment, schema migration, production mutation or flag activation occurred. Release readiness and production acceptance are **not claimed**. Runtime vocabulary remains 1,021 qualified answers; 8,979 qualified additions remain post-launch growth.

## November 17 approved placement and flip sounds — release blocked by static-size gate

Jeremy authorized production publication after adding the approved Ptown Words placement sound and shared card-flip sound. This supersedes the preview-approval hold below; no additional audition approval is needed. It does not waive release checks.

Implemented in FiveAliveBoard: committed editable letters use the existing approved peg-wood.wav cue through presentSound, exactly as PtownWordsView does. Backspace, ignored input, restored history and unrelated rerenders are silent. Each tile uses flip-soft.wav once, keyed by reveal receipt/row/column, at the feedback-opening animation edge. A native test caught the last placement cue masking the first close-edge flip because peg has higher shared mixer priority. Using the existing opening edge lets its 120ms tail finish before the 220ms close half ends; no timing, sound samples, shared mixer policy or other game was changed.

Final qualification:
- Native browser PCM proof PASSED: six accepted placement sources (five letters plus one corrected letter), five correctly ordered flip sources, fingerprints matching the approved 32kHz WAV samples. Zero sample sources under mute or reload; STARE/AMPLE history retained; no page errors or external requests. Evidence: qualification.local/five-alive/polish/placement-flip-evidence.json. Reproducible runner: node dev/five-alive/presentation/placement-flip-proof.mjs (self-contained disposable server on 5198, closed afterward).
- Final npm run build: full TypeScript passed; 4,315 application tests / 588 files passed; 241 harness tests / 12 files passed; 46 release-tooling tests passed; Vite compilation passed. Overall command exited 1 at report:build-size.
- Exact blocking gate: 90,005,502 uncompressed static bytes / 185 files versus the unchanged 90,000,000-byte maximum — 5,502 bytes over. The command reports “Static build size budget exceeded or invalid.” Log: qualification.local/five-alive/polish/release-checks-final.log. Structured measurement: qualification.local/five-alive/polish/final-build-size.json (measurement command also exited 1). The preceding run measured 90,005,504 bytes; the final opening-edge candidate above is authoritative.
- Existing recordings are reused; no new audio asset files were added. There is no dedicated Five Alive raster asset in public or src/assets to compress. Broader asset optimization and changing the budget were not silently included.

Release STOPPED before commit/integration/push/deployment. Production flags, schema, rows, balances and the frozen Async reproduction remain untouched. The previously recorded first-viewer Async smoke gate also remains open; no production smoke or readiness claim is made for this candidate. The local preview at http://127.0.0.1:5196/dev/five-alive/presentation/polish.html includes the two sounds (Enable sounds, then type and submit a guess).

First open gate: recover at least 5,502 bytes of production build headroom without changing approved visuals/behavior or lowering the limit, then rerun the changed gates. Preserve the passed evidence above and the unrelated Cribbage snapshot formatting. The prior Async delivery/admission failure still needs its bounded investigation before complete production acceptance. Vocabulary remains 1,021; 8,979 is post-launch growth.


## November 17 local responsiveness and feedback polish — preview hold superseded above

This pass is LOCAL ONLY. Jeremy explicitly requires review of these new previews before any flags, push, deployment or production changes. No production state, schema, balances, vocabulary, shared audio engine or unrelated game rules were changed. No release commit was created. Preserve the existing unrelated Cribbage snapshot working-tree change.

Implemented in the actual Five Alive presentation components:

- Container-relative layout with square tiles, helper anchored to the actual tile group, bounded keyboard width, 44px-high keys and existing safe-area spacing. Invalid-word guidance sits above the grid so correction does not separate the keyboard from the tiles.
- All five actual feedback flips complete left to right before the old authoritative base-score helper bursts (420ms). Its original Five Alive sound starts at that completion edge. The next authoritative helper drops in (420ms) with a separate bink, then input unlocks. A sixth miss bursts without inventing a seventh row. Reconnect restores committed rows without replaying the transient helper sequence.
- Invalid-word rejection shakes the editable draft and plays a distinct soft cue without advancing. Covers Arcade's actual translated error and Async's raw error code; stale rejection feedback is not applied to a newer revision. Presentation transients clear across recovery/identity changes.
- Original synthesized Five Alive cues for explosion, bink, invalid word, solves 1–6 and score counting. First solve is a full fanfare, second substantial, later solves lighter, sixth a descending relieved glide. All playback uses the existing platformAudio owner, preference, receipts and mute/disconnect behavior; no other game's sound assets are used.
- Solve animation and sound begin after the last tile reveal. The committed five-second calculation hold remains unchanged. Five Alive wakes its registered audio timeline at the existing score deadline; it does not advance gameplay. Both own and paired score presentations use the new original counting cue.

Preview (local server bound to 127.0.0.1, port 5196):

http://127.0.0.1:5196/dev/five-alive/presentation/polish.html

Run again with: node dev/five-alive/presentation/polish-server.mjs

The harness starts muted. Select Enable sounds, then Invalid word, Wrong guess or Solve 1–6 to play the real session component and matching cue. Separate listening buttons audition every cue. Scenario buttons bring the game into view; Reset board, Refresh and Reconnect are available. The layout selector provides narrow 320×568, phone 390×844, tablet 768×1024 and laptop 1366×768 game containers. The reported attachment was not present in the chat attachment inventory; these explicit dimensions are the reproducible reference, not a claim of matching an unseen screenshot's dimensions.

Focused evidence:

- bunx vitest run src/components/fiveAlive src/lib/audio/audioManager.test.ts: 68/68 tests, seven files, passed. Includes exact flip/helper ordering, immutable own history, invalid correction in both modes, sixth miss, score hold/reduced motion, sealed review and mute/dedupe for every new cue.
- bun run typecheck: full intended TypeScript project passed (exit 0). The default bunx tsgo --noEmit command was unavailable (registry 404); no replacement tool/dependency was installed.
- node dev/five-alive/presentation/proof.mjs http://127.0.0.1:5197: passed real CSS flip order, persistent rows through reload/reconnect, correct award timing, private Async owner history, waiting Word Results, mutual result disclosure and reduced motion. This is a disposable local presentation fixture, not a repeat of hosted Auth/Realtime/financial qualification.
- node dev/five-alive/presentation/polish-proof.mjs: PASSED, exit 0 (2026-11-17 22:43 UTC); see the final evidence.json in qualification.local/five-alive/polish. Measured first score changes on guesses 1–6 at 5010.1 / 5012.5 / 5011.2 / 5012.6 / 5013.9 / 5012.1ms after the calculation appeared. Zero oscillator starts for muted wrong/helper/success/count sequences; no page errors or external requests. Captures real native oscillator starts, animation edges, four responsive screenshots, all six score holds, invalid correction, helper order, muted playback and reduced motion. No external requests are allowed by the runner.
- Responsive geometry: square tiles approximately 40.61 / 55.61 / 77.34 / 69.05px respectively; all key heights 44px; grid-to-keyboard gap 5.59px; no horizontal overflow or clipping in the tested containers. Bottom spacing remains at least 8px and the prior local proof also covers 24px shell safe-area padding.

Artifacts: qualification.local/five-alive/polish/{narrow,phone,tablet,laptop,helper-burst}.png and evidence.json; existing preservation proof at qualification.local/five-alive/presentation/proof.json. These local evidence files are intentionally ignored, not production assets. The native-audio observer tracks the current context created by unmute, including one born running, rather than an already-retired context.

Release remains withheld for review of this polish pass. The earlier deployed first-viewer Async smoke failure below is still unresolved and its frozen match is untouched. This local presentation proof does not claim that production delivery/admission issue is fixed. After preview approval, complete the standard release checks and resolve that recorded gate before claiming production acceptance. Vocabulary remains 1,021 qualified answers; growth toward roughly 10,000 remains post-launch work.


## November 17 actual release outcome — deployed; Async smoke acceptance failed

Jeremy approved all five previews. Released product commit
11aef9610cb373ae216780d6028b1427cdc9e0c2, tag five-alive-word-results-20261117,
was fast-forwarded to main and pushed with the unchanged approved helper.
Vercel dpl_9gHNE4KAAyowXLaxrYzqQKREi4fg is READY / production. Both
https://ptown-poker.vercel.app and https://holm357.com serve that exact SHA.
Release-signal run 44172407670, job 134354715440, attempt 1 succeeded; the
publication receipt independently matches SHA, deployment ID 44172407670-1
and 2026-11-17T20:55:53.121Z. No retry or second deployment was needed.

The additive production migration 20261117204258 is installed and catalog-verified
(wrapper MD5 84a22fb01af273c0de7846bcb494669f; original owner unchanged at
39b3f82999c239579a017d6c923c19e5; wrapper execute only postgres/service_role).
Existing flags, vocabulary, unrelated games and production financial authority
were preserved. Local qualification remains passed: TypeScript, 4,297 app /
241 harness / 46 release-tooling tests, Vite and 89,999,447 / 90,000,000 bytes.

**Production smoke: FAILED, exit 1. Do not claim complete acceptance.**
Fresh isolated Edge contexts checked page.url(), location.href, exact production
manifest and production Supabase origin before authenticating both approved
test accounts. Personal Chrome was not used.

Passed production evidence:
- Arcade run 45a8e73f-7280-41bb-a1f8-835602de0c80 completed at 1,911 and
  returned to the leaderboard. Database readback: one matching immutable result,
  zero sessions, transfer batches and financial postings for that run.
- 16 submitted guesses across Arcade and partial Async passed actual sequential
  CSS reveal/feedback checks. Own rows survived row advancement, reload and reconnect.
- All four keyboard colors matched; phone gap 5.59375 px, key height 40 px,
  minimum width 34.53125 px. The production history screenshot was inspected.
- Five own solved-word awards retained their calculation at least 5,712.2 ms;
  earliest score movement 5,011.5 ms, earliest flight 5,009.9 ms.
- The first finisher opened Word Results while waiting; own history restored
  and opponent answer/strategy remained sealed before mutual completion.

Exact failing gate:
- Fake-money match f12f83a8-13b1-4ac9-9a2d-28109b634967, child
  2def676a-f8c6-4067-a341-1bdbbfc81285. The first viewer did not display
  "Opponent completed in 3" within 35 seconds after the second player solved
  the first word. Failure: production-smoke.mjs:116:90 (the initial live-presentation
  wait, before the intended pending-review reload).
- Readback: parent active / revision 9 / real_money=false; child revision 8,
  segment 2, current word index 1, shared scores 343–490, not terminal.
- Both immutable round-1 review receipts exist. Event f21a7d5c-8f44-407d-b87f-c6eb9c1fd950
  (first player actor) was acknowledged by the second player at
  2026-11-17T20:58:25.585171Z. Event c9f0ca8e-53a1-4ed2-9b34-e8bf8c2a6a7c
  (second player actor) remains unseen by the first player. No additional
  gameplay, review ACK, cancellation, cleanup or historical mutation was performed
  after the failure. The unfinished match has zero settlements, game results,
  transfer batches and financial postings.
- Browser page errors were empty, and the deployment-scoped error/fatal runtime
  log scan since 20:56 UTC was empty. The runner did not capture first-viewer
  visibility/subscription state at failure; delivery, snapshot admission and
  visibility remain possible boundaries, not established causes.

**First open gate:** investigate this first-finisher presentation using the frozen
match and targeted visibility, Realtime and state-response evidence. Preserve the
repro until the exact boundary is known; do not patch from a theory. Then complete
the interrupted pending-review reload, paired-score timing, sixth-miss replay and
full Async settlement smoke. The live deployment and release signal succeeded;
the overall smoke did not. No further publication or rollback was performed.

Evidence: qualification.local/five-alive/results/{publication-run.json,
publication-success.json,production-manifests.json,deployment-ready.json,
production-migration-catalog.json,production-smoke.json,production-smoke.log,
async-smoke-failure-state.json,partial-smoke-readback.json,runtime-errors.json}.
The unrelated Cribbage snapshot formatting remains unstaged. Runtime bank remains
1,021 qualified answers; 8,979 remains post-launch growth.


## November 17 approved previews — production release in progress

Jeremy approved all five previews for production. This supersedes the preview
hold below. Product code is unchanged from the final passing qualification:
TypeScript, 4,297 app / 241 harness / 46 release-tooling tests, Vite and
89,999,447 / 90,000,000 bytes. The preview-only controls also passed all five
native browser scenarios. The unrelated Cribbage snapshot formatting is excluded.

Production project xvhmbuppghwmwpwrkzao was independently verified as
ptown-poker-prod / ACTIVE_HEALTHY. Additive migration 20261117204258,
five_alive_word_reviews, applied successfully. Post-install catalog verification:
new wrapper MD5 84a22fb01af273c0de7846bcb494669f; old load remains
39b3f82999c239579a017d6c923c19e5. Only postgres/service_role can execute the
new wrapper; anon and authenticated cannot. No application rows, balances,
catalog activation or existing release flags were changed by this installation.
The exact management migration version is preserved in supabase/migrations.

Next: commit/tag, normal fast-forward main integration and approved push helper,
verify the exact deployment and release publication, then authenticated Arcade
and fake-money Async smoke in fresh isolated contexts. Do not mark release
complete until the production smoke and scoped authoritative readback pass.


## November 16 phone keyboard / five-second award follow-up — production smoke passed

Released commit **`f5f8b10ae36d51812e62ae209ab9e48581fc18df`**, tag
`five-alive-phone-award-20261116`. Vercel `dpl_A4vRbxuKivyy7mPz1dFAArVdV7Vb`
is READY / production. GitHub run `44021178472`, job `133830767201`, succeeded
on attempt 1. Production verification and release publication both passed;
`public.system_settings.release_publication` independently matches the exact
SHA, deployment ID `44021178472-1`, and `2026-11-17T05:12:47.146Z`. No retry or
second deployment was needed. Both production manifests serve the exact SHA.

**All four production acceptance items passed**, runner exit 0. Two fresh
isolated Edge contexts verified `page.url()` and `location.href` as exactly
`https://ptown-poker.vercel.app/auth`, the expected build manifest, and the
production Supabase backend before using the approved test accounts. Personal
Chrome was not used. There were zero browser page errors and no error/fatal
groups in the deployment's runtime scan since `2026-11-17T05:13:00Z`.

- **Sequential feedback:** 39 real submitted guesses recorded CSS start/end
  events proving left-to-right close/open order, the actual server feedback
  before the next tile, 220 ms half-flips and the horizontal rotation axis.
- **Persistent history/privacy:** multiple submitted words and feedback remained
  through row advancement, reload and reconnect in both modes. Async restored
  only the owner's waiting rows; the opponent's guesses remained sealed until
  both completed the word, then appeared in shared results.
- **Phone keyboard:** the production 390×844 layout measured **5.59375 px**
  between grid and keyboard, retaining **40 px** key height and **34.53125 px**
  minimum key width. The screenshots were visually checked. Local phone proof
  also passed 320/390/430 px widths with a 24 px simulated bottom safe area.
- **Five-second score reveal:** six solved production words across Arcade and
  Async retained the explicit base × difficulty calculation for at least
  **5,709.9 ms**. Earliest score change: **5,009.1 ms**; earliest awarded-total
  flight: **5,006.3 ms**. No early count or dismissal. Independent scoring from
  the final disclosed results matched the authoritative totals.
- **Arcade:** run `3236727a-aa92-4223-b0ac-ac66c2a9aade` completed all three
  words for **1,176**, showed Game Over and returned to its leaderboard. Scoped
  database readback confirmed completed, exactly one result and zero multiplayer
  sessions, transfer batches or financial postings.
- **Fake-money Async:** match `f1d9def8-a63c-44fc-94fc-989788569fc5`, child
  `73e13110-dc44-4a09-b3f7-c3b99a347c25`, completed **1,225–0**; both players
  reached Match complete and returned to the match. Invitation guards enforced
  the approved opponent, one Five Alive child, stake 1 and `real_money=false`.
  SQL readback confirmed settled/session_ended, one outcome, one settlement,
  one game result (`90093314-6e6f-4476-ab33-da46582a273b`), two matching final
  snapshots and one balanced transfer. Actual fake chips **+1/−1**, unmatched
  transfers empty, real-money postings **zero**. This is a scoped smoke receipt
  check, not a repeat of the earlier financial qualification matrix.

Evidence in `qualification.local/five-alive/phone-award/`:
`publication-success.json`, `production-smoke.json`, `production-smoke.log`,
`settlement-proof.json`, `runtime-errors.json`, `production-release-complete.json`,
and the Arcade/Async history and completion screenshots. No schema, catalog,
release-flag or unrelated-game changes were made. This is automated production
acceptance, not a claim of Jeremy's physical-device smoke.

Jeremy authorized all four presentation acceptance items and normal production
delivery. Baseline: `b803f0f543d27667ef71f08daf46eecfaaaa0879`, with the previously
smoked sequential reveal/history runtime `2a80321ca`. Preserve that implementation
and its regression coverage; no new rule, scoring, vocabulary, schema or flag change.

The saved production `presentation/arcade-history.png` shows the large empty
space between grid and keyboard. The board's bottom auto-margin owned that gap.
The scoped CSS moves that spare space below the keyboard, preserving the grid,
existing 40 px key height, widths and canonical shell safe-area padding. There
are no phone-specific breakpoints, viewport measurements or smaller keys in product code.

The award previously flew after 350 ms and counted after 600 ms. It now displays
the authoritative pre-guess base and disclosed difficulty multiplier for at
least 5,000 ms after mount, then flies the awarded total to the score and counts
the unchanged server points. The multiplier/base display does not recompute
scoring (including rounded awards). Realtime/online recovery retains an active
award until its presentation completes; refresh still restores authoritative
saved state. No second gameplay or settlement owner is introduced.

Focused board/session/award checks: **18 passed**, covering all five tiles'
feedback/order, multiple retained rows and reconnect, Async privacy, exact
4,999/5,000 ms boundaries, reduced motion, unmount cleanup, rounded score
preservation and retention across recovery/server advancement. Actual-browser
proof covers Arcade, Async, reduced motion and 320/390/430 px phone layouts.
The first browser pass measured a **5.59375 px** grid-keyboard gap and retained
**40 px** minimum key heights; score movement began after 5,000 ms in all modes.
The final browser pass **passed, exit 0**, additionally checking a 24 px bottom
safe area and reconnect during the reading interval. Earliest observed score
movement was **5,003.6 ms** after the calculation appeared.

Final `npm run build` **passed, exit 0**: full TypeScript, **4,292 application
tests / 585 files**, **241 harness tests / 12 files**, **46 release-tooling tests**,
Vite and the unchanged 90 MB size gate (**89,994,371 bytes**). Internal diff review
and `git diff --check` passed. All local gates, publication and authenticated
production smoke are complete. No product code changed after qualification.

Evidence: `qualification.local/five-alive/phone-award-release-build.log`,
`phone-award-browser.log`, `presentation/proof.json`, and the new
`phone-award/` acceptance directory. Reproduction:
`node dev/five-alive/presentation/proof.mjs`. The 1,021 qualified answers and
8,979-word post-launch growth gap are unchanged. The unrelated Cribbage snapshot
working change remains preserved and excluded from this release.

## November 16 feedback/history release complete — publication and production smoke passed

**Both approved presentation fixes are live and production-smoked.** Runtime
commit: `2a80321ca167371a1bac42c475190e23e4604f54`; checkpoint tag:
`five-alive-feedback-20261116`. Vercel `dpl_FC8AKhNq3cUokkfXWbWrGPaNLC9D`
is READY / production. Both ptown-poker.vercel.app and holm357.com serve this
exact build and `assets/index-f_u1epJX.js`. No additional deployment was requested.

Release-signal [run 43998810924](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43998810924),
attempt **2**, [job 133765086708](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43998810924/job/133765086708),
succeeded. The endpoint returned `accepted:true` for this exact SHA and
deployment ID `43998810924-2` at **2026-11-17T02:14:48.559Z** (November 16,
8:14:48 PM Chicago). `public.system_settings.release_publication` independently
matches. This supersedes the initial production-wait timeout preserved below;
there is no failed latest attempt to rerun.

### Authenticated production acceptance

Two fresh isolated headless Edge contexts used the approved E2E accounts.
Before either login, `page.url()` and `location.href` both matched exactly
`https://ptown-poker.vercel.app/auth`; the build manifest matched the approved
SHA and the served bundle used production `xvhmbuppghwmwpwrkzao`, not isolated
`tyuxxkalhqbqkbvvkcfx`. Personal Chrome and its sessions were not used.

- **Arcade passed:** run `0ed40195-9294-4f75-826a-16d4b3358218` completed all
  three words for **1,052**, matching an independent calculation from the final
  disclosed results. Submitted STARE/AMPLE rows and feedback remained visible;
  refresh/reconnect restored saved rows without replay. Game Over and return to
  the leaderboard passed. SQL readback: completed, exactly one result, zero
  multiplayer sessions, transfer batches or financial postings.
- **Async passed:** fake-money match `a486b620-0c34-48e1-81e9-397f49cfd3bf`,
  child `45b7fe15-4fcc-4121-87b0-190bab20b8b1`, completed all three words for
  both players at **1,107–0**, matching independent scoring and both projections.
  The invitation was addressed to the other approved test account and server
  state confirmed fake money before acceptance. Own completed rows persisted
  through waiting and refresh; opponent guesses stayed sealed until both
  finished the word, then appeared in the shared Word results. Both clients
  reached Match complete and returned to the match.
- **Presentation passed:** 40 accepted guess animations recorded actual CSS
  start/end events. Every row revealed columns 0 through 4; each tile completed
  its 220 ms close/open `rotateY` phases before the next started, with exact
  server feedback colors. Multiple completed rows, correct guesses and their
  final reveal/award/advance order passed. Zero browser page errors.
- **Canonical settlement passed:** the Async match is settled and the game is
  session_ended, both `real_money=false`. Exactly one outcome, one settlement,
  one game result (`7509bb34-834d-4157-ab4c-c38eb43003f7`), two matching final
  snapshots and one balanced transfer batch. Actual test-player chips are
  **+1/−1**, matching the single transfer; unmatched transfers are empty and
  real-money transaction postings are **zero**. This was a scoped readback of
  normal fake-money smoke actions, not a new financial qualification run.
- The deployment's error/fatal log scan scoped from `2026-11-17T02:40:00Z`
  returned no error groups. No schema, catalog, flag or unrelated-game changes
  were made. The only balance changes were the approved fake-money test chips.

Final standard checks and accepted preview evidence remain recorded below:
full TypeScript, **4,290 app / 241 harness / 46 release-tooling tests**, Vite and
the unchanged 90 MB gate (**89,993,957 bytes**). No product code changed after
that qualification. The unrelated Cribbage snapshot worktree change is preserved.

Evidence in `qualification.local/five-alive/presentation/`:
`publication-success.json`, `production-origins.json`, `production-smoke.json`,
`production-async-smoke.log`, `settlement-proof.json`,
`production-release-complete.json`, and Arcade/Async history, waiting and
completion screenshots. The earlier runner-only Async route typo was corrected
to the registered `/delayed/:matchId/play/:childId`; smoke resumed the same
accepted match and preserved the completed Arcade evidence. Its earlier log
is retained; the completed runner exited 0. No product patch was needed.

**Release gates complete.** This is automated authenticated production smoke,
not a claim of Jeremy's physical-device smoke. The runtime bank remains
**1,021 qualified answers**; **8,979** toward roughly 10,000 remains qualified
post-launch growth in BACKLOG.md. Do not add unreviewed words.

## November 16 initial publication attempt — superseded verification timeout

Approved correction commit **`2a80321ca167371a1bac42c475190e23e4604f54`**
was committed on `codex/five-alive`, tagged `five-alive-feedback-20261116`,
fast-forwarded into the clean release `main` worktree, and pushed with the
unchanged `.codex/scripts/push-origin-main.cmd` helper. The unrelated Cribbage
snapshot working change remains untouched in the Five Alive worktree.

Final local standard checks passed: full TypeScript, **4,290 application tests,
241 harness tests, 46 release-tooling tests**, Vite and the unchanged 90 MB gate
(89,993,957 bytes). GitHub's independent qualification step also passed.

Release-signal [run 43998810924](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43998810924),
job [133757439809](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43998810924/job/133757439809),
failed its production verification at **November 16, 8:05:44 PM Chicago time**
(`2026-11-17T02:05:44Z`). Exact error:
`Production never served the expected commit; no release signal published`.
The publish step was skipped. This is a production-readiness wait timeout,
not a failing application test.

At the failure check, Vercel deployment `dpl_FC8AKhNq3cUokkfXWbWrGPaNLC9D`
for the exact approved SHA remained **BUILDING**. Both
`https://ptown-poker.vercel.app/build-manifest.json` and
`https://holm357.com/build-manifest.json` returned the previous runtime
`4fb956ac58a258e074a3938c66c659410e17022c` / `assets/index-D0tiQaYo.js`.
The automatic Vercel build was not canceled or rerun and may finish afterward;
that does not itself publish the failed release signal.

No authenticated production action or gameplay smoke was performed in this
attempt. No database, release flag, balance, schema or catalog mutation was
made. Readback confirmed only Arcade `five-alive/3` enabled, rules
`five-alive/1`, pool `esdb-five-alive/3`, and the already-qualified Async flags.

Evidence: `qualification.local/five-alive/presentation/release-candidate.json`,
`release-failure.json`, `release-failure.log`, and
`qualification.local/five-alive/presentation-release-build.log`.
The local `gh auth status` command failed because `gh` is not installed/on PATH;
the connected GitHub tools supplied the run, job, and failure logs. No new auth
flow or verification code was attempted.

The original resume gate was to verify READY/exact SHA, retry publication and
complete isolated authenticated smoke. **All three are now complete**, as
recorded above. This historical failure is preserved for diagnosis; it is not
an active blocker. No redeployment or catalog reactivation was necessary.

## November 16 follow-up — sequential reveal and retained guesses; production approved

Jeremy approved both revised previews and production publication. The approved
candidate preserves guesses and uses sequential horizontal flips at 220 ms per
half-flip. Final standard checks passed; publication and production smoke are
now complete as recorded above. The following records the preceding local pass.

Preview revision requested by Jeremy: slow the reveal slightly and flip
side-to-side rather than top-to-bottom. The CSS now rotates around the Y axis
with 220 ms per half-flip (440 ms per tile, nominally 2.2 seconds for the row),
up from 160 ms per half-flip. Tile order remains left-to-right. This revision
changes only presentation CSS. The approved timing/axis candidate passed the
full final standard build, recorded below.
The revised browser proof passed: computed keyframes use `rotateY`, both
half-flips are 220 ms, every prior tile completes before the next starts, and
history, recovery, correct awards, Async privacy and reduced motion still pass.
Both visible preview tabs were reset for review. Production remains unchanged.

Jeremy reported simultaneous feedback reveal and disappearing submitted guesses
during production smoke, and requested previews of both corrections **before
production**. Candidate starts from `cda168eaec7646a20b957dbbe30c28558d257149`
in the existing `codex/five-alive` worktree. Production has not changed in this
pass. The report's screenshot was not available in the conversation; diagnosis
and preview evidence below come from the actual source and rendered behavior.

Root cause: the board drew submitted letters only from a temporary whole-row
fade receipt, then cleared them; all feedback colors were applied together.
Correct/sixth guesses could advance the server word before that row rendered.
The board now always draws saved guesses from the owner's admitted snapshot.
A local presentation receipt closes/opens one tile at a time, applies its actual
feedback at the flip midpoint, and waits for its animation end before the next.
The old word remains through its final reveal and existing score award before
showing the already-authoritative next snapshot. No rule, score, pool, API,
database, financial or catalog change is part of this correction.

Submission holds presentation across an earlier Realtime response. Only a
snapshot admitted by the existing identity/revision guards may start a reveal.
Refresh, visibility recovery and reconnect cancel interrupted local animation
and restore saved guesses without replay. Async waiting uses only `ownResult`
for the owner's grid; opponent history still comes exclusively from mutually
disclosed `revealed` results.

- Focused board/session/award tests: **16 passed**, including per-tile order,
  exact colors, duplicate event handling, multiple saved rows, correct award
  ordering, sixth miss, early Realtime, lost response, conflicting revision,
  refresh/reconnect and Async waiting/privacy.
- Shared rule tests: **9 passed**, including duplicate-letter feedback, scoring
  and sealed opponent projections. Rules and the 1,021-answer pool are unchanged.
- Fresh isolated Edge browser proof: **passed** actual CSS start/end ordering,
  miss/misplaced/correct feedback, retained STARE/AMPLE rows, reload/reconnect,
  APPLE award of 392 after all five flips, Async owner-only rows before mutual
  completion, shared history afterward, and reduced motion. Zero page errors
  and zero nonlocal requests. This uses disposable local transport and the
  shared rules; it does not rerun or replace the prior hosted financial proofs.
- Final approved candidate `npm run build`: **passed, exit 0**, including the
  220 ms horizontal flip and snapshot-admission guard: full TypeScript,
  **4,290 app tests,
  241 harness tests, 46 release-tooling tests**, Vite, and the unchanged 90 MB
  size gate (**89,993,957 bytes**). `git diff --check` passed. The existing
  unrelated Cribbage snapshot worktree change was preserved.

Evidence: `qualification.local/five-alive/presentation/proof.json`, its three
screenshots, `presentation-browser.log` and `presentation-build.log` in the
parent Five Alive evidence directory. The final approved build is recorded in
`qualification.local/five-alive/presentation-release-build.log`. Reproduce with
`dev/five-alive/presentation/README.md`. Fresh visible Edge tabs were opened at
the local Arcade and Async preview URLs; Arcade has STARE ready to submit and
Async shows retained STARE/AMPLE rows. **Preview approval received; the subsequent
normal publication and authenticated production smoke passed as recorded above.**

## November 16 release complete — published, activated and production-smoked

## November 17 preview review — publication held for Jeremy

Jeremy requested a preview of each change before publication. Five independent
local previews are running with the actual product components and disposable
fixture state only. The native browser checked all five action controls and
reset every scenario after passing. The preview-only typing shortcut was
corrected to commit entered letters before Enter; product code is unchanged.

1. Keyboard / sequential feedback / persistent rows: http://127.0.0.1:5191/dev/five-alive/presentation/index.html?mode=arcade&demo=keyboard
2. Waiting Word Results / word-by-word scorecard: http://127.0.0.1:5192/dev/five-alive/presentation/index.html?mode=async&player=a&demo=results
3. Masked opponent turns / solved final guess / paired scores: http://127.0.0.1:5193/dev/five-alive/presentation/index.html?mode=async&player=a&demo=opponent
4. Masked opponent turns / sixth-miss final guess: http://127.0.0.1:5194/dev/five-alive/presentation/index.html?mode=async&player=a&demo=sixth
5. Five-second own-award calculation before score count: http://127.0.0.1:5195/dev/five-alive/presentation/index.html?mode=arcade&demo=award

Launcher: dev/five-alive/presentation/previews.mjs. Each tab has an action
button, Reset preview, Refresh and Reconnect. Evidence runner:
qualification.local/five-alive/results/verify-previews.mjs (exit 0, all five).
**First open step is now Jeremy's preview review**, superseding the release
resume instruction below. Production remains untouched; no publication is
authorized until this newly requested review has concluded.

## November 17 keyboard, word scorecard and opponent review pass — candidate qualified; release pending

Approved scope: preserve the released horizontal, left-to-right 220 ms half-flips, retained own rows, compact phone keyboard and full five-second own-award hold. Available keys are light gray (#d3d6da), misses dark gray (#3a3a3c), with existing yellow/green feedback preserved. The referenced attachment was not available in this session; the explicit requested colors and saved production phone evidence were used.

Word Results is available while waiting after own completion. The felt no longer prints the previous-word helper. The scorecard lists each answer in five green tiles, its tier, opponent then viewer guess count and base × difficulty = authoritative award; it does not list guesses. Earlier opponent guess letters/feedback are removed by the shared server projection. Only the final correct/sixth-miss guess is disclosed in the sequenced review after mutual completion. Both score counts and audio share one start time after final-tile reveal and a five-second reading interval.

Durability uses the existing immutable Async review events and per-viewer begin/ACK RPCs. The additive service-only delayed_five_alive_review_load delegates authorization, expiry and locking to the unchanged delayed_five_alive_load, then materializes deterministic per-word review identities. The old RPC remains available unchanged for the currently deployed client. No table, trigger, index, policy, RLS, financial owner, scoring rule, answer bank or release flag changes. Final-result entry must drain pending word reviews before the canonical child result. A missing review projection fails closed in the new service.

Evidence:
- 38 focused component/adapter/terminal-entry tests passed; 10 native shared-rule tests passed. Coverage includes sequential actual feedback, multiple retained rows/reconnect, private waiting scorecard, masked turns, final sixth miss, shared score/audio timing, interrupted remount, already-seen receipts, and the terminal-entry gate.
- Fresh isolated Edge presentation acceptance passed: real CSS events, native reload/reconnect, pending opponent review after reload, waiting scorecard, no earlier opponent strategy, reduced motion, and 320/390/430 px phone layouts with 24 px safe area. Keys remain at least 40 px high; grid gap remains within 8 px. Screenshots were inspected.
- Isolated project tyuxxkalhqbqkbvvkcfx: 22 rollback assertions passed both before and after additive installation, including sealed first finisher, stable receipt on replay, per-viewer/duplicate ACK, outsider denial, three-word win/tie and canonical exactly-once settlement. SQL fixtures needed the existing enabled-account and fresh-heartbeat preconditions; all fixture changes rolled back. Zero residual fixtures and zero enabled disposable accounts verified.
- Original load MD5 remains 39b3f82999c239579a017d6c923c19e5. New wrapper MD5 84a22fb01af273c0de7846bcb494669f; execute grants only postgres/service_role, anon/authenticated denied. Existing schema objects and grants unchanged.
- Initial full standard build passed TypeScript, 4,296 app / 241 harness / 46 release-tooling tests, Vite and unchanged static budget: 89,999,447 / 90,000,000 bytes. The final additive-adapter run also passed (exit 0): TypeScript, 4,297 app tests / 586 files, 241 harness tests / 12 files, 46 release-tooling tests, Vite (11.59 s), and 89,999,447 / 90,000,000 bytes.

Artifacts: qualification.local/five-alive/results/{review-proof.sql,rollback-proof-result.json,focused-additive.log,terminal-gate.log,standard-additive.log}; native browser evidence in qualification.local/five-alive/presentation/{proof.json,word-scorecard.png,phone-keyboard.png}. Production smoke runner is prepared in results/production-smoke.mjs and verifies page.url(), location.href, exact production build and Supabase project before authentication.

Production outcome: unchanged at f5f8b10ae36d51812e62ae209ab9e48581fc18df at this checkpoint. No production DDL, push, deployment or smoke has yet occurred for this pass. Release remains pending additive production installation, normal main push/publication and authenticated fake-money smoke. This pass ended at the repository tool-call budget; no release gate failed. The product changes and this checkpoint are still uncommitted.

**First open step for the next bounded pass:** review the final diff/status, apply the qualified additive SQL via the Supabase management migration tool to the verified ptown-poker-prod project xvhmbuppghwmwpwrkzao, record the actual migration version in supabase/migrations, then commit/tag and fast-forward the clean main worktree at C:/Users/jerem/Documents/Codex/2026-10-27/task/incident-release-main. Use the unchanged .codex/scripts/push-origin-main.cmd. HEAD and origin/main were synchronized at 2a9c1b1aa12b3dc248dfa8e386b1d8da3e857485; fetch again before integration. Existing catalog/flags are already active and must not be reactivated. Do not rerun completed financial/Auth/Realtime qualification.

Before smoke, populate results/smoke-resume.json with the actual deployed SHA and verify release publication. The prepared production runner passed syntax checking only; record actual paired score starts, masked final reveal, durable review ACKs, and scoped settlement readback in the live smoke. Use fresh isolated Edge contexts and approved fake-money accounts only. Local gh was not found in PATH; do not retry browser verification codes. Connected workflow read tools remain available. Existing unrelated Cribbage snapshot formatting is preserved. Runtime vocabulary remains 1,021; 8,979 qualified additions remain as post-launch growth.

**Five Alive is active in production with 1,021 qualified answers.** Deployed
commit: `4fb956ac58a258e074a3938c66c659410e17022c`; Vercel
`dpl_HXXRqVZi56A8DoAo3meZV7AuScXk` remains READY / production. No redeployment
was requested. The earlier CLI/browser/publication blockers are superseded by
this verified outcome. Production checkpoint: `five-alive-production-20261116`.

Jeremy started attempt 2 from the visible GitHub run window. Run
[43973296114](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43973296114),
job `133735484502`, completed successfully. Both production verification and
release publication passed. The endpoint returned `accepted:true`, and
`public.system_settings.release_publication` independently confirms the exact
commit, deployment ID `43973296114-2`, and publication time
`2026-11-17T01:04:52.565Z`.

### Guarded production activation

Verified project `xvhmbuppghwmwpwrkzao` is `ptown-poker-prod`, ACTIVE_HEALTHY.
Immediately before activation, every Five Alive flag was closed and allocations
were **zero**. Executed the preserved `production-activation-20261116.sql`
without modification (SHA-256
`59c4c7e4a999eb7219e9f19f4eb08cbdb7af29e571c5c483161a4e79623f239e`).
Its transaction verified the bank and frozen rules/pool configuration and
preserved unrelated Arcade rules exactly. Readback confirms only
`five-alive/3` enabled; v1/v2 remain disabled. Both `async_enabled` and
`async_real_qualified` are true, as authorized after the prior two-mode financial
qualification. This pass used **fake-money Async play only**.

### Authenticated production gameplay smoke passed

Two fresh, independent headless Edge contexts used the approved E2E accounts.
Before either login, both `page.url()` and `location.href` were verified against
`https://ptown-poker.vercel.app`, the manifest matched the deployed commit, and
the loaded bundle pointed only to production Supabase. No personal Chrome
session, GitHub verification code, production credential setup or SSL change
was used. Game inputs used the actual browser UI; solve choices used only each
player's public feedback and the reviewed bank, never private unrevealed answers.

- Arcade run `db23f26a-d915-4340-8f7d-4474695b3c64`: rules/info, three words,
  nine accepted guesses, score **1,470**, Game Over, and leaderboard return passed.
  Recomputed score matches the server. The leaderboard identifies this run;
  database confirms one result and zero multiplayer sessions, financial
  transactions or transfer batches for the run.
- Async match `fb275572-2068-4aa3-af4d-ad54b50a975f`, child
  `d237a447-91d8-41ff-882f-1fd3c2498def`: invitation guarded to exactly the
  other approved account, one Five Alive game, stake 1 and `p_real_money=false`.
  Database confirmed fake mode before acceptance. Both players completed all
  three words, including waiting/shared progression. Final scores **1,435–0**
  match independent recomputation and both server projections.
- Settlement: one outcome, one settlement, one canonical game result; winner +1
  and loser −1 fake chips, matching final snapshots. Exactly one balanced transfer
  batch with one transfer of 1 and no unmatched deltas. **Zero real-money
  transactions.** Match status `settled`; canonical session `session_ended`.
- Both players viewed the correct win/loss finale and returned to the lobby.
  Zero browser page errors. Vercel error/fatal log scan for this deployment from
  01:05 UTC returned no groups.

Evidence under `qualification.local/five-alive/hosted/`:
`release-signal-success-20261117.json`, `production-smoke-origin-20261117.json`,
`production-arcade-smoke-20261117.json`, `production-async-smoke-20261117.json`,
`production-release-success-20261117.json`, plus Arcade completion and both
Async completion/finale screenshots. Completed qualification and local standard
checks were preserved; no product code or vocabulary changed in this pass.

**Remaining work:** vocabulary growth is post-launch only: 1,021 qualified
runtime answers, 8,979 below the roughly 10,000 goal. Continue individually
reviewed, qualified batches while preserving existing words, tiers and records.
No release gate remains open for the authorized automated production smoke.

## November 16 local Actions retry blocked — GitHub CLI unavailable

At `2026-11-17T00:22:04Z` (November 16 local time), the authorized local retry
stopped at its first prerequisite. `gh auth status` exited **1**:

> The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.

No `gh.exe` was found in the checked Program Files (both architectures), per-user
Programs, WinGet Links, Codex bin, Scoop or Chocolatey install locations. The
release-workflow search found no alternate CLI path. This establishes an unavailable
CLI, **not** a GitHub authentication rejection or a determination of Actions scope.
Local Actions write access could not be verified, and the requested
`gh run rerun 43973296114 --failed --repo jeremyhappach/rule-your-poker`
was not executed. No tool installation or credential/verification-code flow was
attempted. The reported connector 403 was not retried.

The existing worktree is `codex/five-alive`; its remote is
`https://github.com/jeremyhappach/rule-your-poker.git`. Local main and origin/main
both identify deployed candidate `4fb956ac58a258e074a3938c66c659410e17022c`;
the worktree's initial HEAD was the preserved checkpoint commit `04409f9c5`.
The unrelated Cribbage snapshot change remains untouched.

**Actual outcome:** no Actions retry, release-signal publication, deployment,
activation or gameplay smoke was performed in this pass. The last verified
production state remains the READY candidate with Five Alive admission closed
and zero allocations, as recorded below; it was not re-queried in this pass.
The approved Arcade and fake-money Async smoke checks remain pending.
Evidence: `qualification.local/five-alive/hosted/local-actions-cli-blocker-20261116.json`.

**First open gate:** make the `gh` command available to this local session,
verify its existing authentication with `gh auth status`, and retry only failed run `43973296114`.
Successful publication for the exact deployed SHA remains mandatory before the
existing guarded activation and gameplay smoke procedure. No qualification,
standard checks or production installation rehearsal needs repeating for this
documentation-only pass.

## November 16 final outcome — source deployed; release signal gate failed

**Stopped before gameplay activation.** The fresh isolated browser-origin and
authenticated baseline smoke passed. Candidate
`4fb956ac58a258e074a3938c66c659410e17022c` was tagged, fast-forwarded and pushed
through the approved helper. Vercel `dpl_HXXRqVZi56A8DoAo3meZV7AuScXk` is
**READY / production**. Both `https://ptown-poker.vercel.app` and
`https://holm357.com` now serve that exact commit and `assets/index-D0tiQaYo.js`.
A fresh navigation in the isolated test-account context verified the production
URL again, 16 Arcade tiles including Five Alive, and zero page errors. No personal
Chrome session was used. This verifies the deployed catalog, not a completed
Five Alive production game.

**Exact blocker:** GitHub release run
[43973296114](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43973296114),
job `133670744240`, passed qualification but failed
`Verify production or record an intentional documentation-only skip`. At
`2026-11-16T23:00:14.638Z`, `scripts/deployment/release-decision.mjs:29` exhausted
its production wait and threw:

> Production never served the expected commit; no release signal published

The last sampled live SHA was `2f39f556a3621d765f72ce599bbe53e28b5648f4`.
Vercel completed its approximately 15-minute build afterward. The release-signal
publication step was skipped. The deployed candidate is now verifiable, but
the required workflow is still failed; it was not rerun after this new gate
failure, following Jeremy's stop instruction.

The closed installation remains applied as migration
`20261116224512_five_alive_qualified_v3_closed_release`. Final database readback:
1,021 answers, all three Arcade rulesets disabled, `async_enabled=false`,
`async_real_qualified=false`, and **zero allocations**. Production balances and
unrelated games were not changed. The catalog code is visible; gameplay remains
closed. No full Five Alive production gameplay smoke or release-readiness claim.

Evidence in `qualification.local/five-alive/hosted/`: production-auth-preflight-20261116.json/PNG,
production-installation-20261116.json, production-release-closed-20261116.json,
production-catalog-closed-20261116.png and release-signal-failure-20261116.json.
The prepared production-activation-20261116.sql has **not** been executed.

**First open gate on resume:** rerun the failed release-signal job against this
already-live SHA and verify successful publication; then execute the scoped
activation and full authenticated Five Alive production-game smoke. Preserve
the completed qualification and standard checks. The 8,979-word expansion gap
remains post-launch work, with only individually qualified answers admitted.

## November 16 publication in progress

Qualified candidate `4fb956ac58a258e074a3938c66c659410e17022c` was committed,
tagged `five-alive-qualified-release-20261116`, fast-forwarded into clean main
and pushed with the unchanged approved helper. Vercel production deployment
`dpl_HXXRqVZi56A8DoAo3meZV7AuScXk` is building. GitHub run `43973296114` passed
its qualification step and is awaiting the exact production SHA before publishing
the release signal. Admission remains closed pending READY and live verification.
The unrelated Cribbage snapshot remains unstaged in the Five Alive worktree.
The ESDB copyright is preserved byte-for-byte under its existing `-text` policy;
its original CRLF/whitespace is excluded from whitespace lint. One trailing blank
line in the qualification runner was removed; product code and tested SQL bytes
were unchanged. All other staged whitespace checks passed.

## November 16 isolated production smoke passed; closed installation applied

A fresh headless Edge process and new Playwright context verified both `page.url()`
and `location.href` at `https://ptown-poker.vercel.app/` before authentication.
Vercel reports the alias as READY / production at
`2f39f556a3621d765f72ce599bbe53e28b5648f4`; the served build manifest matched.
The loaded bundle uses production Supabase `xvhmbuppghwmwpwrkzao`, not the isolated
project. The approved E2E player 1 signed in through the real login form (HTTP 200).
The authenticated Arcade lobby, rules dialog, leaderboard and Play admission passed
with zero page errors and zero gameplay writes. No personal Chrome session was used.
Evidence: `qualification.local/five-alive/hosted/production-auth-preflight-20261116.json`
and the adjacent PNG. This clears the previous browser-origin blocker; Five Alive
production gameplay smoke still follows deployment and activation.

The exact rehearsed package (SHA-256 `ba30970eb37cbfd8b0a29a5b42f59926e48f85b6dbae4c4b574714c6d8075a83`)
was applied through Supabase migration `20261116224512_five_alive_qualified_v3_closed_release`.
Post-install assertions passed: 17 qualified functions, 1,021 answers and tiers,
closed admission, unused pool, correct rules/pool version and denied direct access.
The security advisor added only five expected INFO notices for private RLS tables
with no public policies; existing unrelated warnings/errors are unchanged.
No production game/financial function was invoked and no balances changed.

The previously passed standard checks and installation rehearsal were preserved
without rerunning. Fresh fetch confirms HEAD, main and origin/main still share
`bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d`; the main release worktree is clean.
Next: commit the qualified candidate, fast-forward/push main, verify the exact
production deployment, activate Five Alive only, and run the production game smoke.

## November 16 final checks passed — browser policy prevents production smoke

The five catalog/layout failures are resolved. All four edited fixture files pass
**46 focused tests**. Assertions remain exact: 16 Arcade tiles, all existing links
and relative ordering, the entire saved ordering payload including hidden entries,
and the unchanged historical ordering seed. Five Alive appends to P-Town Originals
after saved placements (before River City Run and Ship Cap Voyage in the legacy
seed fixture); the Other Games order is unchanged. Its catalog identity is tested
once, with order 26, solo Arcade, Async help, no live-table admission and no bots.

**Full standard `npm run build`: exit 0.** App typecheck, **4,282 app tests in
585 files**, **241 harness tests**, **46 release-tooling tests**, Vite production
build and the existing 90,000,000-byte size gate all passed. Log:
`qualification.local/five-alive/hosted/final-release-checks-20261116.log`.
Focused fixture log: `catalog-fixtures-20261116.log` in the same directory.
`git fetch origin` confirmed the candidate base still matches current main
`bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d` (0 ahead / 0 behind). The scoped diff
was reviewed and `git diff HEAD --check` passed; unrelated changes remain intact.

### Production installation rehearsal passed and rolled back

`dev/five-alive/release-package.mjs` builds `supabase/five-alive/release.sql`
from the qualified SQL and fresh production catalog definitions. It guards the
nine shared-owner preimages, installs all three vocabulary versions behind closed
admission, preserves existing artwork allowlist members while adding Five Alive,
and creates only Five Alive's default/artwork configuration rows. It verifies
all 17 resulting functions against the isolated qualified definitions, the exact
1,021-answer bank and tiers, unused pool cursors, closed admission, RLS and denied
direct secret-table/RPC access for anonymous/authenticated clients.

The complete package passed on production inside **BEGIN / ROLLBACK**. Returned
evidence: `qualified_definitions=17`, `qualified_answers=1021`,
`admission_closed=true`, `private_access_checked=true`. No production game or
financial function was invoked; no durable schema, application-row or balance
change was made. The passed financial/Auth/Realtime/recovery/browser proofs were
not repeated. Package SHA-256:
`ba30970eb37cbfd8b0a29a5b42f59926e48f85b6dbae4c4b574714c6d8075a83`.
Evidence: `qualification.local/five-alive/hosted/release-installation-proof.sql`
and `release-installation-proof-result-20261116.json`, with catalog preimages and
qualified function definitions alongside them. This is a passed rehearsal,
**not an applied migration**.

### Exact blocker and actual release outcome

Before installation/publication, Computer Use inspected the available sessions
to locate an existing signed-in browser for the required production-game smoke.
Chrome was available as native window 66744; no Chrome browser-control session
was exposed. Binding that observed window through `cua.getApp` was stopped by
the Computer Use policy:

> Computer Use has been stopped for this turn because it could not determine
> the current browser URL on Windows with enough confidence to enforce policy.

No fallback was used to bypass that policy. The required authenticated production
browser smoke cannot be performed through the stopped UI tool in this turn.
Per Jeremy's stop-on-gate-failure instruction, release stopped **before** durable
production installation, admission activation, commit/tag/push or deployment.
No production smoke result or new deployed Five Alive commit is claimed.
The last inspected production deployment remains
`dpl_4oah2QK8T1sbp3PqXARbBUEAeXTB` at `2f39f556a3621d765f72ce599bbe53e28b5648f4`.

**Resume:** restore a policy-verifiable authenticated browser-control path, then
finish the already-authorized checked installation, normal Git/Vercel release,
guarded activation and actual production-game smoke. Preserve the passing checks;
only rerun those whose candidate or relevant preconditions change. The 1,021-word
launch approval stands; roughly 10,000 remains post-launch growth work. Candidate
and checked release package remain local and uncommitted. Production is unchanged.

## November 16 release continuation — merge complete; catalog tests block release

Jeremy authorized resolution of the three integration conflicts and production
release with the 1,021-answer bank. The roughly 10,000 target remains post-launch
growth work, not a release blocker.

### Merge and preservation

Fetched current main, preserved the complete existing candidate in stash
`050908cbd417b23771ef06c51dd7b39c0dee48dc`, fast-forwarded `codex/five-alive`
from `f8aa84630` to `bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d`, and restored
the candidate. Only the three previously authorized conflicts occurred; all are
resolved. The preservation stash is retained. No history was rewritten or pushed.

`matchLobbyStatus` keeps main's active/not-held/not-removed guards, terminal and
deadline exclusions, viewer-specific admission and opponent ownership semantics
for the ten existing Async games. Five Alive independently counts its authoritative
`playable` and `opponentPlayable` flags without relying on actor ownership, and
excludes a child when neither player has an obligation. Mixed-lineup and
null/either-actor cases, one/both finished players, expired/terminal children and
held/removed/inactive matches are covered by the focused tests.

All upstream content in BACKLOG.md and CURRENT_RELEASE.md remains intact after
the Five Alive sections. The unrelated Cribbage snapshot matches the preservation
stash (ignoring line-ending representation). `git ls-files --unmerged` is empty.
The reviewed source diff retains newer main's unrelated Arcade/Delayed changes.
Receipt: `qualification.local/five-alive/hosted/merge-preservation-20261116.json`.

### Local release preparation and checks

- Registered Five Alive in GAME_CATALOG and the active Async rules list; removed
  the temporary direct-descriptor fallback from the Arcade board. Shared gameplay
  rule version remains `five-alive/1`, runtime vocabulary `esdb-five-alive/3`.
  The rules-completeness fixture now includes the authorized entry.
- Stash restoration exposed Windows CRLF conversion of the newer answer/review
  files. Restored the exact original SHA-256 bytes and added `answers.* text
  eol=lf` to the private vocabulary attributes. No words, tiers, meanings or
  qualified hashes changed. All three vocabulary integrity tests pass.
- **35 focused lobby/notification tests pass.** The notification test needs the
  jsdom annotation because the merged lobby's existing game-name helper imports
  the browser client; its first plain-node invocation failed with missing
  localStorage, and the correctly configured test then passed.
- Standard `npm run build` passed the full app typecheck. App tests finished
  **4,276 passed / 5 failed**, across **581 passed / 4 failed files**. All **59
  RulesCompleteness tests passed**. Command exit: **1**. Because validate is
  fail-fast, harness tests, release-tooling tests, Vite and the size gate were
  not reached in this merged-candidate run. Earlier passes are not substituted.

### Exact new release blocker

The following catalog/layout expectations still omit the newly registered game:

1. `src/components/admin/ArcadeOrderingPanel.test.tsx:21`: actual saved section
   includes `five-alive` before the other appended games; expected list omits it.
2. `src/components/arcade/ArcadeSwitchboard.test.tsx:15`: actual visible links
   include `/arcade/five-alive`; expected list omits it.
3. `src/lib/arcade/lobbyLayout.test.ts:11`: actual Originals catalog includes
   `five-alive`; the legacy ordering expectation omits it. Preserve the historical
   stored seed and existing relative ordering when adding the new-game expectation.
4. `src/lib/gameCatalog/catalog.test.ts:9`: historical deployed-defaults parity
   does not separate the Five Alive addition from its frozen fixture.
5. `src/lib/gameCatalog/catalog.test.ts:29`: explicit Arcade-only game allowlist
   does not include `five-alive`.

Full failure output:
`qualification.local/five-alive/hosted/merged-release-preflight-20261116.log`
(failure summary starts at line 18677). Stopped on this new release-gate failure
as Jeremy explicitly requested; these four test files have not been edited.

**Actual release outcome: not deployed or activated.** No production migration,
application-row mutation, balance change, push, release tag or smoke was performed.
Only two read-only production catalog queries inspected required function/table
definitions; Five Alive's production release table is absent. Catalog preimages
are preserved locally. Existing hosted Auth, Realtime, financial/recovery,
Arcade-isolation and browser proofs were not rerun. The reconciled candidate and
local catalog registration remain in the worktree, uncommitted; production stays
withheld.

**Resume at:** update the four catalog/layout test fixtures for the authorized
entry while proving unchanged legacy placement/admission, then run standard
checks on the final candidate. If green, finish guarded production configuration,
normal Git/Vercel release and production smoke. Do not repeat the completed merge
or the preserved hosted qualification proofs unless their owners change.

## November 15 launch decision — 1,021 answers approved

Jeremy explicitly approved launching the current 1,021 qualified runtime answers
(`esdb-five-alive/3`). The roughly 10,000-answer target is now a **post-launch
growth goal, not a release blocker**. This supersedes the vocabulary-volume hold
in the historical passes below; it does not waive any technical release gate.
The remaining 8,979 answers are tracked in `BACKLOG.md`. Additions still require
individual familiarity/fairness review, preserved tiers and source records,
per-word qualification, and versioned allocation/replay/no-repeat proof.

Release continuation is authorized: standard candidate validation, catalog and
release-configuration checks, safe Git integration, production deployment and
smoke verification. Preserve completed qualification evidence and unrelated
games/changes. Admission remains closed until required release checks pass.

### Release pass result — integration blocked (November 16, 04:18 UTC)

The standard `npm run build` completed with exit 0 against the preserved current
candidate: full app typecheck, **4,072 app tests**, **241 harness tests**, **46
release-tooling tests**, Vite production build and the existing 90,000,000-byte
size gate all passed. Log:
`qualification.local/five-alive/hosted/production-preflight-20261115.log`.
No completed hosted qualification proof was rerun.

The required safe integration gate **failed**. After `git fetch origin`, this
worktree's base remains `f8aa84630a3360dd94e73dd303ca02b1761dd48f`; current
`origin/main` is `bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d` (55 commits ahead).
A scratch-index `git merge-tree --write-tree` rehearsal returned exit 1 with
three content conflicts:

- `src/lib/delayed/lobbyPresentation.ts`: Five Alive's simultaneous-player
  `playable`/`opponentPlayable` turn counts overlap newer main's removed-match
  guard and viewer-specific/opponent turn counting. Reconciliation must preserve
  both behaviors; silently choosing either side would risk a regression.
- `docs/codex/BACKLOG.md` and `docs/codex/CURRENT_RELEASE.md`: both branches have
  independent newer entries that must be retained.

The rehearsal did not modify the real index, branch or working source files.
The unrelated Cribbage snapshot change was excluded and preserved. Receipts:
`qualification.local/five-alive/hosted/release-integration-20261115.json` and
`release-integration-20261115.log`. Its temporary unreferenced candidate object
is a rehearsal artifact, not a released commit. Stopped as Jeremy requested on
a required gate failure, consistent with the repository's merge-conflict rule.

Catalog inspection confirmed the existing intentional hold: the Five Alive
descriptor is present with Arcade mode and shared rule version `five-alive/1`,
but is absent from `GAME_CATALOG`; Async help is still in
`PENDING_ASYNC_RULES_GAMES`. Isolated config `five-alive/3`/pool
`esdb-five-alive/3` is preserved; no production release configuration or admission
was changed. Catalog registration/activation therefore remains pending after
integration, not claimed complete.

**Next step:** reconcile the three conflicts while preserving the newer lobby
guards and Five Alive simultaneous-turn behavior; finish catalog/release wiring,
validate the integrated candidate, then resume the authorized production release
and smoke check. No production tools were called, migrations applied, branch
updates pushed, deployments made or production smoke performed in this pass.
Vocabulary size is no longer a blocker. Production remains unchanged.

## November 15 bounded pass 6 — 1,021 answers; production still withheld

**Current runtime pool: `esdb-five-alive/3`, 1,021 qualified answers.** Added
268 individually reviewed familiar words to the preserved 753. No prior word,
tier, review record or vocabulary artifact changed. The exact remaining gap
against the unchanged roughly 10,000 target is **8,979 answers**.

### Review and per-word qualification

`server/fiveAlive/answers.batch3.review.csv` records each added word, ordinary
meaning and initial editorial tier. These are editorial judgments, not measured
player difficulty. Examples include ACORN, BROOM, MANGO and ZEBRA. The source
screen used neutral lowercase American base lemmas at ESDB size <=50 from the
same pinned revision `1e5b7d3a72f47a71da5d28686c1dd4b397178485`. All additions
belong to the unchanged 11,204-word legal-guess bank.

This broader screen does not use the earlier batch's frequency threshold as a
universal familiarity test. The pinned local Lingevo/OANC samples supply recorded
context; 61 of these ordinary words are absent from both samples. Those zeros
are preserved, not presented as positive usage evidence. Source membership alone
does not approve an answer. Only the 268 entries with individually reviewed
ordinary meanings and tiers were promoted; the other screened entries remain
unqualified. No obscure filler or sensitive sense was selected to reach a count.

`dev/five-alive/batch3-source.mjs` reproduces the source screen from the existing
ESDB checkout and pinned corpus archive. `batch3.qualify.ts` passed all **1,608
solve-position cases**, per-word duplicate-letter conservation, pre-reveal
privacy, legal-guess membership and shared-rule scoring parity. These are
vocabulary checks only. Durable per-word evidence and the pre-install allocator
result are in `server/fiveAlive/answers.v3.qualification.json`.

### Isolated integration and allocation evidence

`dev/five-alive/batch3-integrate.mjs` checks the review/evidence/prior-bank hashes
before generating `answers.reviewed.v3.txt` and the guarded follow-up migration
`supabase/five-alive/vocabulary-v3.sql`. Runtime artifact SHA-256:
`56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed`.
The migration was installed only on `tyuxxkalhqbqkbvvkcfx`. Config `five-alive/3`
selects this pool while preserving gameplay rule version `five-alive/1`.
Frozen v1/v2 games retain their original vocabulary. The allocator is unchanged;
the only two function-definition changes are new Async configuration defaults
from `five-alive/2` to `five-alive/3`, verified against the preimage.

`dev/five-alive/batch3-pool.proof.sql` passed before installation and against the
installed pool with an idempotent migration replay. Each run used a rollback-only
transaction: **681 mixed-mode allocations**, two complete 1,021-word cycles plus
the first word of cycle three, and **682 immediate/late replays**. Every word
appeared exactly once per complete cycle with its reviewed tier. Three-word
allocations stayed distinct even when crossing the cycle boundary, with no
adjacent duplicate. Frozen-tier edits and changed-version replays were rejected;
an interrupted allocation rolled back without consuming positions. The initial
proof harness had an ambiguous SQL variable; renaming it fixed the harness before
the successful pre-install proof. No allocator correction was needed.

A fresh cycle supports **340 complete three-word games without a repeat**.
Game **341** uses the final unseen word and then begins reuse. This meets the
existing no-repeat-until-cycle-exhaustion rule; it is a global pool-version cycle,
not a rolling or per-player window, and historical versions can overlap.
It does not satisfy the separate approximately 10,000-answer target.

Three focused vocabulary tests passed (`bun test server/fiveAlive/vocabulary.test.ts`).
They verify integrity, exact additions and unchanged historical words/tiers.
The installed observer found v1 epoch 1/cursor 78 unchanged, v2 epoch 0/cursor 0
unchanged, and v3 epoch 0/cursor 0 with **zero persisted proof allocations**.
All three Arcade rulesets are disabled; Async enabled/real-qualified flags remain
false. Detailed installed evidence is preserved in
`qualification.local/five-alive/hosted/vocabulary-v3-runtime-evidence.json`.

**Resume point:** review and qualify the next familiar-answer batch. Do not rerun
the passed Auth, Realtime, financial, recovery, Arcade-isolation or browser proofs.
No full typecheck/build or unrelated proof was rerun in this vocabulary-only
pass. No production tool calls, deployments, pushes, data or balance changes
occurred. Five Alive remains withheld; the vocabulary blocker is **8,979 words**.

## November 15 bounded pass 5 — 753-answer versioned runtime, still withheld

**Current runtime pool: `esdb-five-alive/2`, 753 qualified answers.** This is the
original 498 plus exactly the 255 reviewed/qualified additions. No new words or
difficulty changes were introduced. `answers.expansion.review.csv` is unchanged;
its pre-integration per-word qualification evidence is also preserved as
`server/fiveAlive/answers.v2.qualification.json`. The new runtime artifact is
`server/fiveAlive/answers.reviewed.v2.txt`, SHA-256
`5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231`.

The server loader validates and retains both vocabulary versions. Arcade and
Async actions select the pool version frozen in each game's configuration;
unknown/missing versions fail closed. Version 1's original file, 498 rows, pool,
allocations and existing game configurations remain unchanged. New configuration
`five-alive/2` selects the new vocabulary while keeping shared gameplay rules
`five-alive/1` (scoring, timing and legal guesses are unchanged). Async new-offer
and capability defaults now select that configuration; existing frozen offers
still use their original pool. Arcade's existing ruleset selector is unchanged.

`supabase/five-alive/vocabulary-v2.sql` is the guarded, idempotent follow-up after
the base candidate and version-1 seed. It was applied **only** to isolated project
`tyuxxkalhqbqkbvvkcfx`. Reproduce its artifacts using
`node dev/five-alive/versioned-pool.mjs`; this verifies the preserved review hash,
per-word qualification records and exact candidate hash before generating SQL.
Both Arcade rulesets remain disabled, Async admission/real qualification remain
false, and all disposable accounts remain disabled. No production tools were
called, and no production data, schema, code or balances changed.

### Allocation and repeat-window evidence

The unchanged allocator is one shuffled pool **per vocabulary version**, shared
globally by Arcade and Async. Each admitted Five Alive game consumes three
answers once; both Async participants share those three. Replays consume none.
An abandoned/unfinished game's allocation still consumes its three positions.

- A fresh 753-answer cycle supports **251 three-word games without any answer
  repeating**. **Game 252 begins reuse**, after every answer has been allocated.
  These are Five Alive child games, not necessarily 251 parent sessions containing
  multiple games, and the count is shared across all players/modes.
- The targeted rollback proof ran 502 mixed-mode allocations through two full
  cycles. Each cycle contained all 753 words exactly once; every allocation had
  three distinct words and the original reviewed tiers. It verified the first
  reuse at game 252 and no adjacent repeat across the cycle boundary.
- 503 immediate/late allocation replays preserved answers and pool position.
  A changed-version replay and a frozen-tier edit were rejected. An interrupted
  allocation rolled back without consuming positions. The Async deal owner gave
  both participants the same three answers. Legacy games/allocations remained
  unchanged. This did not rerun the passed financial, recovery, Auth, Realtime,
  Arcade-isolation or browser proofs.
- The proof passed before installation, then against the installed migration
  with an idempotent migration replay. All proof allocations rolled back.
  Observer state: v1 epoch 1/cursor 78 unchanged; v2 epoch 0/cursor 0, zero v2
  allocations. Function comparison proved the allocator and Arcade start owner
  unchanged; only the two Async default-configuration references changed.

**Rules assessment:** 251 games meets the implemented no-repeat-until-cycle-
exhaustion rule. It does **not** meet the separately agreed roughly 10000-answer
bank target. This is not a rolling 251-game or per-player guarantee: after a
shuffle boundary an earlier word can recur, and independent historical v1/v2
pools can share words. No stronger cross-version or numeric minimum repeat
interval is defined in the current rule/configuration source. The target was
not lowered. **Exact remaining vocabulary gap: 9247 to 10000.**

Evidence: `dev/five-alive/versioned-pool.proof.sql` and
`qualification.local/five-alive/hosted/vocabulary-v2-runtime-evidence.json`.
Two vocabulary integrity/preservation tests, three focused frozen-version adapter
tests, the full `npm run typecheck`, and a direct typecheck of the changed server
modules passed. No dependency or toolchain changes were needed in this pass.

**Resume point:** qualify additional familiar, fair answers toward the unchanged
target. The 255-word integration is complete; do not rerun the preserved proofs
unless their owners change. Five Alive remains withheld. No push, production
release or smoke was attempted, and existing worktree changes were preserved.

## November 15 bounded pass 4 — fixture, full-app Async, rejoin and deployment recovery

Supersedes the runback/typecheck/recovery blockers below. Completed proofs from
earlier passes were preserved, not rerun. Production was not read or mutated.

The disposable Quintzee `game_defaults` row was inserted on the isolated project
using the copied schema's 240-second default, also defined in
`20261028003718_quintzee_configurable_round_duration.sql`. Its generated config
equals `private.quintzee_v3_rules(240000)` exactly. No rules function changed.
Authenticated `delayed_capabilities` now succeeds. The actual Run It Back UI
restored Five Alive, seven-chip stake, fake money and the original opponent, then
sent invitation `8bce6613-a89d-42d0-9d99-8611200cb32b` with HTTP 200. An earlier
separate draft `e8e07cd2-6df4-4f9e-9b1e-76b5cdbc5498` also succeeded.

The actual `src/main.tsx`/App router, account gate, lobby, Async invitation and
game routes ran at 390x844 using real hosted Auth, Realtime and unchanged API
handlers through the isolated transport. Both accounts played ANGEL/CLEAR/THANK
through visible keyboard controls; each scored 2600. Native result review,
draw finale, second-viewer Run It Back and Back to Lobby all completed. The
destination is now the real platform lobby, not the earlier placeholder. There
were no page errors or attempted production-host requests. The unrelated email
verification reminder was dismissed; its initial dispatch endpoint is not mapped
in the harness (404), and no verification email was sent or evidence fabricated.
Arcade acceptance also completed through the real router: Resume restored run
`b1ce48c1-5b6b-4331-9cd0-25b4676ccc7b`; visible keyboard actions completed
LEAVE/DEPTH/FIELD for 3000 points. View Leaderboard returned to the actual
Five Alive leaderboard with the new result, personal best and rank #1. Screenshots
of the real finale and Arcade leaderboard were visually inspected.

Same-client Realtime proof passed with actual delivery, not subscription alone.
The full App kept its existing client and 15 active channels: the test channel
reported SUBSCRIBED -> CLOSED -> SUBSCRIBED and received later game revisions.
The separate SDK client also rejoined after complete socket closure and received
21 subsequent changes including the accepted invitation. Immediate last-channel
removal/rejoin reproduces an SDK close race: `connect()` intentionally returns
while disconnecting. No SDK patch or arbitrary reconnect delay was introduced;
the full-App persistent-connection and close-completed paths are qualified.

The deployed isolated pg_cron job invokes the actual
`private.delayed_words_recover()` owner every minute. pg_cron/pg_net were enabled
only in the isolated project; the copied dispatch URL was rebound from production
to the isolated project before scheduling. The first ticks correctly respected
the incident raised while the isolated heartbeat was absent. After inspection,
the canonical incident-close function resumed these synthetic Five Alive cases.
Cron run 3 (backend 297564, 20:59:00 UTC) then settled both preserved expiry
fixtures. Each has exactly one settlement. Runs 4 and 5 also succeeded and left
those counts unchanged. This is a scheduler-invocation proof; the earlier
financial/recovery matrix was not rerun. Five Alive expiry executes in this
database owner before any unrelated-game Edge dispatch.

`npm run typecheck` passed with exit 0 using the repository's intended
`tsc -p tsconfig.app.json --noEmit` script. The missing lockfile-pinned chess.js
1.4.0 now resolves through a junction to the already-installed matching package.
No download, dependency version, package manifest, lockfile or TS configuration
change was needed. The obsolete browser-only Chess alias was removed.

Evidence in `qualification.local/five-alive/hosted/`:
`quintzee-fixture-evidence.json`, `runback-invitation-evidence.json`,
`same-client-rejoin-evidence.json`, `deployment-recovery-evidence.json`,
`typecheck-evidence.json`, `full-app-browser-evidence.json`,
`full-app-network.private.json`, `full-app-finale.png`, `full-app-lobby.png`,
and `full-app-arcade-leaderboard.png`. The browser gate covers the full App with
real hosted services through the isolated test transport; it is not a Vercel
deployment smoke or physical iPhone test. Those release smoke checks remain
unperformed while the answer-volume gate withholds publication.

The 255 staged words additionally passed per-word frequency/source membership,
unique spelling/tier validation, 1530 solve-position cases, duplicate-letter
conservation, hidden-answer projection and shared solo/Async scoring checks.
A rollback-only 753-word candidate pool then passed 251 allocations spanning the
entire pool, 251 exact replays without cursor advance and frozen-bank rejection.
The candidate pool is absent after rollback. Reproduce with
`bun dev/five-alive/expansion.qualify.ts`, followed by the generated isolated
`vocabulary-v2-pool.sql`. Per-word evidence and candidate SHA-256 are in
`vocabulary-v2-evidence.json`. The runtime bank remains 498; the inactive combined
candidate is 753, still 9247 below 10000. It has no version-2 runtime loader or
configuration admission yet. No additional words were added to the active bank.

**Resume point:** answer-bank volume and versioned runtime qualification. Do not
repeat the completed fixture, invitation, full-App browser, same-client delivery,
scheduled recovery or typecheck proofs unless their owning code changes. The
approximately 10000-word target is not met: active 498 (gap 9502), inactive
candidate 753 (gap 9247). Do not promote more words without individual review
and source/rules/pool qualification. Do not silently replace the agreed target.
The immediate last-channel SDK close race above remains a documented boundary;
only the actual App's rejoin and a completed-close rejoin have passing evidence.

At close, the temporary cron job was unscheduled (zero active jobs), all three
test accounts and admission/recovery switches were disabled, and the Edge RPC
broker was replaced by a JWT-protected 410 response (version 4). Browser sessions
were signed out and the local server stopped. Observer counts are four isolated
settlements and two Arcade results: earlier browser fixtures plus this pass's
two deployment-recovery outcomes, Async browser draw and Arcade completion.
The candidate pool remains absent. The disposable Quintzee fixture, schema and
evidence are preserved. See `pass4-cleanup-evidence.json`. Production remains
untouched. No commit, branch integration, release build, push or deployment was
attempted; the existing branch still reports 55 commits behind origin/main.

## November 15 bounded pass 3 — matrix passed, admission still withheld

This entry supersedes the intermediate open-gate lists below. Resume at the
**authenticated runback invitation fixture gap**, then the answer-bank gate.
Do not repeat schema copying, Auth setup, overlapping settlement, the financial
matrix, or the hosted Arcade isolation proof. Production data and balances were
untouched; no production migration, release, integration or push occurred.

### Concrete evidence completed in this pass

- Real Realtime and browser gameplay evidence is recorded in pass 2 below.
  Native Async match home, saved child result and match finale also ran with real
  Auth. The first viewer correctly lacked Run It Back; after both reviews the
  second viewer received it. Back to Lobby navigated to the harness's platform
  lobby destination. The destination is still a placeholder, not full-shell proof.
- The financial matrix exercised actual canonical functions/triggers for both
  money modes: organizer win, opponent win, draw, forfeit, both-player timeout,
  two-child continuation, late replay and injected settlement interruption.
  Fourteen matrix observations passed. Invalid stakes (0, 10000 and 1.5), changed
  frozen stakes/money mode, outsider actions and authenticated direct access to
  service-only commit authority were rejected. Assertions checked actual player
  chips, transfer UUID endpoints and opening/closing balances, immutable outcomes,
  settlement, final snapshots, game result, terminal lifecycle and duplicate
  finalization. Real mode produced two canonical account postings (including
  zero-valued tie postings); fake mode produced none. Deferred constraints were
  forced before checking. All financial matrix changes rolled back.
- Zero-client recovery invoked the actual durable database recovery owner.
  After it settled both synthetic money-mode cases inside one transaction,
  backend 294366 was terminated while retaining that uncommitted work. The tool
  returned PostgreSQL 57P01. A new transaction retried recovery: each case had
  exactly one settlement and one seven-chip batch, with zero/two account postings
  for fake/real money. Another recovery call preserved those counts. The retry
  proof rolled back. This proves the database worker; it does not qualify a
  deployed cron/Edge invocation, because scheduled jobs were never copied.
- Hosted Arcade isolation used statement guards on 244 public/private tables
  and per-run row guards on four Arcade lifecycle tables. Unrelated writes were
  rejected. Completion, injected result-write failure and retry, action replay,
  leaderboard and successor admission passed. The target produced one 3000-point
  result. Players/postings/batches/other results stayed 2/0/1/1 before and after;
  the transaction rolled back. No unrelated Arcade result or financial row changed.

Evidence directory: `qualification.local/five-alive/hosted/`. Preserve
`matrix.sql`, `matrix-evidence.json`, `matrix-fixtures.private.json`,
`recovery-left.sql`, `recovery-retry.sql`, `recovery-evidence.json`,
`arcade-isolation.sql`, `arcade-isolation-evidence.json`, `lobby-evidence.json`,
`capability-blocker.json`, and `runback-blocker.png`. The reproducible matrix
builder is `dev/five-alive/hosted-matrix.mjs`. Private fixture/session files are
local-only and must not be staged.

### First open gate and remaining limits

The real second-viewer Run It Back link opens the actual invitation component,
but its authenticated `delayed_capabilities` RPC fails with **P0002, query
returned no rows**. The database stack is `private.quintzee_default_rules()`
line 4 -> `chess_prior_delayed_capabilities` -> `delayed_capabilities`.
`delayed_history_detail` succeeds and reports `runbackEligible=true`.
This is a missing isolated rules fixture exposed by schema-only copying, not a
database-login/tool limitation or permission request. Next pass should retrieve
the isolated function definition, seed the required nonfinancial rules from the
checked-out canonical configuration, and resume the invitation flow. Do not copy
production application rows. Full platform-lobby rendering, normal deployment
transport, and physical iPhone acceptance remain unqualified. Same-SDK immediate
removeAllChannels/rejoin also remains unresolved; the fresh-client and browser
offline/reload reconnect paths passed.

The runtime bank remains **498**, a **9,502-word gap** against 10,000.
`server/fiveAlive/answers.expansion.review.csv` now records **255** individually
reviewed additional familiar candidates, each with an ordinary meaning and
proposed tier. All are unique five-letter words in the pinned guess list and
previous frequency-evidence candidates, with no overlap with the existing bank.
Their combined editorial count is **753**, still **9,247 short**. They are staged,
not runtime-qualified: the immutable version-1 bank, rules/configuration, pool
hash and isolated database pool were not changed. This pass does not establish
that roughly 10,000 fair familiar five-letter answers exist. Do not pad the bank
or lower the agreed target silently. Evidence: `vocabulary-expansion-evidence.json`.

The peer-revision correction passed four focused async tests and nine shared
rule tests. Full typechecking remains incomplete: `bunx tsgo --noEmit` could not
resolve the missing tool; installed TypeScript reports three missing `chess.js`
module errors in existing Chess paths. No dependency was installed. The browser
harness reused an already installed matching chess.js 1.4.0 outside this worktree.
Final tracked diff whitespace check passed. Existing unrelated changes remain.

At pass close, all isolated test accounts and Five Alive/Async admission and
recovery switches were disabled. The temporary RPC broker was replaced by a
JWT-protected 410 response (version 2), browsers signed out/closed and the local
server stopped. Observer counts were one settlement, two players, zero account
postings, one transfer batch and one Arcade result: solely the completed isolated
browser fixtures. Matrix and isolation proof results did not persist. Synthetic
fixtures and evidence are preserved for resumption. The game remains withheld.

## November 15 bounded pass 2 — Realtime and browser evidence

Preserved the completed schema copy, Auth provisioning and overlapping settlement
proofs. Reused the same isolated project/accounts. Real Realtime delivered ten
revision updates to each participant and none to the outsider. Acceptance and
action replay left event counts unchanged (2/2/0 before and after the action
replay). A fresh authenticated reconnect restored the same revision and received
subsequent changes. Actual browser offline/reload recovery also passed. The
earlier `slot_changes_count` error was historical: catalog inspection showed the
managed function already updated, so no Realtime schema repair was made. An
immediate same-SDK removeAllChannels/rejoin timed out; fresh-client reconnect and
the actual browser reconnect succeeded. No claim is made that the SDK reuse case
is fixed.

Chromium at 390x844 used actual FiveAliveSession/Board, unchanged API handlers,
shared game services, real hosted Auth and Realtime, and hosted PostgREST through
an expiring secret-protected isolated Edge RPC broker. No synthetic tokens or
event stream were used. `dev/five-alive/hosted.server.mjs` runs this transport;
production-host fetches are explicitly blocked. The first harness preflight used
Vite's externalized SDK and returned 401; explicit SSR substitution corrected
that test transport before gameplay qualification.

The browser exposed a real pre-load peer-revision race. The service now consults
the player's immutable command-receipt revision from the service-only load RPC.
Peer-only changes within the same segment are accepted; own-progress, future,
missing-evidence and earlier-segment requests remain rejected. The formerly
rejected captured command then committed once. Four focused async tests and nine
shared rule tests pass. The installed candidate correction exists only in the
isolated project; no production code or schema was published.

Browser evidence covers private answers/guesses before mutual reveal, independent
submission, real peer-triggered refresh, wrong-guess reload, offline/reconnect,
three-word Async results and Arcade completion/leaderboard return. Missing Auth
returned 401; outsider identity spoofing returned 409. No browser page errors.
Evidence: `qualification.local/five-alive/hosted/browser-evidence.json`,
`browser-network.private.json`, `authenticated-async.png`, `authenticated-arcade.png`.
The Async return route in this test harness is a placeholder, so full real-lobby
continuation remains open. Physical iPhone acceptance remains unperformed.

Next open gates: full hosted financial/recovery matrix and Arcade isolation,
full authenticated lobby continuation, answer-bank qualification. Admission is
still withheld. Later pass entries supersede this intermediate checkpoint.

## November 15 hosted continuation — admission remains MISSING

The current checkout is `C:/Users/jerem/.codex/worktrees/five-alive/rule-your-poker`,
at `f8aa84630a3360dd94e73dd303ca02b1761dd48f` with the existing uncommitted candidate.
The branch is behind the recorded origin/main by 55 commits; no integration,
production migration, push or deployment was attempted.

Used only production PostgreSQL catalogs on `xvhmbuppghwmwpwrkzao` to retrieve
definitions. No production application rows were queried, and no production
game or financial functions were invoked. Copied schema-only DDL to isolated
project `tyuxxkalhqbqkbvvkcfx`: 253 public/private tables/views, 1,214 functions,
enums, sequences, constraints, indexes, triggers, policies, RLS, grants and
Realtime publication membership. No production rows or scheduled jobs were copied.
All 1,214 function bodies match the retrieved preimage. The structural comparison
matched tables, constraints, indexes, triggers, policies and RLS; identified
column grants were then restored. Null ACLs versus explicit PostgreSQL default
owner/PUBLIC ACLs are representation differences, not additional privileges.
The actual financial trigger counts are 39 on players, four on
player_transactions and three on gameplay_transfer_batches.

The isolated installation exposed stale candidate preimages from the Chess
release. Registration now retains Chess in the child constraint and extends
`private.chess_prior_delayed_capabilities()` while preserving its public wrapper.
The lobby score anchor retains Chess, and Five Alive availability respects the
existing status, hold and deadline conditions. These are local candidate changes,
not production changes. Candidate installation succeeded only on the isolated
project. Earlier installation attempts rolled back on explicit preimage guards.

Three disposable isolated accounts successfully authenticated through the real
Supabase password endpoint. Accounts were provisioned with isolated Auth users
and identities after public signup rejected test email/rate limits. Actual
authenticated PostgREST create/accept produced four test matches. All three
Realtime channels subscribed, but no change events were observed; subscription
alone does NOT qualify Realtime or privacy. No authenticated browser gate passed.

Actual shared TypeScript Five Alive reducers generated final submission payloads.
Two independent `supabase_execute_sql` transactions exercised final submission,
canonical settlement and duplicate replay in both fake and real money. Batching
tool promises within one execution serialized the calls and was NOT accepted as
race evidence. Separate pending execution cells produced real overlap:

- Backend 289812 began at 19:20:14.020676 UTC, completed financial assertions at
  19:20:14.154977, retained its transaction for eight seconds, then rolled back.
- Backend 289813 began at 19:20:16.674339 UTC while that transaction remained
  open, attempted the same final submissions after one second, and completed at
  19:20:22.292684 after the first rollback. Duplicate calls within the second
  transaction preserved one settlement; it also rolled back.
- Each money mode asserted organizer/opponent chips +7/-7, one outcome, one
  settlement, one balanced seven-chip transfer batch, two exact final snapshots,
  one result and terminal session/match status. Real mode had two canonical
  account postings; fake mode had none. Deferred financial constraints were
  forced before assertions. The first rehearsal omitted that forcing and failed
  its ledger assertion; it was not treated as passing evidence.
- After rollback, settlements, players, account postings, transfer batches,
  final snapshots and game results all had zero rows in the isolated project.

Catalog export query: `dev/five-alive/catalog-export.sql`. Ignored local evidence:
`qualification.local/five-alive/hosted/catalog.production.json`, `evidence.json`,
`submission-left.sql`, `submission-right.sql`, and fixture records. Private account
and session files in that directory must never be committed. Test clients were
closed and signed out; isolated accounts and admission were disabled at checkpoint.
The schema and four synthetic matches remain for continuation.

Stopped at the repository's 100-tool-call circuit breaker. This is not a database
credential or SSL blocker. Still required: complete hosted winner/tie/authorization/
failure/continuation matrix; worker interruption/retry; Arcade write isolation;
Realtime delivery/privacy; authenticated browser acceptance; answer qualification.
The answer bank remains exactly 498, with no padding or new claimed familiar words.
The roughly 10,000 target is unresolved. Production release and smoke remain held.

The earlier local-only limitations below are historical and are not a request to
configure another database stack or credentials.

**Admission gate: MISSING.** The catalog remains withheld. This is the
uncommitted `codex/five-alive` candidate based on
`698ab0e5d4273ec8c72b1208714753419fc189a6`, not a release commit. No migration,
publication or deployment was performed.

## November 13 continuation — admission still MISSING

Read-only comparison against the hosted project found identical definitions for
eight checked owners: delayed expiry, finalization, outcome recording and local
recovery; Arcade commit; canonical transfer settlement and batch finalization;
and account-result recording. It also found material schema differences. On
`public.players`, the local proof template has 29 non-internal triggers while
hosted has 39. On `public.player_transactions`, the local template has none
while hosted has four. On `public.gameplay_transfer_batches`, local has five
triggers while hosted has three, and the three index definitions have different
aggregate hashes. Private delayed receipt/outcome/settlement index and trigger
hashes and the snapshot trigger hash matched. Several other idle local clones
were inspected and did not provide that hosted trigger preimage. The earlier
local financial proof is therefore not a schema-matched release proof.

`node dev/five-alive/concurrency-rollback.proof.mjs` passed against the same
disposable local template in both money modes. On independent connections, a
competing final submission was observed blocked on the first transaction; the
first connection was then closed without commit, the second settled once, and
duplicate replay left one receipt. A zero-client recovery invocation was also
interrupted by closing its database connection, and another invocation retried
and settled once. In both cases the financial work was inspected within the
second transaction and rolled back, and the observer saw no settlement artifacts
before or after. Synthetic setup and candidate SQL existed only in the disposable
clone, which was dropped. This is supplemental to the earlier sequential
rollback proof, not the requested single complete schema-matched proof.

`node dev/five-alive/isolation.proof.mjs` passed locally with statement-level
guards on 160 non-Arcade public/private tables, including session, player,
transfer and account tables. Start, completion, an injected result failure,
replay, leaderboard, successor and abandonment caused no guarded writes; the
candidate DDL, guards and synthetic accounts were rolled back. The financial
schema mismatch still prevents treating this as the full release isolation gate.

Actual local Supabase Auth and Realtime could not be exercised: PostgreSQL alone
was listening at `127.0.0.1:55439`; the standard local Supabase service ports
were not listening, no Supabase CLI was installed, and Docker reported its
`dockerDesktopLinuxEngine` pipe missing even after an attempted hidden launch
of the installed Docker Desktop. No dependency was installed, migration run,
or hosted account used as a substitute. The browser proof below remains
synthetic Auth/Realtime evidence only.

The independent frequency audit is `dev/five-alive/frequency.audit.py`; its
Lingevo/OANC source, license, build version and SHA-256 are recorded in
`server/fiveAlive/WORD_SOURCES.md`. A commonness and genre screen followed by
conservative morphology/name filters yields 697 candidates, including 350
existing answers and 347 unqualified new candidates. Deterministic sampling
and edge checks show that variants, sensitivity and difficulty still need
qualification. No answers were added: the qualified total is still 498, and
the approximate 10,000 target remains an explicit open gap.

Next qualification needs a disposable, current schema-matched local Supabase
stack with genuine Auth and Realtime and no automatic migration execution. Run
one complete rollback-contained financial proof against that preimage, rerun
Arcade isolation and the authenticated browser flow there, and continue the
evidence-based answer review before considering admission.

## Financial evidence

`node dev/five-alive/financial.proof.mjs` passed against candidate SQL loaded
inside a transaction in a disposable clone of local template
`coordinated_scores_1794288498120`. The clone's older child-game constraint
was brought to the previously observed nine-game preimage inside the rolled-back
transaction. No candidate DDL or synthetic financial rows remained after the
rollback; the disposable database was then dropped. This is not evidence that
the candidate is installed or that the clone matches current hosted authority.

For each money mode, actual Five Alive server reducers and the existing delayed
commit, outcome and finalizer owners covered organizer and opponent wins, draws,
single and double timeout, frozen stake and money-mode rejection, member and
service-role boundaries, duplicate and late command replay, and a two-child
match with successor isolation and one net settlement. The proof asserted exact
per-player chips, transfer-batch endpoints and balances, account postings, game
result and post-settlement snapshots. An injected failure before settlement
receipt insertion, after canonical financial writes, left no partial game,
outcome, ledger, account or snapshot rows; retry completed once. The first two
attempts exposed test-harness assertions for JavaScript negative zero and the
two-outcome continuation case; both were corrected before the complete run.

Prior separate independent-connection evidence is in
`dev/five-alive/races.proof.mjs`; it is supplemental, not a substitute for the
rollback proof. The complete release gate is still missing a documented
rollback-contained independent-connection/settlement proof covering all required
cases, interruption and retry of the durable recovery worker, verification of
current hosted financial definitions and indexes against the proof environment,
and authenticated terminal/continuation acceptance. The Arcade nonfinancial
release proof, including complete multiplayer/financial write isolation, also
remains required.

## Browser evidence

`node dev/five-alive/browser.proof.mjs` passed with two separate browser
contexts, actual Arcade and Async API handlers, Five Alive services, and a
disposable local PostgreSQL clone. It checked token absence/invalid token and a
forged actor, pre-reveal answer and guess secrecy for both players, reload and
reconnect, independent submissions, mutual reveal and unlock, three-word final
results, and the real Arcade leaderboard route. Auth identities and Realtime
revision notifications were local fixtures, not actual Supabase Auth or hosted
Realtime. Genuine authenticated end-to-end, disconnection/recovery and physical
device acceptance remain open. Screenshots are local ignored evidence under
`qualification.local/five-alive/browser/`.

The preceding phase's final build passed 4,049 app tests, 241 harness tests,
46 tooling tests, TypeScript and the size gate; its lint comparison added no
diagnostics to the existing baseline. This phase changed only proof/audit files
and documentation; targeted lint on the new browser and financial harnesses
passed. No broad gate was repeated.

## Vocabulary

The answer bank remains 498 individually reviewed, tiered entries. The pinned
ESDB size-70 conservative metadata screen yields 5,291 candidates, including
all 498 already reviewed; 4,793 are unreviewed and **not** approved answers.
Even the filtered sample includes proper names, plurals and obscure terms.
See `server/fiveAlive/WORD_SOURCES.md` and
`dev/five-alive/vocabulary.audit.py` for exact filters and counts. The roughly
10,000-answer target is an open product gap; the conservative screen is not an
upper bound on every potentially familiar English word.
