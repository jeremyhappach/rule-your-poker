# 11 Up local polish — November 9, 2026

Local review only. Branch `codex/eleven-up-local-polish`, based on main
`97372c3b0`. No push, main integration, hosted preview, migration, production
write or deployment is authorized. Jeremy will separately clear publication
after the November 10 storage check. Bridge Run and the source checkout are
untouched.

## Dedicated physical table revision — November 9

Jeremy rejected the previous perimeter-border render as visually missing the
table and crowding the rack. The border/pocket pseudo-elements are replaced by
`ElevenTableBackdrop.tsx`, a noninteractive decorative layer inside the existing
playfield. Its full walnut side/end rails, beveled green cushions, six recessed
pockets and warm light are visible below the HUD and around the live rack and
return cradle. The art contributes no layout dimensions and owns no game state.
Shorter contact shadows separate adjacent balls without altering their art
diameter, rack coordinates, spacing or hit targets.

The original full-rack geometry is retained; no balls or controls were moved
to accommodate the art. Browser checks at 320×568, 390×844 and 430×932 prove
the complete table/rail/pocket bounds stay inside the viewport, every ball's
center and four interior points resolve to its own button, and the expanded
selection-ring envelope remains at least 5.05px clear of actual rail, cushion
and pocket bounds. Disabled Take Score, return cradle, full-rack scoring and
existing sound guards remain intact. The 390×844 screenshot matches the last
shared local portrait viewport: `evidence/table-backdrop-390.png` below
`dev/eleven-up-local/`. Source rendering uses offline sample state, as before.

61 focused tests, TypeScript, production build, the existing browser/audio
proof and twelve exact baseline-geometry comparisons pass. Physical iPhone
acceptance and Jeremy's visual table/spacing approval are pending. Stop here
before another polish pass. All changes remain local; no publication occurred.

## Earlier full-board reference follow-up — superseded backdrop

Jeremy's emerald billiards mockup is the layout/material reference. Its printed
balls, score, labels and controls are not used as an image overlay. The shared
production view continues to project every ball, score, legal action, timer,
selection and disabled control from its existing state. No rules, transport,
audio or score-animation implementation changed in this follow-up.

Straight, slim wood rails and four corner pocket mouths remain at the shell
perimeter. Felt uses a small procedural SVG grain tile and warm light/shadow;
there is no fixed-screen background or additional board. Covered ball contrast
is improved without enabling covered balls. The current ball occupies a separate
wood/brass return cradle beside Pass. Its button geometry is unchanged.

The default local URL now opens the full 22-ball Ready sample with score zero,
30 draws, the three legally exposed balls, and disabled Take Score. Pass feeds
the next sample state and enables Take Score. To revisit the original sparse
scoring/landing fixture, append `?rack=sparse`; `?phase=playing` opens the full
rack directly in Playing. These remain offline response fixtures, not an
authenticated backend game.

`node dev/eleven-up-local/full-rack.mjs` passed at 320×568, 390×844 and 430×932.
All 22 targets are unobstructed at their center and four interior points; no
ball target overlaps another. Their unchanged diameters are 32.91, 40.61 and
45.00 pixels respectively. The minimum clearance beyond the outer 5px selection
ring and decorative perimeter is 10.99px. Only the three legally exposed full
rack balls are enabled. Real touch events select/deselect an exposed ball;
disabled Take Score submits nothing. The cradle stays separate from Pass and
the timer. Full-rack count-up retains all 22 balls, displays its breakdown,
and returns the same pill to the header.

Updated evidence: `full-rack-320.png`, `full-rack-390.png`, `full-rack-430.png`,
matching `full-rack-selected-*.png`, `full-rack-scoring-390.png`,
`full-rack-returned-390.png` and `full-rack.json`, all under the ignored local
evidence folder. The original browser/audio proof and twelve full-rack baseline
geometry comparisons also pass, alongside 61 tests, TypeScript and local build.
Physical iPhone Safari/speaker acceptance is still pending. Publication remains
held; no hosted preview, push, migration or deployment occurred.

## Launch

The isolated worktree is:

`C:\Users\jerem\.codex\worktrees\eleven-up-local-polish\rule-your-poker`

In PowerShell:

```powershell
Set-Location C:\Users\jerem\.codex\worktrees\eleven-up-local-polish\rule-your-poker
node dev/eleven-up-local/serve.mjs
```

Open <http://127.0.0.1:5198/dev/eleven-up-local/index.html>. The server binds to
loopback only and uses a dedicated port. Existing installed dependencies are
reused through a local node_modules junction; nothing was installed.

This offline review mounts the production 11 Up view, canonical fullscreen
shell, Sounds control, and real AudioManager. It feeds explicit sample
responses; it is not a second game engine and does not connect to a database.
Sounds preference changes in this review are local to this browser.

For the original `?rack=sparse` review, tap a ball repeatedly to select/deselect. Pass places the sample incoming ball
on the felt after the simulated response. Take Score demonstrates 25,200 →
31,200, including Elevens +1,000 and Speed +5,000. The fixture then provides
round two; Take Score again reaches the existing final-results surface and
Leaderboard button. The destination is a clearly labelled local placeholder.
Reload to repeat. Rules and Abandon remain available.

## Implementation boundaries

- Shared view call sites: ElevenUpGame (Arcade) and ElevenUpTable (live
  multiplayer). Styles are scoped to 11 Up. No shared shell, other game's
  presentation, transport, RPC, financial owner or rule implementation changed.
- Felt texture, overhead light, wood/cushion edge and ball shadows decorate
  existing geometry. Numbered art, ball coordinates, diameters, hit targets,
  timer and controls retain their owners and dimensions.
- Select/deselect cues originate only in accepted tap handlers. Unique event
  IDs go through the existing audio manager and Sounds preference. A 350ms
  audio admission window accommodates initial context unlock; expired,
  muted or hidden events cannot catch up later. The existing earned-eleven
  confirmation ding remains separate from tap feedback.
- Landing compares same-scope committed snapshots: the prior incoming ball
  must newly occupy a felt slot. Audio begins at that visible commit, without
  a speculative Pass cue or delayed animation timer. Identity includes scope,
  revision, ball and slot. Mounts, recovery, pause and hidden surfaces suppress
  catch-up. No new cue is triggered by a board rerender.
- One persistent score pill follows Arcade's home-slot/translation pattern and
  existing useTriRoundPresentation admission, count audio and recovery guards.
  Within the existing five-second result hold: center in 250ms, count from
  700–3300ms, hold the settled score for 900ms, return by 4500ms. Frozen
  all-clear celebration time is prepended when present. Reduced motion shows
  the settled score without movement or count audio. No presentation callback
  advances a round or submits a score.
- Take Score and Pass now share the existing synchronous submission latch
  with grouping. The transport's immutable UUID/revision request and server
  authority remain unchanged. Final results and leaderboard routing retain
  their existing production owners.

## Actual validation

- TypeScript: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`
  passed. Installed tsgo was unavailable; no dependency installation attempted.
- Focused Vitest: all **61 tests** across six 11 Up files passed. Includes rapid
  select/deselect, muted cues, simulated cold audio unlock, confirmed placement
  deduplication, recovery/scope/pause suppression, repeated score submission,
  count/hold/return, reduced motion, frozen clear timing, and existing transport,
  bot, timer, terminal and contract regressions.
- Local Vite production build passed. Existing bundle-size, mixed-import and
  stale Browserslist warnings remain.
- Chrome browser proof: `node dev/eleven-up-local/browser.mjs` against the
  running review server passed. Four layouts: **390×844, 320×568, 430×932 and
  844×390**. Balls, timer and controls are contained; primary controls retain
  at least 44px dimensions; no page overflow.
- Twelve full-rack layouts (the same four viewports × one, two and seven
  players) compared every ball's bounds to base commit CSS. All 22 balls per
  case match within 0.5px; no page overflow.
- Browser audio: eight rapid select/deselect interactions produced eight
  distinct scheduled cues. Muted selections produced no scheduled audio.
  One placement produced one landing cue despite repeated rerenders.
  The fixture reproduces the normal game-entry unlock gesture before cue
  measurements. OfflineAudioContext also rendered all three cues: nonzero,
  unclipped waveforms with distinct signatures and greater landing energy.
- Browser score flow: one submission for three immediate Take Score clicks;
  exact board-center pill position; intermediate count; compact bonus lines;
  settled total retained centrally; return to original header coordinates;
  second round and final Leaderboard action. No browser errors or external
  requests were observed.

Evidence is generated under `dev/eleven-up-local/evidence/` (local, ignored):
`browser.json`, `gameplay-iphone.png`, `selected-iphone.png`,
`landing-iphone.png`, `scoring-iphone.png`, `settled-iphone.png`, and
`returned-iphone.png`.

These are offline component/response-fixture and desktop Chrome viewport
proofs. No authenticated backend game, physical iPhone Safari speaker test,
live multiplayer session or production smoke was performed. Actual iPhone
sound timbre and first-unlock latency remain part of Jeremy's local review.
