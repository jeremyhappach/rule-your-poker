# Voyage opening and Horses hold suggestions — November 8, 2026

Implements Jeremy's explicit polish request from production `c816738e1`.

## Changes and preservation

`SoloShipCapVoyage` marks the existing dice row unrolled until an opening roll
starts. CSS hides it with visibility, preserving layout space and removing the
unrolled dice from accessibility presentation. Each next round uses the same
condition. Ready when you are is white; only the completed-manifest heading gets
the compact dark translucent badge and bold white lettering. Qualification dice,
roll animation, cargo placeholders after banking, tally and continuation retain
their existing owners.

`SoloHorsesBlitz` now scopes manual hold intent to hand ID plus roll number.
`horsesBlitz/holds.ts` projects the authoritative offer's rank/size onto the
settled dice, including its wild 1s. High Card and unrolled hands suggest none.
For retained size-only offers, it selects a deterministic matching set of the
server-provided size; old non-scoring offers remain unheld. No scoring formula or
new evaluation authority is introduced.

While rolling, the animation keeps the exact submitted manual mask. When the
new roll settles, its new suggestion takes over. Hold/unhold taps then replace
that suggestion for this roll, including an explicitly empty selection; clock
ticks, offer count-up and same-roll recovery do not restore the suggestion.
The existing roll request sends only those chosen indices. Bank continues to
submit no held indices and uses the existing server evaluation of all five dice.
Hand/round changes cannot reuse the previous hand's manual choice.

Rules, frozen versions, score formulas, deadlines, random generation, financial
isolation, result receipts, sounds and existing input/replay guards are preserved.
No migration, production-data write or admission change is needed.

## Validation

- Installed TypeScript compiler passes: `node node_modules/typescript/bin/tsc
  -p tsconfig.app.json --noEmit`.
- 25 focused tests pass across hold suggestions/override identity, Horses command
  validation, roll animation, Bank offer presentation and Voyage action recovery.
- Production Vite build passes with existing bundle/import/Browserslist warnings.
- React review confirms derived suggestions introduce no new effects, timers,
  network calls or scoring owner. Existing aria-pressed and disabled behavior
  continue to describe every actual hold selection.
- `node dev/ptown-polish/voyage-browser.mjs ptown_polish_1794161408458` passes
  all three pre-opening states and MANIFEST COMPLETE states, anchored Rolls Left
  before/during opening rolls and across rounds, white ready text, badge contrast,
  nine actual SQL-backed banks, qualification flights, 9,900 final score,
  continuation, bells, mute, saved-run return and five viewport layouts.
- `node dev/ptown-polish/horses-browser.mjs ptown_polish_1794161835570` passes
  actual Arcade UI/API/local SQL offers and persisted banking:

| Settled dice | Offer | Suggested dice (one-based) | Banked |
| --- | --- | --- | ---: |
| 5–6–6–5–5 | Natural Three 5s | 1, 4, 5 | 382 |
| 5–2–1–3–5 | Wild-assisted Three 5s | 1, 3, 5 | 319 |
| 6–2–1–3–4 | Wild-assisted Pair of 6s | 1, 3 | 99 |
| 2–3–4–5–6 | High Card | None | 33 |

Starting with wild-assisted Three 5s, the browser overrides holds to dice 2 and
5. The choice survives offline/online recovery while the Bank offer remains 319.
The next command persists held indices `[1,4]` (zero-based, order irrelevant),
animates/rerolls only dice 1, 3 and 4, and lands 6–2–3–4–5. The new High Card
offer is 28 on roll two and its suggested hold set is empty. Further checks
preserve manual third-roll banking, rising/falling offers, muted hold cues,
square dice, Rules, and next-hand progression.

Both browser suites use installed desktop Edge with touch viewports and
deterministic local randomness; actual scoring and bank responses are SQL-backed.
All synthetic data/random-source overrides roll back. No physical iPhone or
production gameplay smoke is claimed. Screenshots and JSON evidence are under
`qualification.local/ship-cap-voyage/browser/` and
`qualification.local/horses-blitz/polish-browser/`.

## Publication and owner acceptance

Checkpoint: `voyage-horses-holds-polish-2026-11-08`. The verified annotated tag
records the production deployment and matching public build identity.

Physical iPhone acceptance: inspect Voyage before Roll (1), at MANIFEST COMPLETE
and before the next round's roll. In Horses check a natural meld, a meld using a
wild 1 and High Card; override holds and verify the next roll changes only the
unheld dice while Bank always represents the best settled hand.
