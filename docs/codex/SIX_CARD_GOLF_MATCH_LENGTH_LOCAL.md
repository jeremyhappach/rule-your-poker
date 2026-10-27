# Six-Card Golf match length — local review, 2026-10-27

Base: `07a08ea87`. Branch: `codex/golf-match-length`.
Owner-authorized local implementation only. No push, hosted migration, deployment,
activation, publication, or changes to Words/Quintzee/Mega are included.

## Contract

- New multiplayer matches offer **3, 6, 9, 18 holes**.
- Lobby Game Defaults uses the existing `game_defaults` editor and permissions.
  New `golf_holes` is an integer, NOT NULL, default 9, constrained to those values.
- Dealer setup reads that saved default (fallback 9), displays all four choices,
  and submits its selected `holes`. This override never updates Game Defaults.
- `golf_configure` validates JSON numeric values and freezes the selection in
  `dealer_games.config.rules.holes`. Admission copies those exact rules into
  private match state; linked holes, reconnect and recovery reuse them.
- Old callers omitting `holes` receive nine even if today's saved default differs.
  Existing rules remain immutable; missing legacy rules.holes means nine.
  Run Back reads the previous committed length, with legacy fallback nine.
- This extends the existing configurable `six-card-golf/2` rules object, as
  timing settings already do. `/1` remains nine holes. No scoring rule changes.
- Reduction completes at the frozen last hole. Successor creation and settlement
  validate that same count. Stakes, payouts, ties, receipt keys, financial triggers,
  pause/recovery ownership, bot choices, admission and money capabilities stay intact.
- The flag has small “N holes” text directly below it. Scorecards include every
  configured hole. For 18 holes, Front Nine shows 1–9 and Out; Back Nine shows
  10–18 and In, followed by a distinct bold match Total (Out + In).
  Pencil strokes, row-completion total release, blanks,
  +N/E/−N, concealed-card protections and all presentation timings are retained.

## Local evidence

| Boundary | Evidence |
|---|---|
| Defaults and dealer UI | Actual component tests cover all four values, saved-default loading, missing fallback, match-only override and Run Back |
| Client request and validation | Configure payload assertions; strict projection validation for allowed counts and legacy nine |
| Server configuration | Local SQL verifies saved defaults, invalid JSON values, invalid stored count, override isolation, setup/admission freeze and reconnect persistence |
| Gameplay and recovery | 24 full human matches: every length × 2/3/4 seats × fake/real money. Exact linked round count, final phase, recovery through inter-hole holds, action duplicate/conflict/stale and late receipt checks |
| Finance | 72 terminal cases: every length × both money modes × all winner counts in 2–4 seats. Actual canonical balances, balanced journals, shared results, final snapshots, all-player ties, duplicate settlement, and injected failure after chip movement |
| UI regressions | 143 focused tests, including per-hole scoring/reveal/transport, privacy, row writing and terminal presentation |
| Static validation | Application TypeScript and Vite production build pass; existing Browserslist/chunk warnings |
| Browser | 15 actual canonical table/scorecard cases: all lengths at 320/390/1024px, plus 18 holes with four players at 320×568 and 390×680 and three players at 390×680. Edge/Blink verifies all scores and pencil glyphs, Out + In = Total, bold label/strokes, full headers, below-flag text, horizontal/vertical fit and no console/external-network errors |

SQL evidence: `qualification.local/golf-match-length/sql-evidence.json`.
All SQL fixture writes and candidate installation were rolled back. The runner
clones the existing local Golf template and explicitly bootstraps published Golf
functions from the inspected reference and tracked migration; it never connects
to a hosted database. Simultaneous opening intentionally permits an identical
commitment under a new request, so the old sequential-opening stale-request
assertion is restricted to later actions. Other assertions remain in force.

The SQL candidate is `supabase/six-card-golf/match-length.candidate.sql`, **not a
registered or installed hosted migration**. Its function preimage guards and
idempotent second application pass locally. The captured deployed reference is
qualification input only, never a release migration.

## Review

### Owner scorecard correction

The earlier candidate `f54ff69044b9805863a3575871620eb3cb951a27` displayed the
**same cumulative match total in both sections**. Its second total was not a
back-nine subtotal. The corrected 18-hole layout separates Out, In, and Total.
The section headings are exactly Front Nine and Back Nine. The overall Total
uses a bold label and heavier original pencil strokes; 3/6/9-hole layouts remain
unchanged. Only completed public hole scores contribute. An unplayed hole stays
blank, and its section subtotal remains E until a completed score contributes.
During writing, the current hole is withheld from its section subtotal and match
total until that player's pencil animation completes; the other section is stable.

Focused correction tests: 45 scorecard/table tests pass, including all player
counts, partial cards, hole 9 and hole 18 writing, distinct subtotals, and shorter
layouts. The local preview uses Out +9, In +18, Total +27 for its first player.
No rules, SQL, settlement or migration files changed in this correction.
Application TypeScript and production build also pass. Correction logs use the
`scorecard-tests.log` and `nine-*.log` names in the existing qualification folder.

Run `node dev/six-card-golf/match-length-review.mjs`, then open
[local match-length review](http://127.0.0.1:5254/__length-review).
Choose a length, inspect the flag and completed-hole scorecard, then show all
final results. The review uses synthetic public snapshots and holds results for
inspection; it does not play or settle a live match.

### Equal cell geometry and final title correction

The follow-up replaces independently sized native table columns with shared,
container-relative grid tracks scoped to 18-hole scorecards. Front Nine omits
only the overall Total track; both sections now have identical corresponding
cell widths, heights, alignment and typography. Final 18-hole results show one
visible **Final Scorecard** title, with Front Nine and Back Nine section labels.
The existing dialog description remains available to assistive technology.
Out, In, bold Total, original pencil strokes and 3/6/9-hole layouts are retained.

Measured rendered hole cells (width × height, CSS pixels):

| Viewport | Front Nine | Back Nine | Maximum corresponding-cell geometry difference |
|---|---|---|---|
| 320 × 720 | 16.734375 × 40 | 16.734375 × 40 | 0 |
| 390 × 720 | 21.078125 × 40 | 21.078125 × 40 | 0 |
| 1024 × 768 | 28.671875 × 40 | 28.671875 × 40 | 0 |

All 15 browser cases pass, including shorter lengths and three/four-player
mobile layouts. Checks compare every matching cell and verify that the table
width difference equals the extra Total column within subpixel rounding
(0.07px tolerance). All 46 focused scorecard/table tests, application TypeScript
and the production build pass. Latest logs are `equal-tests.log`,
`equal-typecheck.log`, `equal-browser.log` and `equal-build.log`; rendered
measurements are in `browser/evidence.json` under the same qualification folder.
The 320px two/four-player screenshots were visually inspected. Physical iPhone
Chrome smoke remains pending. No rules, SQL, settlement or migration changed.

Reproduce checks:

- `node dev/six-card-golf/match-length-proof.mjs`
- `node node_modules/vitest/vitest.mjs run src/components/golf src/lib/golf src/components/DealerGameSetup.runBack.test.tsx --maxWorkers=2`
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`
- `node dev/six-card-golf/match-length-review.mjs --check`
- `node node_modules/vite/bin/vite.js build`

Browser evidence and screenshots are under
`qualification.local/golf-match-length/browser/`; test/build logs are in its parent.
The preview and SQL are separate local qualification lanes, not a claim of a new
hosted end-to-end qualification. Physical iPhone Chrome acceptance remains owner
smoke. Production release requires separate approval, current-main reconciliation,
registered migration, hosted qualification and exact-SHA publication.

