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
  configured hole, with 18 split into 1–9 and 10–18. Each section shows the overall
  completed-hole total. Pencil strokes, row-completion total release, blanks,
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
| Browser | 14 actual canonical table/scorecard cases: all lengths at 320/390/1024px, plus 18 holes with four players at 320×568 and 390×680. Edge/Blink verifies all scores and pencil glyphs, full headers, below-flag text, horizontal/vertical fit and no console/external-network errors |

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

Run `node dev/six-card-golf/match-length-review.mjs`, then open
[local match-length review](http://127.0.0.1:5254/__length-review).
Choose a length, inspect the flag and completed-hole scorecard, then show all
final results. The review uses synthetic public snapshots and holds results for
inspection; it does not play or settle a live match.

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

