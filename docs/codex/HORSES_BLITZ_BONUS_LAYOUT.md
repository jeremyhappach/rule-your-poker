# Horses Blitz bonus-note layout — November 8, 2026

Jeremy requested a higher, stable two-line note with a clear gap above the dice:

Early Bank Bonus · Roll 1 +30% · Roll 2 +10%

Natty earns +20%

The previous bottom-aligned stack changed height when the empty dice row gained
five dice and the result strip gained text. The shared Horses view now uses
three grid rows inside its existing play area: centered notes in the upper
space, a reserved dice/clock row, and a fixed-height result strip. The dice row
reserves five square faces plus its four existing 2% gaps even when empty.
Both note lines use centered, nonwrapping, container-relative typography.
Dice width, scoring, banking, audio, timers and rule admission are preserved.

The SQL-backed Edge touch browser runner passes 20 state/layout checks:
320×568, 375×667, 390×844, 393×852 and 430×932, each before Roll (1), during the
roll animation, after settling, and at the next hand. Both lines stay on one row,
with no overflow. Notes, dice row and result-strip bounds remain unchanged
(measured movement: 0 pixels). At width 320 the note starts at 248.69 pixels,
with 58.78 pixels of clear space above the unchanged 304-pixel-wide dice row.
These are observed measurements, not hardcoded layout values.

Before/rolling/settled/next-hand screenshots were visually inspected. Evidence:
`qualification.local/horses-blitz/polish-browser/notes-*.png` and
`notes-layout.json`. Reproduce with:
`node dev/ptown-polish/horses-browser.mjs <disposable-database> --notes`.
TypeScript and the production Vite build pass. No database migration or new
rule activation is required. No physical iPhone smoke was performed.

Release checkpoint: `horses-blitz-bonus-layout-2026-11-08`; its `-verified` tag
records the production deployment and exact public build manifest.
