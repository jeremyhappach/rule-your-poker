# Run21 visual recovery — local review candidate, November 9, 2026

**Publication held. Jeremy must review and approve the new screenshots before deployment.**
Isolated branch: `codex/run21-midnight-visual-recovery`, based on production
`ea1fb95aaa93474e984aac6d731d5904f30af851`. Main and production are unchanged.

## Diagnosis

The provided production PNG itself has almost no visible casino artwork. Sampling
5,350 pixels gives mean luminance 19.91/255; its original JPEG encoding changes
RGB values by only 0.76/255 on average. Compression was not the cause of the missing
visual richness. The old scene used full opacity and cover sizing, but only occupied
the board below the toolbar/score/speed area. Near-opaque columns then covered most
of that region. The negative z-index was contained by board isolation, so it was
not established as a disappearance bug; it made the paint order unnecessarily
fragile. The leaderboard already overrode the scene to z-index zero.

## Corrective treatment

- Replaced both inadequate backgrounds with text-free artwork generated from the
  approved references using the built-in image tool. Warm defocused casino lights,
  teal velvet, textured midnight felt, chips and ornate card backs are visibly present.
- Gameplay artwork now paints the existing full shell; the decorative scene uses
  z-index zero and never intercepts input. No component or lifecycle owner was added.
- Five columns have metallic gradient borders, recessed shadows, subdued suit
  texture, warm lower reflections and gold completed-column treatment.
- Existing buttons use dimensional teal/brass and metallic gold surfaces. The
  existing multiplayer announcement uses the same palette without changing its
  event, text, sizing or timing.
- Leaderboard title, filters, summary and rank rows have coordinated metallic
  treatment. Chips/card backs occupy decorative space after the table; only this
  trailing decoration increases leaderboard scroll length. All existing table
  columns, filters, buttons, data and navigation remain in their existing order.
- The real displayed ranking is 1, 2, 2, 4: both second-place entries remain silver.
  A separately labeled Test Gold / Test Silver / Test Bronze fixture demonstrates
  rank-three styling without altering production scores.

Assets: `public/run21-midnight/gameplay.jpg` (207,938 bytes) and
`public/run21-midnight/leaderboard.jpg` (403,216 bytes), quality-90 encodings.
No image load promise, preload gate, new fetch owner, timer or animated backdrop.
Gameplay adds about 139 KB over the previous art; the browser can render and
advance gameplay without waiting for that decorative image.

## Browser evidence and comparison

Evidence directory:
`C:/Users/jerem/.codex/visualizations/2026/11/10/01a1c3a8-0480-7241-b533-3787682513d7/run21-recovery/`

| Artifact | Evidence |
|---|---|
| arcade-empty.jpg | Actual Arcade page, empty five-column board, 390x844 |
| arcade-cards.jpg | Actual Arcade page after browser placements into all five columns |
| arcade-baseline.jpg | Same local Arcade route using unchanged production source/styles |
| multiplayer-empty.jpg | Actual shared multiplayer view and local engine, 390x844 |
| async-gameplay.jpg | Actual Async turn component after result-review handoff, 390x844 |
| leaderboard-real.jpg | Actual leaderboard component replaying captured production display data, 390x844 |
| leaderboard-footer.jpg | Scrolled view showing all rows above decorative chips/card backs |
| leaderboard-real-full.jpg | Full-page capture at phone width |
| leaderboard-medals-test.jpg | Explicit synthetic medal sample; not real rank-three data |
| geometry-comparison.json | Exact equality of toolbar, score, Speed, Pass, upcard, right controls and column rectangles |
| responsive-checks.json | All five columns inside 320x568 and 430x932, no horizontal overflow |
| leaderboard-layout.json | Ten rows and preserved tie ranks fit at 320, 390 and 430 widths |

Compared directly with the supplied approved gameplay/leaderboard mockups and the
previous `run21-midnight/arcade-production.jpg` failure screenshot. The candidate
now has visible environment detail even with empty columns, dimensional frames
and distinguishable medals. It retains the current compact header and current
table structure instead of reproducing the mockup's extra branding/header and
illustrative data layout. Final visual acceptance belongs to Jeremy.

## Validation and limits

- TypeScript application check passed.
- Vite production build passed; existing large-chunk warning remains.
- 61 focused files / 530 tests passed: Run21 rules, scoring, input, local authority,
  Arcade equivalence and Async review/start/recovery cases.
- Browser Arcade: all five placements accepted, each total 10, combined total 50;
  Rules opened, Abandon opened and Keep Playing preserved the game.
- Browser Multiplayer: empty shared board renders; Pass accepted.
- Browser Async: showing opponent results -> saved review -> playable own turn;
  Take Win 104 accepted and existing celebration appeared.
- Leaderboard: period control changes selection, ten captured real rows/dates stay
  intact, tie styling preserved, scroll reaches decoration outside the data.
- No browser error logs observed in the final local review.
- Source changes are CSS and artwork only. Rules, scoring, audio code, handlers,
  transitions, networking, card animations, original lobby tile and other games
  are unchanged. No SQL, schema, auth or financial changes.

These are local browser implementation screenshots, not new production captures.
Arcade uses the unchanged shared solo engine behind a local-only transport;
Multiplayer and Async use existing offline review fixtures. Local authentication
does not load the real audio preference, so audio and physical iPhone PWA
acceptance are not claimed. Live two-account reconnect/Async submit-reopen and
physical-device performance remain release-smoke checks after screenshot approval.
Do not publish this candidate until Jeremy explicitly approves the screenshots.

Reproduction harness and logs are in the worktree's ignored `qualification.local/`;
the three local review servers use ports 5197 (Arcade), 5196 (Multiplayer) and
15327 (Async). Exact artwork prompts are in
[RUN21_MIDNIGHT_ARTWORK_PROMPTS.md](RUN21_MIDNIGHT_ARTWORK_PROMPTS.md).

---

# Original Run21 Midnight High Limit release — November 9, 2026

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
