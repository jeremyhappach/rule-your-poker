# Run21 Midnight High Limit — November 9, 2026

Approved visual-only release from `01cfe80d422575923d30a29f611a4260f1c7e2a4`.
The FINAL_v2 package's entire CODEX_TAP_COPY.md was read before editing.
Its flattened mockups remain references only. The supplied text-free backgrounds
are encoded at their original dimensions as 68,830 / 72,528-byte JPEGs.

## Scope and preservation

The existing Run21SpaceScene entry point now supplies a static Midnight backdrop.
Its shared CSS paints Arcade, live multiplayer and Async fullscreen boards,
controls and results with navy/teal surfaces and restrained gold trim. It adds
no image-ready gate, effect, clock, network command or gameplay animation.
All board/shell dimensions, card faces, stacking, handlers, action admission,
pending guards, score math, speed state and round/turn transitions remain intact.
The live conditional control remains Give Up / Take Win (the current source label).
The original source screenshot's five columns, centered upcard, Pass, /105 and
help placement are preserved. Existing mode-specific navigation is preserved.

The existing Run21 leaderboard retains real data, dates, sorting, navigation,
Last 30 Days / All Time and rule-version filters. Its rank number gets decorative
medal paint for authoritative ranks 1, 2 and 3, including tied ranks. Other games
and all Arcade tile assets are unchanged. No database or infrastructure changes.

## Validation

- TypeScript application check: passed.
- Vite production build: passed (42.55 seconds).
- 61 focused test files / 530 tests: passed. Includes shared Arcade/multiplayer
  rules, persisted local authority, scoring, action admission, Async delayed Start,
  exact-ID lost-response recovery, review continuity and sibling preservation.
- Focused scene ESLint: passed.
- Native in-app browser, actual shared multiplayer components with local engine:
  Pass, placements in all five columns, totals 10 -> 20, aggregate 50 -> 100,
  one Give Up -> Take Win button, 50,000-point collection and terminal disabling.
- Four viewports (320x568, 390x844, 844x390, 1440x900): five columns remain within
  the viewport; no horizontal overflow.
- Actual Async review/turn components with synthetic local transport: opponent
  104 review -> automatic playable board -> accepted collection. The old preview
  transport lacked track/untrack/presenceState; those no-op mock methods were
  supplied to match current production-client usage. No production fix involved.
- Actual leaderboard component with local fixtures: gold/silver/bronze, tied
  1/1/3 medals, filters, long names and all cells fit at 320/390/430 pixels.
- Reduced-motion selectors remain intact; no new animated decoration.

Screenshots and viewport evidence:
`C:/Users/jerem/.codex/visualizations/2026/11/10/01a1c3a8-0480-7241-b533-3787682513d7/run21-midnight/`.
Local screenshots are implementation fixtures, not hosted gameplay evidence.

Production deployment identity is recorded in the annotated release tag and final
report. Physical iPhone PWA, two-account multiplayer reconnect and live Async
submit/reopen acceptance must be distinguished from the local fixture coverage.
