# Mega UI transitions — local candidate, 2026-10-25

Owner approved only local implementation and qualification of two presentation
fixes. Base: `33b641bb6d9841764d7af59b27f0c935a2e42fd3` (main at inspection).
Branch: `codex/mega-ui-transitions`. No integration, push, migration, deployment
or activation is authorized by this checkpoint. Production smoke is pending
separate publication approval.

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
