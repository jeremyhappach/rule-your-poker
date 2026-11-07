# Mega Card Golf UI polish — November 7, 2026

Jeremy approved the three scoped presentation changes. Base: main
`5a1e5c961c1ded7517c7905b0968328af2f66de9`. The old, dirty Six-Card Golf checkout
and the earlier Mega competition worktree were preserved.

## Delivered behavior

- CourseClubhouse places Return to Clubhouse left and Tee Off right, including
  wide layouts which previously stacked the controls. Admission handlers,
  disabled states and leaderboard selection are unchanged.
- MegaCard receives an outgoing-replacement marker only for a committed hidden
  replacement's reveal/dissolve stages. Its face flashes twice with readable
  early peaks, progressively dims, then reaches zero opacity. A separate inner
  layer retains the existing flip and felt-anchor flight. Incoming cards,
  exposed replacements, opening flips and stock flips do not acquire the effect.
- Reduced motion uses a steady opacity fade and retains the existing suppression
  of flip/flight movement. The existing blanket motion disable has an exception
  only for the outgoing face opacity animation.
- MegaResultScorecard keeps its first score-row header cell blank visually,
  retaining its accessible Score name and the original column sizing.

The shared renderer serves Arcade, live multiplayer, async turns and saved-hole
replay. The presentation event owner, exact revision/intent admission, dedupe,
identity resets, 1500/350/350 ms sequence, input locks, audio triggers, rules,
scoring, server requests, schema and finances are unchanged. No migration.

## Verification

- Application TypeScript: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` passed.
  The preferred tsgo executable was unavailable; nothing was installed.
- Mega component/rule suites: 124 passed; one pre-existing Defaults fixture
  failed at GameDefaultsConfig's selected-game category access. A separate Vite
  baseline loader supplying all changed product modules from unmodified HEAD
  reproduced the same failure. Defaults and its test are outside this patch.
- Production bundle: `node node_modules/vite/bin/vite.js build` passed. Existing
  Browserslist and bundle-size notices remain.
- Browser: Chrome at 390×844, normal and reduced motion, using the real MegaArcade
  controller and an isolated HTTP MegaAuthority fixture with current /4 rules.
  Both runs used ordinary course selection, Return to Clubhouse, Tee Off,
  sequential opening, automatic draw, hidden replacement, exposed replacement,
  Stand Pat / Tap In, authoritative first-hole result and rendered scorecard.
  Every request returned 200; no browser exceptions or external requests.
- Button geometry passed at 390×844, 844×390 and 1280×720. Mobile scorecard header
  and score columns align to within half a pixel, with no horizontal overflow.
  Completed pencil score values match committed results. Screenshots inspected.
- Frame samples show normal/reduced reveal durations 1516/1516 ms and dissolve
  350/350 ms, with 333 ms observed between first/last frames of each 350 ms flight.
  Early normal faces remain opaque/readable, flashes recover to decreasing peaks,
  the final outgoing face falls below 5% opacity, incoming opacity stays 1 on
  every sampled layer, and every other card remains opaque. Reduced motion is
  monotonic; exposed replacements show only the unchanged arrival stage.

Reproduce with installed dependencies:

1. `node node_modules/vite/bin/vite.js --config dev/mega-card-golf/ui-polish/vite.config.ts`
2. `node dev/mega-card-golf/ui-polish/browser.mjs`

Local screenshots/frame reports are in
`dev/mega-card-golf/ui-polish/evidence.local/`. The fixture uses fresh memory and
does not connect to production. These checks establish UI behavior, not hosted
database or physical-device acceptance.

## Release and owner smoke

Checkpoint: `mega-card-golf-ui-polish-2026-11-07`. Its matching `-verified` tag
records the exact production deployment receipt after publication.

On a phone, open Mega Card Golf, select a course and confirm back-left/Tee-Off-right.
Replace a face-down card: read the outgoing face during its flashes, watch it
disappear, and confirm the incoming card is fully opaque. Finish a hole and check
the blank cell below Hole and aligned score values. Physical production acceptance
remains Jeremy's smoke step.
