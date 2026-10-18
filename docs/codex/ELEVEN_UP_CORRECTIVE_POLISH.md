# 11 Up corrective polish — 2026-10-18

Jeremy requested implementation and publication of the bounded corrective brief.
Checkpoint: `eleven-up-corrective-polish-2026-10-18`. Physical iPhone/Safari
acceptance in production remains with Jeremy.

## Failure boundary and correction

The prior polish (`01e62c0b1cd04356d710778cdc180dff4059a9e7`) expanded the rack and
remapped its rows across the new height. Its collision checks passed without
checking the original proportions. The source before polish, `28d90e7c2`, is the
geometry reference: original `ballPosition` percentages, rack inset
`15% 1% 38%`, and diameter `min(11cqw,12cqh)`. These formulas are restored exactly
within the available felt. No enlargement or row remapping remains. Historical
container responsiveness is retained; extra whitespace does not spread the rows.

The old scoreboard lived in the shell score slot while Take Score occupied the
board below. All three now occupy one band in the existing canonical interaction
layer: plain Round left, score group centered in the entire viewport, Take Score
right. Navigation remains separate. Jeremy's follow-up requests two-player pills
stacked vertically; each retains its name, score, balance and active distinction.
For 3–7 players, the central group scrolls horizontally, places the active UUID
first, and resets its scroll position when the active player changes. Canonical
player order and financial identity are untouched. Session Ended retains scores
and retires the playfield and gameplay controls.

`CountdownDots` extracts TriTowers' existing dot markup and base styling. Its two
consumers are `TriTowersBoard` and `ElevenUpView`. The existing pure fraction
helper supplies the 24-dot visual progression and urgency zones. Eleven Up passes
its own remaining deadline time and frozen `board.rules.stageMs` (v1 120 seconds,
v2 180 seconds). Paused time still uses the authoritative pause timestamp. No
timer, deadline mutation, phase transition or action lives in the dot component.
Ready retains its numeric first-action countdown; active play has dots and an
accessible remaining-time value without persistent numeric text.

## Preserved behavior

Automatic exact-eleven submission, individual deselection, over-eleven correction,
the purple sum diamond, centered draw ball, counted Pass and Arcade label cleanup
remain. The immutable command path, ownership/revision guards, retries, recovery,
two standard rounds, earned bonus, speed scoring, timeout and financial settlement
are unchanged. No SQL, migrations, timing constants, transport or database writes
are part of this correction. Shared Rules & Info contrast remains intact.

## Validation

- Final `npm run build` passes: TypeScript, 2,419 application tests, 241 harness
  tests and the production bundle. Existing bundle-size/Browserslist warnings
  remain; no dependency changes were made.
- 36 focused checks pass across Eleven Up presentation/transport/client authority
  contracts and TriTowers presentation. Timer coverage tests both modes and both
  frozen durations at 100%, 40%, 10%, 5% and zero, recovery epochs, pause and new
  round deadlines. Existing exact-eleven/replay tests remain; active-player-first
  ordering and scroll reset have direct coverage.
- Browser fixtures compare all 22 centers and diameters against the historical
  source rendered in an isolated frame with the same available felt. They also
  verify scoreboard centering/alignment, stacked two-player pills, active-first
  larger tables, control separation, ball separation, clipping and page scrolling
  at 320×568, 390×844, 844×390 and 1440×900 with 1, 2 and 7 players.
- Eight additional narrow-phone cases cover numeric Ready and 40%/10%/5% active dots,
  six-digit scores/balances, long names and the bonus-round label in both modes.
  Four Rules & Info consumers retain at least 7.03:1 measured text contrast.
- Evidence: `.codex/evidence/eleven-up-correction/`. Reproduce browser checks with
  `node dev/eleven-up/polish-browser.mjs`; fixtures do not ship or write data.
- `tsgo` is absent; validation uses the installed project TypeScript compiler.
  Unchanged database proofs are not rerun. Browser fixtures are presentation
  evidence, not a claim of live multiplayer settlement or physical Safari smoke.

## Owner production smoke

Refresh production and check Arcade plus a two-player table on iPhone, including
landscape. Confirm compact original clusters, centered stacked multiplayer scores,
one aligned scoreboard band, numeric Ready and proportional active dots. Select
an eleven, Pass, Take Score and reconnect. Check round handoff, both base rounds,
earned bonus, final results, settlement and Session Ended. On a larger table,
confirm the active player appears first and is visible after each turn change.
