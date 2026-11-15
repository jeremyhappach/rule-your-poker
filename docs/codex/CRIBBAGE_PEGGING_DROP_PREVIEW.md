# Cribbage pegging and 357 Drop suit preview — November 14, 2026

Jeremy approved the diagnosed pegging correction, added more prominent 357 Drop
suits to this pass, and explicitly requested a preview before publication.
Production remains on the accepted hand-scoring release `f4a472e66`.

## Changes

Cribbage admits each accepted scoring event once under its game/dealer/round/hand
identity. A played-card award waits for that card's existing transport handoff;
the canonical notice must be active before its point sound starts. The final
Last +1 remains admitted when the same snapshot starts counting. The counting
overlay waits for the final notice retirement and the complete audio burst.
Opponent final-card transport is retained across that same phase transition.

The live handoff is distinguished from reconnect elapsed time, so holding the
final peg never silently skips the first hand-scoring combination. Persisted
counting progress and actual recovery still retain their existing resume rules.

The event queue is presentation-only. Authoritative scores stay live; no rule,
RPC, settlement, count-plan, pause command, audio sample or cadence changes.
Historical events on mount, duplicates and interrupted pending awards stay
silent. The previously accepted hand-counting sequence is unchanged.
Only the canonical table uses event-owned pegboard audio; existing isolated
sound-lab delta adapters remain available for sample auditions.

357 Drop enlarges its existing vector suit paths by 40% in each dimension,
inside the same draw and lane cards. Rank, card geometry, controls, rules and
other games' shared card faces are unchanged.

## Preview and verification

- Run `node node_modules/vite/bin/vite.js --config dev/scoring-polish-preview/vite.config.ts`.
- Open `http://127.0.0.1:4346/`. 357 Drop offers an original/larger suit toggle;
  Cribbage offers Pair, opponent Pair, Last, Go and 31 audio demonstrations.
- The preview uses actual production components with isolated fixture state and
  a local audio manager. It does not write live games or account preferences.
- `node dev/scoring-polish-preview/verify.mjs` passed native Edge audio admission,
  announcement-at-cue-start, final handoff and mobile suit-size checks. The
  browser blocks all non-loopback network requests. Evidence is retained in
  ignored `qualification.local/scoring-polish/`.
- 33 focused checks cover transport timing, Last +1, duplicate/rejoin/interruption,
  accepted hand scoring and actual parent-table counting admission. Final
  `npm run build` passes typecheck, 581 application files / 4,250 tests,
  241 harness tests, 46 release-tooling tests, Vite and the 90 MB size gate.
  All suit symbols fit
  within their cards at 320×740, 390×844, 844×390 and 1200×800 without overflow.

Preview checkpoint: `cribbage-pegging-drop-suits-preview-20261114`.
No production push or deployment is authorized until Jeremy reviews the preview.
