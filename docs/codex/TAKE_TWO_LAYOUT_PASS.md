# Take 2 layout pass — 2026-10-19

Checkpoint: `take-two-layout-2026-10-19`. Owner iPhone production smoke pending.
Shared presentation only; no rule, authority, SQL, scoring, bonus, clock, audio,
settlement, record, request serialization or responsiveness changes.

## Change and ownership

`TakeTwoView.tsx` and `takeTwo.css` render both Arcade and multiplayer. The numeric
standard score pill is centered between Round and Take Score. Best is removed;
KQ/JJ and the horizontal bonus meter occupy the secondary row. The instructional
helper is removed; dynamic action feedback remains available to screen readers.
The unchanged dot clock is below the tableau. The current card is centered and
Next Card is on its right with the standard upper-left circular stock badge.
The authoritative draw penalty and Rules text remain unchanged.

The old row pitch exposed only 0.38–0.47 card widths, below the royal card font's
rank bounds. Container-relative geometry now uses 0.76–1.05 card widths, retaining
overlap, the 2:3 aspect ratio, six-card width and half-card horizontal stagger.
The server's layout/exposure graph is unchanged. Buttons have the same bounds as
their card faces. Flexible gaps use the existing canonical slot, header and safe
area allocation without another viewport measurement or shell.

Portrait card width is preserved. Height-limited landscape/desktop containers
must fit proportionally smaller cards to accommodate readable rows plus controls;
keeping their previous width as well would require clipping or changing the
staggered layout. At the extreme 852×300 two-player fixture, six-row cards are
15.8 px wide: they fit and expose the full rank, but physical-phone tap comfort
needs owner acceptance. Expanded landscape provides larger targets.

## Evidence

Reference: Jeremy's `Downloads/IMG_4180.jpeg` (709×1536), iPhone 15 Chrome. The
393×662 CSS content viewport is inferred from its page/chrome proportions; it
was not read from the device. Local Edge/Chromium screenshots cover that viewport,
393×587, 393×852, 852×393, 852×300, 320×568 and 1440×900, each with one/two/seven
players and 28/33 cards: 42 before and 42 after images.

At 393×662, both modes retain 63.0 px cards. Row pitch changes:

| Mode / board | Before | After | Minimum covered-rank clearance |
|---|---:|---:|---:|
| Arcade / 28 | 29.5 px | 66.1 px | 20.7 px |
| Arcade / 33 | 24.1 px | 63.7 px | 18.2 px |
| Multiplayer / 28 | 29.5 px | 66.1 px | 20.7 px |
| Multiplayer / 33 | 24.1 px | 53.1 px | 7.6 px |

All 42 final cases pass SVG rank bounds (including 10/J/Q/K), card proportions,
horizontal stagger/overlap, no viewport clipping or page scrolling, face/button
bounds, exposed hit targets, timer order, right-side stock and badge placement.
Score and current-card center error is below 0.02 px at the reference viewport.
The minimum measured rank clearance across the complete matrix is 0.37 px.

Eight real authoritative pair actions per mode preserve the earlier response:

| Local median | Arcade | Multiplayer |
|---|---:|---:|
| Tap → request | 0.2 ms | 0.3 ms |
| Request → parsed response | 42.5 ms | 48.3 ms |
| Response → visible removal | 5.1 ms | 13.1 ms |
| Tap → visible removal | 46.7 ms | 62.8 ms |

Selection feedback appears in 12–14 ms. These are loopback harness measurements,
not production WAN or physical iPhone latency.

Typecheck, 2,502 app tests, 241 harness tests and production build pass. The real
SQL/service browser flow passes legal pair, draw penalty, reload, three Arcade
rounds/leaderboard, active-player restriction, six multiplayer turns, settlement
and continuation. An initial multiplayer run attempted an action in a background
tab; the harness now foregrounds the actor, preserving the intentional hidden-tab
guard. No product action guard was changed.

Reproduce with `node dev/take-two/layout-pass.mjs before|after`,
`node dev/take-two/responsiveness.mjs layout-pass --actions-only`, and
`node dev/take-two/browser.mjs`, against the local qualification server.
Ignored evidence: `qualification.local/take-two/layout-pass-before/`,
`layout-pass-after/`, `layout-pass/measurements.json`, `layout-pass-build.log`
and `browser.json`. No synthetic production data was created.

## Owner smoke

- Arcade and multiplayer: score/current card centered; no Best/helper text;
  Round left, Take Score right; readable covered 10/J/Q/K in all three rounds.
- Timer below cards; Next Card to the right; stock badge attached at upper-left;
  drawing changes authoritative score by the same penalty shown in Rules.
- Rotate the iPhone and show/hide Chrome chrome: no clipping or scrolling;
  confirm the compact landscape card targets are comfortable on the device.
- Match pairs quickly, including a newly exposed card; feedback/removal remain
  prompt. Finish Arcade to leaderboard and multiplayer through normal results.
