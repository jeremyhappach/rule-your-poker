# River City Run integration qualification

Release branch: `codex/river-city-run-release`, based on `e915e16a5`.
The original candidate is retained for rollback-contained proofs. Installed
migration: `20261110023341_river_city_run_the_boat`; recovery worker v23.
See `docs/codex/RIVER_CITY_RUN_RELEASE.md` and its production tag for publication.

## Ownership

- `src/lib/riverCityRun/core.mjs`: frozen approved course and blackjack rules.
- `authority.mjs`: server input replay, private shoe projection and terminal score.
- `server/riverCityRun/service.mjs`: authenticated Arcade command/receipt adapter.
- `src/components/riverCityRun`: course selection, course-scoped board, navigation.
- `presentation.txt`: approved canvas/table presentation, embedded by the Arcade
  page; platform audio and all persistent actions pass through the parent.
- Candidate SQL: existing private Arcade rows, receipts, immutable results and
  revision infrastructure; no multiplayer or financial ownership.

Stable course ID is `the-boat`. Scores are stored as integer hundredths of a
point and displayed as points. The latest approved table has one hand, no split.
Preview samples, casino shortcut and unlimited-hit practice are absent.

## Checks completed November 9

- Typecheck and Vite production build passed. Existing large-chunk and outdated
  Browserslist warnings remain; no dependency changes were made.
- Frozen elevated/ground paths clear in deterministic simulation (16,672 / 8,922).
  Focused rules cover mandatory blockers, duck/jump, four-wrench repair/reserve,
  crash, bank, abandon, private dealer hole/shoe, all-in win/loss/push/blackjack,
  double affordability, three-deal limit, and early exits.
- Candidate transaction proof passed locally before and after local installation.
  Production candidate proof passed in a rolled-back subtransaction; no production
  River functions, admission or scores were retained.
- Proof covers authorization, immutable results, atomic result-write rollback,
  duplicate/replay/late replay, terminal/successor isolation, ties, date-range
  queries, timestamps, course scope and abandon exclusion. Local guards protected
  160 non-Arcade tables from writes.
- Independent PostgreSQL connections raced one crash commit: one committed,
  one duplicate receipt, exactly one result. A stale terminal commit was rejected.
- Catalog, layout, switchboard and accessible Rules checks passed after extending
  explicit registry expectations. Full suite has pre-existing failures reproduced
  on unchanged main; see local ignored `evidence/baseline.json`.
- Portrait Edge run at 390×844 cleared the complete elevated course, banked 16,672
  points, and returned to both The Boat date-range views.
- The complete ground route also cleared with zero hits. The browser entered
  blackjack with 8,922, placed 250 manually from an initially empty wager, stood,
  won, left with 9,172 and returned to both course date-range views. There were
  no page errors or failed API responses across either full run.
- All 16 focused core/authority checks passed, including rejected airborne input
  sequence handling and preserving an already-due crash when Abandon arrives.
- Portrait Arcade tile retained 1466:564 framing with its baked-in title visible;
  course navigation and explicit Abandon passed. Crash-out now waits for server
  completion before showing the official result; the repeated browser check passed
  through a first-tap return to The Boat. The final presentation-only guard was
  browser-tested after the production build noted above.

## Completed continuation checks

`release-proof.mjs` proves actual shared recovery with no client, disconnected
all-in loss at zero, second-course exclusion and unranked Abandon. `api-proof.mjs`
uses the actual API handler, real Auth and a rollback-only local database.
`worker-preservation.mjs` compares the new bundle minus River against the deployed
v22 baseline captured in ignored `prior-worker.local.mjs`; it excludes unrelated
game behavior changes. Candidate and installed hosted proofs passed, with the
second synthetic course included. Worker v23 is healthy. Production entry-point
smoke is `node dev/river-city-run/production-smoke.mjs <release-sha>` and writes no
gameplay state. Physical iPhone acceptance remains a device check.

## Local reproduction

No new packages were installed. The local harness uses the existing loopback
PostgreSQL qualification installation; `database-proof.mjs` names its clone source.
`npx vite --config dev/river-city-run/vite.config.ts` serves the real component and
SQL-backed adapter at `http://127.0.0.1:4319/dev/river-city-run/index.html`.
The fixture is loopback-only, outside the production entry graph, and uses a
disposable local database. `browser.mjs` drives both complete paths using real
keyboard input. `extra-browser.mjs` checks the real Arcade tile and terminal flows.
Evidence, fixture identities and generated SQL stay ignored. Scripts do not
install packages or deploy.
