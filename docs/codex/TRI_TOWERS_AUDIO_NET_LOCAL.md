# Tri-Towers responsiveness/audio and async Current Net — local checkpoint

October 31, 2026. **Local only; no publication authorization for this worker.**

Worktree: `C:/Users/jerem/.codex/worktrees/f199/rule-your-poker`.
Branch: `codex/tri-towers-audio-net-polish`.
Base: `2cbca79af6896e8e08e7db22c66de0b27183d562`.
The coordinator reports recovery production/main at
`b64a2d75be9cd2997dfe25a2feef38ea14f8231f`, receipt `41151251116-2`.
This worker inspected that Git delta but did not independently query production.
The base and all other worktrees remain unchanged.

## Correction and preservation

- `TriTowersBoard` no longer mounts `useTriCardFlight`, its 120 ms flight, or
  its associated swoosh. The confirmed upcard is visible in the same render.
  Intro dealing/flipping, exposed-card effects, input buffer, action validation,
  scores, clocks, result hold and completion ownership are unchanged.
- `useTriTowerClearAudio` observes confirmed, continuous same-round tower deltas.
  Clear order (not the physical left/middle/right position) selects a subtle
  360 ms lower trill, then a higher 620 ms two-voice trill. The unchanged
  `useTriRoundPresentation` owns the existing full third-tower celebration.
  No additional third cue is created. Multiple newly observed clears are handled.
  Initial/historical mounts, recovery epochs, inactive/paused views, background,
  offline interruption, reduced motion and read-only replay suppress the new cues.
  A high-water mark prevents regressive snapshots from replaying earlier clears.
- Both new sounds use `platformAudio.follow`, its per-user event receipts,
  preferences, cancellation, expiration and trusted-gesture unlock. No new audio
  context, gameplay timer, action delay, optimistic authority or lifecycle owner
  is introduced in product code. Like the existing fanfare, the short cues leave
  5 ms of scheduling headroom so a moving audio clock cannot reject their deadline.
- `CurrentNet` shows `$x unsettled` beside the heading and one player per row.
  Names truncate visually where necessary while retaining their full text/title;
  signed amounts remain intact. The existing projected `home.net`, `home.unsettled`
  and legacy unsettled fallback are preserved exactly. Hidden result, settlement,
  invitation and notification logic is untouched.

Shared callers inspected: multiplayer `TriTowersView`, Arcade `SoloTriTowers`,
async `DelayedTurn` and saved `ResultReview`. None of those adapters was edited.
The former flight helper remains unused; no unrelated cleanup was included.

## Final local qualification

- `node dev/tri-towers/polish-tests.mjs`: **139/139 tests, 17 files**.
  Includes existing engine, buffer/rejection/recovery, round presentation,
  all-clear audio, multiplayer lifecycle and async completion tests; new tests
  cover clear-order escalation, batched clears, duplicate/regressive snapshots,
  mount/scope/epoch changes, pause, mute, locked browser audio, reduced motion,
  history and an advancing audio clock.
- `node node_modules/typescript/bin/tsc --project tsconfig.app.json --noEmit`:
  **PASS**. Used the already-installed compiler; no packages were installed.
- Vite production build to `qualification.local/tri-polish/build`: **PASS**,
  3,119 modules; existing Browserslist and chunk-size warnings only.
- Final component preview: **14 browser scenarios PASS**, Edge, at 320×740,
  390×844, 844×390 and 1440×900. Actual board, canonical shell and input buffer,
  with local synthetic HTTP confirmation/rejection. Covers immediate upcard,
  rapid actions, duplicate delivery, reconnect, mute, reduced motion, history,
  third celebration/count/hold, and long names/large signed net values.
- Compiled App: **4 browser scenarios PASS**, 320/390/1440 widths and both viewer
  projections. Actual auth handling, lazy route, match home, async adapter,
  canonical board and audio manager; HTTP responses are synthetic and WebSockets
  are blocked. Three actions reach completion once and preserve the eight-second
  clear/result sequence before returning to match home. Opponent scores stay
  hidden. Current Net is three distinct rows, approximately 101 px high, with
  no amount overlap or horizontal overflow. Phone/desktop screenshots inspected.

The final component results were regenerated after the wrapper/CSS/row-assertion
correction. Earlier results from October 30 do not certify the final candidate.
Full-App qualification initially stopped at synthetic login: the local bundle's
configured URL is the retired `ehccrxumpibuoehfsmms` source. The fixture now derives
the auth storage namespace from that exact bundle. Every backend request is
fulfilled locally before network I/O; no source/production backend was contacted.
No environment settings were changed. **Do not publish this local build artifact**;
the release owner must build using the production environment after integration.

Evidence: `qualification.local/tri-polish/{tests.log,typecheck.log,build.log,
browser-results.json,app-browser-results.json}` and phone/desktop PNGs.
Tracked digest manifest: `dev/tri-towers/polish-evidence.json`.
Scripts use caches under this worktree and the existing installed dependencies.

Audio proof is programmatic: real browser Web Audio source scheduling and canonical
receipt/deduplication checks, plus unit scheduling tests. Headless Edge is muted.
No physical speaker/iPhone/Safari audition or production smoke is claimed.

## Review and handoff

Product edits are limited to the shared board, a dedicated audio hook/cue, a
dedicated net component/style and two small `Delayed.tsx` hunks. Internal review
covered React hook dependencies/cleanup, authoritative identity, existing audio
ownership, accessibility, scope, generated files and secrets. No migrations,
financial calculations, auth changes, dependencies or release configuration changed.

Recovery changed `src/hooks/useTriTowers.ts`; this patch does not touch it.
Web Push currently adds imports and a `PushPreferences` control in `Delayed.tsx`;
retain those alongside the `CurrentNet` import and replacement. No Web Push files
or permissions were changed. `CURRENT_RELEASE.md` may need additive reconciliation.
The release owner must validate the combined candidate against then-current main.

Sole release owner: transition task `01a18430-0c6a-72cd-91cf-053e7998f001`.
No push, main integration, deployment, production migration/admission/settings,
customer balance/session/ACK change or release-lock acquisition occurred here.
Publication remains that owner's separately authorized decision; a no-player
window does not authorize publication by this worker.

Local preview while the owned process is running:
`http://127.0.0.1:15413/` and `http://127.0.0.1:15413/?net=1`.
Restart: `node dev/tri-towers/polish-preview.mjs`.
Complete browser rerun: `node dev/tri-towers/polish-browser.mjs --serve`.
Only full-App rerun: add `--app-only`. Stop the existing owned preview first to
avoid a port collision. `--serve` intentionally keeps the preview process alive
after assertions; the JSON result files distinguish assertion success from host
process timeout/termination. Do not repeat passed suites solely for that timeout.

Owner acceptance: play consecutive legal cards on phone/desktop, listen to all
three clear intensities with sounds on and then muted, pause/rejoin without old
trills, and inspect Current Net with a long name. Physical audition remains pending.
