# Quintzee stationary scoring grid — November 10, 2026

The earlier responsive hotfix at 604fb12bf9c05557b1b269430d487d3bbad4b13a
made the compact play lane content-sized. Its empty dice row contributed zero
height, so the flexible scoring grid borrowed that space before the first roll.
At 393×852, all three modes grew the grid by 86.6875px before dice appeared.
The larger layout also needed to retain the empty roll-guide line.

## Correction

Only src/components/quintzee/quintzee.css changes product behavior. The dice lane
reserves its existing populated height: the face, border, button padding and HOLD
line. Shared CSS variables drive both the visible dice and the reserved footprint.
Five equal targets share 88% of the width after four 3% gaps. The existing
height-based face cap remains on larger layouts. The roll-guide line keeps its
normal line height even when empty. There are no placeholder dice or new state
owners, no measured-height latch, no scrolling and no scoring/roll/transport changes.

The frozen post-roll rectangles from the published baseline are retained in
dev/quintzee-layout/post-roll-reference.json. The browser runner now compares both
that reference and each turn state: ready, empty/pre-roll, rolled, held/released,
reroll animation, rerolled, zero rerolls, completed category, next-round ready and
next-round rolled. It records all six surface rectangles, all twelve category
rectangles and each row gap. It also preserves the existing target, overlap,
readability, safe-area and no-scroll checks. Its hosted loader includes all four
published main/lazy route CSS files, correcting the earlier fixture omission.

## Qualification

- 15 viewport/mode cases and 150 state measurements PASS.
- Arcade, Async and multiplayer at 375×667, 375×812, 390×844, 393×852 and 430×932.
- Maximum geometry change between states: 0.015625 CSS pixels.
- Maximum difference from the approved post-roll geometry: 0.015625 CSS pixels.
- No dice elements or buttons exist in the empty pre-roll lane.
- Primary actions remain 64px high; selectors remain at least 48px and dice
  targets remain at least 44px wide / 64px high.
- 63 focused Quintzee tests PASS.
- Full production-push qualification PASS: TypeScript, 4,027 application tests,
  241 harness tests, 46 tooling tests and production build. Static output is
  89,481,040 bytes / 179 files, below the unchanged 90,000,000-byte gate.

These are actual Chromium renders of the production game/shell components with
controlled snapshots and resolved safe-area padding. Native iPhone WebKit and
authenticated human gameplay remain owner smoke. No customer or financial state
is changed by the layout runner.
