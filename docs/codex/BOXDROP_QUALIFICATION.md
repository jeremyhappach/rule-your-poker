# Boxdrop / 1 qualification — 2026-10-20

The approved version and Ptown adaptations are frozen in `BOXDROP_RULES.md`.
One SQL reducer owns the four scales, six-place FIFO, uniform fresh values,
deadline precedence and every score component. There is no browser scoring
authority. Both adapters use it; only participant/round orchestration differs.

## Completed local evidence

- `node dev/boxdrop/proof.mjs`: exact-slot precedence, all closure awards,
  full/overloaded retirement, 67,800 base all-clear, FIFO rotation and fresh-draw
  accounting, all amendment A–F cases, 401 speed boundaries, timeout precedence,
  all four multiplayer bonus-qualification schedules, Arcade qualification/reset,
  20 autonomous bot rounds, visible-input cross-mode parity, pause/resume,
  autonomous bot admission/action, and zero-client progression.
- The rollback proof exercises actual canonical chips, transfer batches, results,
  immutable final snapshots, winner/tie, terminal hold, Session Ended, continuation,
  authorization, duplicate/stale/late replay, and Arcade zero financial writes.
- `node dev/boxdrop/concurrency.mjs` and `--real`: competing commands, replay
  conflict, spectator rejection, concurrent settlement, Arcade receipt/timeout
  races, and an injected failure after chip updates. Failure rolls back chips,
  result, journal and snapshots; success produces one transfer and balances 91/109.
- Existing deployed finance and consent function hashes match the isolated
  qualification authority. The five shared registration reference definitions
  match deployed definitions after CRLF normalization. Migration guards retain
  exact deployed hashes, so a concurrent authority change blocks installation.
- `npm run build`: TypeScript, 2,530 application tests, 241 harness tests and Vite
  build passed. `bunx tsgo` was unavailable; the installed TypeScript compiler ran.
- `node dev/boxdrop/browser.mjs`: actual SQL-backed browser placement, full FIFO
  rotation, reload, both Arcade rounds, leaderboard return, four multiplayer turns,
  observer redaction and terminal continuation passed.
- `node dev/boxdrop/audio.mjs`: trusted-click Arcade → multiplayer → Arcade
  placement audio passed with one running shared AudioContext.
- `node dev/boxdrop/layout.mjs`: 112 scene/viewport checks passed at 320×568,
  390×844, 430×932, 844×390 and 390×664, including 120% text and simulated safe
  areas. Screenshots include all requested machine states and were inspected.
  Narrow two-player score overlap was corrected.

Evidence logs and screenshots are under `qualification.local/boxdrop/`.
Browser automation used installed Chromium/Edge; physical iPhone Safari and
speaker behavior remain Jeremy's production smoke acceptance.

## Release sequence

The guarded authority migration `20261020161756_boxdrop_v1` was installed with
admission closed. The complete deployed rollback proof passed, including the
bot/pause and cross-mode cases; no synthetic Boxdrop runs or matches remained.
Arcade recovery worker version 10 is ACTIVE and its dispatch health is current
with no recorded failure. Client publication and activation remain ordered below.

Install the guarded authority migration with admission closed; execute
`installed-proof.sql` inside BEGIN/ROLLBACK and verify no synthetic rows remain.
Publish the bundled Arcade recovery worker and the reviewed Git commit.
Verify the production deployment before executing the separate activation SQL.
The activation installs canonical fullscreen defaults and enables both admissions.
Never activate from local UI tests alone.

## Focused iPhone smoke

Start Arcade, check four readable scales in both orientations, and tap/recycle
rapidly. Fill the FIFO and confirm oldest-first white returns. Verify an exact 32
raises the scale and an exact 21 closes it. Bank before any 32 and confirm only
partial points; bank after a 32 and observe the centered score count. Background,
return and reload. Play a two-player match against a bot, pause/resume, confirm
chips and Run Back consent, then return to Arcade and verify sound.
