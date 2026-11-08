# 357 Drop and Chucky gameplay polish — November 8, 2026

Implements Jeremy's `357-drop-chucky-polish.zip` and his explicit correction of
the earlier Chucky mockup. Both supplied PNGs are retained byte-for-byte under
`public/arcade/`. The reference screenshot supplies materials, not scores.

## Scope and owners

- `SoloDrop357` and `drop357.css`: clean riverfront backdrop, steel tray,
  riveted dark lane frames, teal/amber/violet accents and navy truss deck back.
  Live bright faces, cream result strips, dashed inherited slots and teal carry
  outlines retain their controls and semantics. Container-relative sizing fits
  all seven slots and keeps the card aspect ratio in short landscape layouts.
- Shared `ChuckyRoundTable`: supplied portrait with four cards in his hand;
  no separate table cards during deal, Fold or Stay, community reveal or Choose
  Chucky. Selected-level deal admission starts with the existing showdown phase.
  Remove only the superseded decorative-card CSS. Both Arcade and
  `OriginalsBoard` competitive adapters share this correction.
- Preserve rules/config versions, authoritative cards and scores, timer and
  action requests, carry semantics, audio, result transitions, community reveal,
  player/community anchors, life-loss origin and timing, recovery and settlement.
  No schema, migration, production-data or admission changes.

## Evidence

- Installed TypeScript: `node node_modules/typescript/bin/tsc -p
  tsconfig.app.json --noEmit` passes. No dependencies installed.
- 27 focused tests pass: Drop presentation, action receipt/replay and audio;
  Chucky presentation queue, reveal and bust audio.
- `node node_modules/vite/bin/vite.js build` passes with existing bundle-size,
  mixed-import and Browserslist warnings.
- `node dev/ptown-polish/drop-browser.mjs ptown_polish_1794161835570 --polish`
  exercises the actual client/API/local SQL rules inside a rolled-back transaction:
  three rounds, ordinary placement, reversible one-card/two-card carry drafts,
  confirmation, exact inherited cards and authoritative scores, continued play
  during pending carry, timeout, pass, all-filled award, final tally, leaderboard
  return and Abandon. No production gameplay writes.
- Drop checks 320×568, 375×667, 390×844, 667×375, 844×390 and 1280×720. All fifteen
  slots remain inside their lane with 5:7 proportions, including all seven slots
  in the final lane. Screenshots/measurements:
  `qualification.local/drop357/browser-partial/`.
- `node dev/chucky-showdown/polish-browser.mjs` uses local presentation fixtures
  in installed Edge. Both decisions have zero dealt Chucky cards; PNG decode and
  community backs are checked. Mounted snapshot transitions preserve community
  prefixes 2 → 3 → 4, then deal levels 1/4/7 one card at a time and reveal exactly
  that many committed faces at the existing 720-ms intervals. It also retains
  four-size anchor/countdown checks, three exact heart-loss origins and the
  competitive grid. No browser exceptions. This is presentation qualification,
  not a new database authority proof. Evidence: `qualification.local/chucky-polish/`.
- `node dev/ptown-polish/verify-drop-chucky.mjs <commit>` checks the published
  build identity, both Arcade shells and exact hashes of both supplied PNGs.

## Owner acceptance

On physical iPhone, play ordinary 357 Drop cards and select/change/confirm each
carry. Check bright cards, readable results, dashed carry slots and seven-slot fit.
In Chucky, inspect Fold or Stay, Stay through community reveal, and Choose Chucky:
only the portrait holds cards. Select a level and watch exactly its dealt cards
reveal, with community behavior and anchored rows preserved.

Checkpoint: `drop357-chucky-gameplay-polish-2026-11-08`. Its verified tag records
the production commit after deployment and public build/artwork verification.
