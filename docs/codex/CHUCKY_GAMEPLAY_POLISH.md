# Chucky gameplay polish — November 8, 2026

Implements Jeremy's `chucky-showdown-polish.zip` handoff. The final Fold or Stay
reference governs the header and countdown; the Choose Chucky reference supplies
materials. The supplied clean table PNG is retained without baked-in controls.

The existing shared `ChuckyRoundTable` owns the updated presentation in Arcade
and competitive adapters. Rules precedes the speaker; round, hand and fixed coral
life slots occupy a second row. Completed Rounds and At Risk stay in the walnut
footer. The challenge counter is removed. Both decisions retain accessible
remaining time and show all 24 countdown dots beside the heading. Separate green
and empty level pips reflect the authoritative remaining uses.

Fold or Stay shows four decorative Chucky backs in front of the portrait.
Selected-level dealing, private community/reveal admission, card faces, frozen
rules/configuration, scoring, deadlines, audio, recovery and terminal flow retain
their existing owners. The player's hand and community occupy fixed grid rows.
Each lost heart is measured from its explicit indexed slot after the existing
score-count hold; the flight/shatter timing is unchanged. Nonstandard admitted
life allowances remain represented instead of silently truncating game state.

## Qualification

- Installed TypeScript compiler: `node node_modules/typescript/bin/tsc -p
  tsconfig.app.json --noEmit` passes. The optional `tsgo` binary is unavailable;
  no dependencies were installed.
- All 21 focused Chucky presentation/reveal/bust tests pass.
- Production Vite build passes (existing bundle-size/Browserslist warnings).
- `node dev/chucky-showdown/polish-browser.mjs` exercises the real shared table,
  cards and animation in installed Edge using local snapshot/action fixtures.
  There is no database simulation claim or production gameplay write.
- Fold or Stay, Choose Chucky and showdown pass at 320×568, 375×667, 390×844 and
  667×375. Assertions cover fixed player/community positions, control bounds,
  a single 24-dot row, accessible remaining seconds, state-driven level pips,
  four pre-decision backs and selected-level 1/4/7 card counts/private prefixes.
- All three lost-slot origins differ from their heart centers by less than
  0.01 pixel in the 320-wide fixture. Remaining lives change at the existing
  lift boundary. The competitive containing grid also passes at 320×568.
- Screenshots and measurements are under `qualification.local/chucky-polish/`.
  Visual inspection checks white/red/black card faces and cream/brass controls
  against the dark backroom/emerald surface. No browser exceptions occurred.

Physical iPhone Safari and production gameplay acceptance remain Jeremy's smoke:
open Fold or Stay, Stay through community reveal, select a level, and watch a loss.
Check the one-row countdowns, anchored hand, readable scores and actual lost heart.
No migration, rule version, admission or financial-state changes are included.

Release checkpoint: `chucky-gameplay-polish-2026-11-08`; its verified tag records
the production commit after Vercel reaches READY and public build identity matches.
