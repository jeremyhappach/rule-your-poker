# 11 Up shared polish — 2026-10-18

Jeremy approved the attached shared polish brief and Megatouch layout reference.
Checkpoint: `eleven-up-shared-polish-2026-10-18`. Production iPhone smoke remains
acceptance; this record does not claim physical Safari or live multiplayer smoke.

## Change and ownership

`ElevenUpView` and `elevenUp.css` serve both Arcade and multiplayer. Take Score
occupies the gameplay area's upper right. The selected sum is a compact purple
diamond immediately below the full rack; a dark-backed deadline display and the
centered current ball / right-side Pass complete the lower layout. Pass retains
the authoritative stock count in its upper-left circular counter. Round is plain
text next to the active score pill. Multiplayer names, active distinctions and
canonical balances remain; only Arcade omits You and the Arcade subtitle.

Ball sizing measures the rack, caps the modest width increase against actual
diagonal/vertical spacing, and retains the existing layout's relative rows and
columns. The container observer disconnects on retirement. No window measurements
or independent shell geometry were introduced.

Tapping a selection to exactly eleven submits the existing group intent from
the event handler. A synchronous local latch covers taps before React paints;
`useElevenUp` retains its unchanged one-flight, persisted immutable UUID/payload,
turn/revision/deadline guards and replay recovery. Selection and the latch reset
on scope, revision, recovery epoch and tab changes. Individual deselection and
over-eleven correction remain; Make Eleven and Clear Selection are removed.

The Rules & Info contrast failure was reproduced from the compiled CSS:
`bg-background` overrode the dark background while pale text remained. The shared
`ArcadeInfo` surface now owns a light background and dark typography with sufficient
selector specificity. TriTowers, 11 Up, Run21 and Yahtzee reuse it. Instructional
content and generic dialog styling are unchanged.

## Preserved authority

No SQL, RPC, transport, scoring, shared ruleset, timing, settlement, financial
presentation, recovery worker or terminal owner changes. Two standard rounds and
the earned third bonus round remain. Frozen v1/v2 durations and all existing
leaderboard compatibility are preserved. No production data was mutated for tests.

## Validation

- Full validation/build: 2,412 application tests and 241 harness tests passed.
- Final focused run: 21 checks, including an additional Ready/paused-clock test,
  rapid taps, three-ball groups, current-ball groups, over-eleven correction,
  covered/inactive/pending/error/expired guards, identity resets, and lost-response
  reload with an identical replayed command. Existing authority/financial client
  contracts passed. Final TypeScript and regenerated production bundle passed.
- `node dev/eleven-up/polish-browser.mjs`: isolated real-component fixtures at
  320×568, 390×844, 844×390 and 1440×900, each with 1/2/7 players. Assertions cover
  ball separation, centered current ball, upper-right Take Score, sum below the
  rack, timer/control separation, 44-pixel primary targets and no page scrolling
  or clipping. All four Rules & Info consumers pass text/close contrast checks.
- Local screenshots and results: `.codex/evidence/eleven-up-polish/`. Fixtures
  live under `dev/eleven-up/polish*`; they do not ship or write to a database.
- The prior local SQL clone is absent in this checkout; unchanged SQL proofs
  were not rerun. This is a client polish release, not a new financial activation.
- `tsgo` is not installed; the existing project `tsc` check passed instead.

## Owner production smoke

Refresh 11 Up in Arcade and multiplayer. Select/deselect balls and complete an
eleven, including a three-ball group and the current ball. Confirm one removal
and score update, then Pass, Take Score and reconnect. Check round handoff, both
base rounds and an earned bonus, final results/leaderboard, multiplayer scores,
settlement and Continue. Rotate the iPhone and check the diamond, timer, stock
counter, scoreboard, touch targets and Rules & Info contrast. Confirm Session
Ended retires gameplay as before.
