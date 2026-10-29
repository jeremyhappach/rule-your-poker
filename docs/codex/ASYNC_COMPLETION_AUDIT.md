# Five-game async completion audit — October 29, 2026

Jeremy approved publication of the Tri-Towers correction, asked whether the
other async games shared the defect, then explicitly approved correction and a
separate release for Run21, Quintzee and Box Drop. No schema, financial policy,
admission or customer-state change is part of either release.

## Tri-Towers release checkpoint

Candidate `1b222a254f04291f5eaf2b0e0bce696a77575bc4` is fast-forwarded to main,
pushed through the required helper and production READY as
`dpl_AKV7bUTPoJ1YU2VELDHosbe5PKsH`. Remote main and the public manifest match.
Validation: application typecheck, production bundle, 241 harness tests, 39
focused tests and the 390px synthetic-transport browser sequence passed.
The first full source run had two existing Run21 simulation timeouts while
compilation overlapped; all 18 Run21 authority tests passed unchanged in
isolation, then the clean main checkout passed all 3,156 tests / 456 files.
Assertions and timeout limits were not changed.

Publisher `40879563973` attempt 1 verified the production manifest, then failed
at 13:12:28 UTC with HTTP 503 `manifest_invalid` from the existing publish-release
function. The persisted receipt remained on `10c467ea9`. The owner was asked to
rerun failed jobs because this integration previously returned 403 for rerun
requests. No direct release-setting write or credential/control workaround was
attempted. A workflow-specific listing URL was unsupported by the connector;
its documented repository workflow-run listing supplied the run successfully.

## Findings and correction

| Game | Actual async-shell evidence | Correction |
|---|---|---|
| Words | Own word presentation, duplicate/late receipt, submitted winning word, accepted pass and fresh terminal/forfeit return pass. | No product change. Existing persisted request UUID and score receipt remain authoritative to their respective owners. |
| Run21 | Saved collect, exhaustion and timeout results remained on the felt indefinitely; shared score projection and medal were absent. | Preserve entered attempt; project saved result into the existing five-second count window plus the frozen 104/105 medal allowance; render canonical medal/count/audio and return when that window ends. |
| Tri-Towers | Previously reproduced unstable identity, missing result projection and missing return; seven regressions pass after correction. | Preserve the published correction and existing shared board/presentation. |
| Quintzee | Saved results remained indefinitely and handoff changed scope, suppressing canonical count-up. | Preserve entered attempt/scope; let the existing view count the authoritative result; return at its saved deadline. |
| Box Drop | Saved results remained indefinitely and handoff changed scope, suppressing canonical count-up. | Preserve entered attempt/scope; let the existing view count the authoritative result; return at its saved deadline. |

Only `DelayedTurn.tsx` changes runtime behavior. It also prevents older duplicate
snapshots from rewinding the presentation clock, pins the entered round when
later rounds arrive, and stops showing an in-flight Saving/Placing label for an
already-saved result. No shared game hook, rule reducer, financial function or
normal synchronous lifecycle was edited.

Run21's saved attempt supplies its result timestamp and score. Presentation sums
only this player's immutable attempts through the entered round for the displayed
cumulative score; it does not write or calculate gameplay points or balances.
The existing `SCORE_PRESENTATION_MS` and frozen `medalDuration` define its window.
Quintzee, Box Drop and Tri-Towers use the already-persisted board deadline.

## Coverage and limits

The focused suite currently passes 58 tests: 34 actual async-shell cases, seven
Tri-Towers regressions, five Words transport tests, three Words score-receipt
tests and nine delayed server-adapter tests. The shell cases render the real
FullscreenGameShell and actual game views; transport/audio are mocked. They
cover each sibling's normal/clear or exhaustion/no-match finish and gameplay
timeout, saved terminal results, forfeit without an attempt, fresh reentry,
older duplicates, late results, later-round snapshots, and retrying the same
request UUID/payload after a lost accepted response. Run21 104 and 105 medals,
intermediate count values and one fanfare are asserted.

The final source run passed all 3,190 tests / 457 files, including the existing
Run21 authority simulations at their unchanged timeouts. Final application
typecheck, production bundle and all 241 harness tests pass. Typecheck caught a
test-only Testing Library option; changing the exact role-name query to an
equivalent anchored regex fixed its type without weakening the assertion, and
all 34 async-shell cases passed again. No timeout or gameplay assertion changed.

Phone-sized browser checks use the real async adapter, canonical shell and game
views with synthetic HTTP projections, never a production account or wager.
Final results: Run21 returned after 8,015 ms, Quintzee after 5,043 ms and Box
Drop after 8,091 ms, with visible intermediate scores, one completion action,
duplicate receipt handling and fresh reentry without another action. Screenshots
were inspected. Quintzee and Box Drop were rerun after the pending-state correction.

These tests establish the client presentation and request boundary. They do not
establish fresh end-to-end database settlement, actual network delivery exactly
once, every legal gameplay path, physical-device audio, or production owner
acceptance. Existing authoritative child/parent completion, privacy, frozen
deadlines, canonical parent-only settlement and negative-balance mechanisms are
unchanged. Earlier rollback/race qualification remains recorded in
`ASYNC_COMBINED_RELEASE.md`; no customer or synthetic production rows were touched
in this follow-up. Words exchange and every hidden/offline interruption permutation
have source/related-hook coverage, not a new complete async browser campaign.

Evidence is under `qualification.local/async-combined/`: `tri-release-*`,
`sibling-*` and `{run21,quintzee,boxdrop}-completion-*`.

The sibling candidate is qualified for its approved separate publication.
Production main remains at the Tri-Towers checkpoint while its publisher retry
is pending. Do not advance main to hide or work around the missing release
receipt. Physical-device owner smoke remains due after publication.
