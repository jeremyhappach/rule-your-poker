# Mega UI transitions — published, iPhone smoke pending, 2026-10-25

## Publication verification

- Live/remote main SHA: `5af9e86ff204e35d9deb573e0c6ab8c39a2abfa4`.
- Vercel project `ptown-poker`, production deployment
  `dpl_AWuyk7HN4jetnU1gDEwGRRmNpBgg`: READY, `holm357.com` alias attached,
  no alias error, Git SHA matches.
- Public `/build-manifest.json`: HTTP 200, matching buildId,
  bundle `assets/index-Bhzx22_-.js`. Mega route returns HTTP 200 with that bundle.
- Persisted `system_settings.release_publication`: matching buildSha,
  publishedAt `2026-10-25T21:32:38.003Z`, deploymentId `40235906451-1`.
  This identifier is the GitHub publisher run/attempt, distinct from Vercel's ID.
- GitHub publisher run `40235906451`, attempt 1: signal verified without rerun,
  credential fallback, manual signal override or security changes.
- Main's existing Cribbage snapshot retained SHA256
  `91EABE3E91B93DE30CE8B3ECC25EC8C291E983F0D7F672D1E9263C0FB200F27A`;
  its temp files and all other worktrees were preserved. Separate Battle31 smoke
  changes were excluded. No runtime telemetry or database migration was added.

This post-publication evidence is recorded locally after the release; it does
not initiate another deployment. Physical iPhone acceptance remains pending.

Owner first approved local implementation and qualification, then separately
approved production release of exactly candidate
`2945df81a996fedccb286dfa0cbf1c13c80fc9b5`. Base:
`33b641bb6d9841764d7af59b27f0c935a2e42fd3`, verified on remote main and the READY
production deployment at release preparation. Branch: `codex/mega-ui-transitions`.
The separate `codex/battle31-smoke-local` work is excluded. No migration,
admission, defaults or financial changes are included. No runtime telemetry
was added: render observation and diagnostic state exist only in local fixtures.

Release notes: Mega clears decorative hover feedback at a new hole and waits
until card/stock presentation settles before showing Stand Pat and Discard.
Discard disappears after consumption. Existing versioned eligibility, scoring,
keyboard focus and recovery are preserved.

Publication gate: pass aggregate validation on this main-based candidate,
fast-forward main without disturbing its existing Cribbage snapshot/temp files,
tag the release checkpoint, and use the approved push helper. Verify remote SHA,
READY production deployment, public manifest and persisted release signal agree.
The normal GitHub publisher owns the signal; no manual signal override is included.

iPhone smoke: refresh Mega, complete opening choices, replace a concealed and an
exposed card, discard a draw, and watch Stand Pat/Discard through each transition.
Finish the hole and check for residual outlines on the next deal. Check Stand Pat
confirmation/cancel and exhausted discard allowance. Report course, hole and
portrait/landscape orientation if a symptom remains. Physical-device acceptance
is still pending, including the exact accidental orange-focus symptom.

## Causes and correction

- New-hole outline: the decorative `.mega-card:not(:disabled):hover` outline
  and lift can apply to a newly mounted card under a stationary pointer. Remove
  that rule; retain scoring highlights, opening selection and keyboard focus.
  Scoring indices already clear before the new hole and card keys include hole
  identity. The exact reported orange-focus carryover was not reproduced.
- Action flicker: replacement presentation clears pending stock, then unlocks
  before the automatic-draw effect marks the request busy. The old UI could
  briefly enable Stand Pat. The next draw response also mounted Discard before
  its stock reveal finished. `MegaArcade` now shares one scheduled-draw predicate
  between render and effect, rechecking eligibility when the effect executes.
  An in-flight marker spans the automatic request, including recovery, and
  clears in `finally`. `MegaCardGolfGame` hides actions until presentation and
  automatic draw settle. Hidden actions are unmounted, so cannot receive focus
  or appear in the accessibility tree. Request busy still disables input.

Discard disappears after accepted consumption and returns only with settled
pending stock. Exhausted allowance preserves the existing disabled Discard
treatment when stock is present. `/3` final-stock Stand Pat remains available
with zero discards. `/4` still permits Stand Pat without pending stock after a
settled failed draw; the transient presentation gate adds no server condition.
Existing retry deduplication, explicit recovery, opening choices and expiry
guards remain intact. The user-input reservation does not block automatic draw.

Rules, scoring, timers, course configuration, APIs, database contracts, other
games and multiplayer Golf are unchanged.

## Changed files

Product: `src/components/megaCardGolf/MegaArcade.tsx`,
`MegaCardGolfGame.tsx`, `megaCardGolf.css`.

Regression tests: `src/components/megaCardGolf/AutomaticStock.test.tsx` and
`Gameplay.test.tsx`.

Local browser fixture: `dev/mega-card-golf/ui-transitions/index.html`, `main.tsx`,
`vite.config.ts`, `browser.mjs`. Uses the actual components and shared reducer
with local in-memory state and delayed responses; no production transport.

Documentation: this file and `docs/codex/CURRENT_RELEASE.md`.

## Evidence

Release qualification: application TypeScript passed. Aggregate source suite
completed 422 files with 2,922 passes and one unrelated Run21 5-second timeout.
That exact test (`retains the frozen 105 deck for both players through recovery
and every normal round`) passed unchanged in 917 ms on its single isolated
rerun, retaining the original timeout. All 2,923 source tests are accounted for.
The 241 harness tests in 12 files and production Vite build passed afterward.
Logs: `evidence.local/release-gates.log`, `release-harness.log`,
`release-bundle.log`. The source run's line-ending-only Cribbage snapshot rewrite
was restored in this originally clean candidate checkout; main's pre-existing
snapshot modification remains untouched. No test timeout or other-game code was
changed. Release checkpoint tag: `mega-ui-transitions-20261025`.

- `vitest run src/components/megaCardGolf src/lib/megaCardGolf`: 99 tests,
  11 files passed. Includes every render across concealed/exposed replacement
  and discard handoffs; delayed draw; failed/lost response; reconnect; duplicate
  suppression; all four versions; allowances; opening and terminal flow.
- `tsc -p tsconfig.app.json --noEmit`: passed. Installed `tsgo` command was
  unavailable; no tools or dependencies installed.
- `vite build`: passed (existing browser-data/chunk warnings).
- `node dev/mega-card-golf/ui-transitions/browser.mjs`: 10 browser checks passed,
  zero page errors and zero external requests. Chrome desktop 1000×850 and
  touch emulation 390×844. Checks action absence throughout replacement/reveal,
  pending-stock return, stationary-pointer next hole, keyboard Tab/Enter,
  sequential touch opening and `/1–/4` final-stock/allowance behavior.
- Screenshots inspected: `evidence.local/concealed-reveal.png`,
  `new-hole-stationary-pointer.png`, `keyboard-focus.png`, `touch-new-hole.png`.
  Machine-readable browser result: `evidence.local/report.json`.
  Evidence files are ignored local artifacts, not Library uploads.

Earlier test attempts exposed a fixture using the old opening contract, an
identity-transform assertion mismatch, and a transient missing local binding.
Those were corrected; the final source passed the checks above and a fresh
browser run without hot edits.

Physical-device and owner acceptance remain pending. Chrome touch emulation
does not establish Safari behavior. The preserved orange keyboard ring was
verified with intentional keyboard focus, not reproduced as accidental residue.
