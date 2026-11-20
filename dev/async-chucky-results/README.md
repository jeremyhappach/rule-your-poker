# Async Chucky opponent round results

Approved November 20, 2026, based on `2b03c3ecd` on `main`.
Checkpoint: `async-chucky-results-20261120`.

The Async saved-result owner previously mounted `OriginalsBoard`, which mounted
the full Chucky renderer with disabled input. This necessarily displayed the
last player/community/Chucky cards. `ResultReview` now selects a dedicated
`ChuckyRoundResult` inside the existing fullscreen shell for Chucky reviews.

The overlay receives only the recorded actor name, round, `board.cracks`,
`board.uses` and presented `event.score`. Its three hearts use the recorded
remaining lives. The seven levels reuse `ChuckyLevelAvailability`, exactly as
Fold/Stay: one filled dot per available use and gray exhausted levels. The
displayed total counts from zero to the saved round score, never the board's
cumulative score. No gameplay renderer, cards, gameplay control or additional
clock/action/acknowledgement owner is mounted.

The existing event-ID review admission, persisted elapsed recovery,
visibility/online guards, reduced motion, final-score hold, single ACK,
Your Turn handoff and child-result/finale sequence remain in `ResultReview`.
Current gameplay in Arcade, live multiplayer and Async is unchanged, as are
static completed match records, scoring, rules, financial authority and SQL.
No database migration or historical data mutation is part of this change.

## Qualification

Passed: 60 focused tests; all four native-browser layouts and transitions;
TypeScript; 4,358 application tests; 241 harness tests; 46 release-tooling tests;
production Vite build; unchanged 90 MB size gate (89,706,602 bytes).
Browser screenshots were visually reviewed at 390x844 and 844x390.

Run with installed dependencies:

```powershell
node node_modules/vitest/vitest.mjs run src/components/delayed/ResultReview.test.tsx src/lib/delayed/reviewPresentation.test.ts
node dev/async-chucky-results/browser.mjs
npm run build
```

The focused suite covers recorded hearts, mixed 2/1/0 uses, absent cards and
controls, intermediate/final round score, zero-score rounds, recovered review,
reduced motion, one ACK and both gameplay and terminal-result handoff. Existing
review interruption/ACK-failure tests remain in the same suite.

The native Edge browser fixture uses actual `ReviewGate`, `ChildResults`,
`ResultReview`, the new overlay, shared level strip and shell. Auth, Realtime and
RPC responses are loopback fixtures; this does not claim hosted gameplay smoke.
It checks four sizes (320x568, 390x844, 844x390, 1280x800), painted intermediate
scores, complete viewport intersection/no occlusion, no cards, one ACK and
automatic handoff, including a reloaded pending review and terminal result.
Screenshots/report are under `qualification.local/async-chucky-results/`.

The first browser run used polling too slow to sample the existing 710 ms count;
the fixture now records actual rendered intermediate values with a DOM observer.
The next pass identified landscape clipping; a shell-container aspect-ratio
layout now places lives and levels side by side on wide, short surfaces.
The initial typecheck caught a test-only `replaceAll` unsupported by the project's
target library; the test uses the supported regular-expression equivalent.

## Owner acceptance

Open an opponent's completed Chucky round in Async on a phone. Confirm three
hearts, seven Fold/Stay level indicators with the saved dots/gray states, no
cards, and a count to that round's recorded total. Let it proceed automatically
to Your Turn or the existing game results. Reload during a pending review and
check landscape. Production owner smoke remains pending until Jeremy reports it.
