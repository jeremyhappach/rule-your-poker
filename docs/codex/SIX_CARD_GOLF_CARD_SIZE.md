# Golf card-size restoration — October 22, 2026

Conditional owner request: measure first; if the active-player cards shrank,
restore the prior rendered size by reducing the flag and removing compact Thru.
The nine-hole modal and game-over scorecards are approved and must not change.

## Read-only diagnosis

Compared published Golf `568f8cc5d7eae5a8dac4097232860cad3132e570` against local
`08afbece2ce6e4bbe3bbcc48fbec8640e14c4556`. Vite source overrides read those exact
Git objects without changing either checkout. Both versions use the same route,
canonical shell, viewport, four-seat public projection, viewer turn and six-card
tableau. All API requests are intercepted in the browser. No database records or
live sessions are read, reset or changed by this comparison.

`ShellHudGrid` still owns the unchanged pane. The old hand occupied its whole
width. Candidate's center track used `minmax(136px, 1.25fr)` between two `1fr`
tracks, narrowing the hand's size-query container. Its unchanged maximum of
81.2 px per card did not prevent width-limited shrink. Candidate also reduced
the minimum card height from 44 to 12 px to fit short landscape.

Actual card-face bounding boxes, rounded to two decimal CSS pixels:

| Viewport | Published | Candidate 08afbece2 | Corrected |
|---|---|---|---|
| 320 × 568 | 36.75 × 51.47 | 36.75 × 51.47 | 36.75 × 51.47 |
| 375 × 667 | 49.00 × 68.61 | 44.69 × 62.56 | 49.00 × 68.61 |
| 390 × 844 | 58.00 × 81.19 | 46.61 × 65.27 | 58.00 × 81.19 |
| 430 × 932 | 58.00 × 81.19 | 51.73 × 72.44 | 58.00 × 81.19 |
| 667 × 375 | 31.42 × 44.00 | 19.34 × 27.09 | 31.42 × 44.00 |
| 844 × 390 | 31.42 × 44.00 | 21.25 × 29.77 | 31.42 × 44.00 |
| 1024 × 768 | 58.00 × 81.19 | 58.00 × 81.19 | 58.00 × 81.19 |

The first-row values above represent all six cards within fractional-pixel
rounding. Assertions compare each corresponding card within 0.05 px.

## Minimal correction and limits

The center track can now retain the previous 178 px maximum bundle width,
including the existing two gaps. The original 44 px minimum card height returns.
The flag's maximum box shrinks from 88 × 118 to 64 × 86 px. Only the compact
leaderboard loses Thru, and its remaining Player/Score columns share that space.
No scorecard, scoring, gameplay, animation, finance, shared HUD or felt changes.

At both short landscape sizes the published layout's bottom row was outside the
canonical pane (zero visible height). Restoring its card dimensions cannot make
two 44 px rows fit a 56–62 px hand area. The existing hand-slot scrolling retains
access: automated scrolling proves the full bottom row becomes visible, while
the shared pane and identity row stay fixed. Portrait needs no hand scrolling.

## Qualification and review

`node dev/six-card-golf/card-size-compare.mjs --corrected` captures 21 matched
renders and verifies restoration for all six cards at seven viewports, two-column
compact standings, and bottom-row scroll access in constrained landscape.
Evidence and actual screenshots are in
`qualification.local/six-card-golf/review-20261022-card-size/`.
The focused Golf table/scorecard suite has 20 passing tests; TypeScript passes.
No dependencies or production state changed. Unrelated Cribbage and Supabase
temporary files remain excluded. Live Canasta/main is not integrated or changed.
This is a local candidate only: no push, merge, migration, deployment or admission
change is authorized by this correction.
