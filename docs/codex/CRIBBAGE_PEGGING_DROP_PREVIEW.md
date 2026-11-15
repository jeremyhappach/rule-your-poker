# Cribbage pegging and 357 Drop suit preview — revised November 15, 2026

Jeremy approved the diagnosed pegging correction, added more prominent 357 Drop
suits to this pass, and explicitly requested a preview before publication.
Production now serves `9415f9d77fda5a6a56ac207bedb42aabec06bce0`, including
this approved follow-up to the accepted hand-scoring release `f4a472e66`.

Latest disposition: Jeremy accepted both the revised preview and the additional
opponent trips-to-next-hand demonstration, then approved production on
November 15. This approval supersedes the historical preview holds below.
Approved candidate: `91e5d7dda0f7b5efc432b0c2f362cfa3f1569b06`; its production
source is unchanged from the fully qualified `a981d9453` tree. Release tag:
`cribbage-pegging-drop-suits-20261115`. No migration or infrastructure change.

Publication receipt: Vercel production deployment
`dpl_7qc2biLNeUgB2JdDG1xSDUQmcrv6` reached READY. Both production origins
serve the exact release SHA and `assets/index-LTxFBpK6.js`; HTML, /auth,
JavaScript and split stylesheets return 200. The Go cue and enlarged suit rule
are present in the served assets. The ignored evidence file is
`qualification.local/pegging-production-receipt.json`. This verifies delivery;
Jeremy's production gameplay smoke is still pending.

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
RPC, settlement, count-plan, pause command, point sample or cadence changes.
Historical events on mount, duplicates and interrupted pending awards stay
silent. The previously accepted hand-counting sequence is unchanged.
Only the canonical table uses event-owned pegboard audio; existing isolated
sound-lab delta adapters remain available for sample auditions.

357 Drop enlarges its existing vector suit paths by 40% in each dimension,
inside the same draw and lane cards. Rank, card geometry, controls, rules and
other games' shared card faces are unchanged.

## November 15 preview correction

Jeremy reported that opponent +2 was late and that Go itself should not award
a point. The saved browser trace confirmed 2,169.9 ms from landing to the
opponent cue: the fixture remounted each scenario with a new hand scope but
left its predecessor's notice on the persistent canonical rail. Each fixture
now retires its exact outgoing notice scope. Its destination is measured from
the settled-card slot, and the opponent demonstration credits the opponent.
Production transport now hands off at its CSS transition completion, retaining
the existing timeout fallback and authoritative-destination readiness guard.

A live Go declaration is detected from authoritative `goCalledBy` and the
reset-surviving bubble latch. It gets a distinct 200 ms falling tone, scoped by
hand and pegging action sequence, after any triggering card lands. Duplicate,
historical and recovery declarations remain silent. Go does not create a score
event. A real server-awarded `go_point` keeps its point click and is described
as "Last card (+1)". The fixture's Go button now demonstrates a declaration
with unchanged scores, using the existing remote Go bubble.

The native check now requires actual audio scheduling within 120 ms after the
CSS landing event, checks the opponent identity and scores, and verifies that
Go schedules only its distinct cue. The original check only prohibited early
audio and incorrectly passed the stale-notice delay. No shared rail or game
rules were changed. The larger 357 Drop suits are unchanged.

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

November 15 qualification: 31 focused checks passed, followed by the complete
build: typecheck, 581 application files / 4,255 tests, 241 harness tests,
46 release-tooling tests, Vite and the unchanged 90 MB size gate. Final native
Edge evidence records point-audio scheduling 6.1–7.9 ms after CSS landing,
including 7.9 ms for opponent +2. Go schedules one distinct tone with scores
remaining 10/20; its remote bubble is visible. Final Last +1 still holds the
hand until its notice and full sound finish. This is local qualification;
Jeremy's revised-preview acceptance and production smoke remain outstanding.

Original preview checkpoint: `cribbage-pegging-drop-suits-preview-20261114`.
Revised local checkpoint: `cribbage-pegging-drop-suits-preview2-20261115`.
No production push or deployment is authorized until Jeremy reviews the preview.

## Opponent trips through the next deal — November 15

After approving production, Jeremy immediately held publication to see opponent
trips continue into the next hand. No integration or push had started.

Open `http://127.0.0.1:4346/?demo=opponent-trips` and select **Opponent trips →
next hand**. This isolated scenario starts at the opponent's final crib count:
7♣, 7♦, 7♥, K♠ with Q♥ cut. It uses the production counting component, canonical
announcement rail and point audio. An early successor frame arrives during the
six-point burst, while the original counting clock and hand remain presented.
The completion callback then mounts the production Cribbage deal orchestrator,
card transport and deal runtime: six cards arrive for each player. The score
stays at 10/26 through the transition. Fixture state does not write live games.

Native Edge verification observes all six actual Web Audio sample starts and
every rendered frame through their tails: the old hand, three highlighted 7s
and matching opponent callout remain present. The burst finished at 9,494.6 ms;
the old hand completed at 16,281.1 ms and next-deal dispatch began at 16,291.0 ms.
All twelve cards settled, with no extra scoring cue. These timestamps are from
the local verification run. Existing parent hand-retention and scoring tests
also pass. The production implementation is unchanged by this preview addition.

Publication remains held for this additional preview review. Evidence and both
frames are in ignored `qualification.local/scoring-polish/`.
