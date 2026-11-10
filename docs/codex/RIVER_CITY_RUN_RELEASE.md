# River City Run / The Boat release

Jeremy approved integration and production publication, then explicitly resumed
the `41c5b55d2` checkpoint on November 9, 2026. This release contains only River
City Run and its qualification/registration changes. Base main is `e915e16a5`.

Entry: https://holm357.com/arcade/river-city-run, also available from Arcade →
P-Town Originals. Supplied 1466×564 lobby/course artwork preserves its aspect.
The Boat uses `the-boat` for both writes and leaderboard periods; the title-free
waterfront presentation is independent of future course rankings.

## Authority and preserved behavior

The approved road/table rules live in `src/lib/riverCityRun/core.mjs`, frozen as
`river-city-run/1`. Server replay accepts timed, ordered swipe intents; it owns
collisions, repairs, pickups, score and the private cryptographic six-deck shoe.
The iframe is presentation/optimistic movement only. It sends no final scores or
deck data. Its sound cues use the platform Sounds setting and audio engine.

Banking records arrival points; casino exit records the balance including zero;
crash records road points. Results, receipts and revision changes commit atomically
through existing private Arcade tables. Abandon does not write a result. Scores
use integer hundredths internally and points in the interface. No financial or
multiplayer tables, sessions, wallets or ledger writes are involved.

The latest approved table has one hand and no split, starts with no wager, retains
All In/double affordability, and allows three deals with early exits. The 1,200ms
duck, four-wrench repairs, two markers, original course and presentation remain.
Preview samples, shortcuts and unlimited-hit practice are removed.

## Qualification

- Both complete three-minute road paths passed in a 390×844 Edge browser with
  zero hits. Elevated bank: 16,672. Ground arrival: 8,922; a 250-point blackjack
  win followed by exit: 9,172. Both returned to both course leaderboard periods.
- Actual Arcade tile, course tile, Rules, portrait navigation, Abandon and crash
  result return passed. No browser errors or failed API requests across the full
  route checks. Snapshot reconciliation preserves pending inputs; the official
  crash screen waits for the authoritative result before enabling return.
- Sixteen focused rules/authority tests, catalog/layout/Rules checks, TypeScript,
  production Vite build and recovery bundle pass. The broad suite's pre-existing
  failures were reproduced on unchanged main and were not patched in this release.
- Local and production rollback-contained SQL proofs cover authenticated ownership,
  direct browser RPC denial, actual score reconciliation, atomic write failure,
  receipts, duplicate/replay/late replay, successor/terminal isolation, ties,
  timestamps and both date windows. No synthetic production rows were retained.
- Independent database connections produced one result for concurrent submissions.
  The real shared recovery claim/dispatch/complete path finalized an unattended
  road crash once and completed a disconnected all-in bust at zero points.
- A second synthetic course with a higher score could not affect either Boat
  leaderboard, the player's rank, personal best or results return.
- The actual bundled API handler passed with real Supabase Auth and a disposable
  local database: missing/invalid bearer, foreign origin, wrong owner, course
  scope, start and unranked Abandon. Fixtures rolled back.

## Installed release components

Migration `20261110023341_river_city_run_the_boat` is installed with admission
closed. Candidate and installed hosted proofs passed. Recovery worker v23 is
active and its subsequent heartbeat is healthy. The deployed v22 baseline was
compared with the new bundle minus River: other-game statements/behavior match
(only inspected shuffle identifier extraction and bundler aliases differ).
No new River security-advisor findings; existing unrelated findings are unchanged.

Activation is separate from installation and requires the tested frontend plus a
healthy worker. Publish through the existing main push helper, once. The annotated
`river-city-run-production-20261109` tag records the exact commit/deployment and
post-publication smoke receipt. Production smoke is read-only using the existing
test accounts: both aliases, exact build SHA, authenticated boards, invalid-course
denial, both mobile tiles, course navigation, Rules and no overflow/runtime errors.

Physical iPhone Safari control feel, audio unlock/timbre and performance remain
Jeremy's final device checks. No production run or synthetic leaderboard score is
created by the entry-point smoke. Local evidence is under
`dev/river-city-run/evidence/`; scripts and instructions are in that directory's
README. No preview build is needed for this release.
