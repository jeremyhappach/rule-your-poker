# Multiplayer seam campaign qualification — 2026-09-05

Status: **full campaign held at the qualification gate**. Jeremy authorized
continuation after the Holm/Yahtzee release, without further micro-approvals,
with conservative usage. This is the continuation of the existing campaign,
not a new coverage claim.

## Target and execution

- Frontend and origin/main matched `682e2d0c3392ccaabc33172ba29c23df8a39d32a`;
  public bundle `assets/index-CIZARlpQ.js`, published at 16:38:08 UTC.
- Latest migration: `20260905163042`. Public/private function-definition digest
  `ebab1b397ea704605a019bc562786eb0` remained stable during the initial sample.
- Production preflight found no recently active unfinished real-money session.
  Only exact fake-money sessions used the existing dedicated CAMP_A/CAMP_B pairs.
- One primary agent, one browser worker, no automatic retries, no bot substitutes,
  no global setting changes, no product/schema edits, and no overnight soak.
- Existing cross-country drivers include delayed HTTP/Realtime, offline session
  entry and lost committed ante responses. These are faulted canaries, not F00
  healthy-baseline coverage. The actor/peer projection budget was 6,000 ms.

## Retained prior evidence

The inventory inspected the original checkout's `artifacts/`, excluding attachment
copies, and matched retained scenarios to manifest version 4. It found 442 scenario
records across 144 of 165 declared scenarios: 307 records reported passed and 135
reported failed. These are historical status fields, not independently requalified
passes or counts of distinct requirements. Unmatched records and absent records
remain explicit; evidence outside that root is not claimed absent everywhere.

Of those records, 392 lacked raw recordings or fields required by the stricter
reducer, 46 require revalidation under it, and four recordings were consistent.
None establishes current-build coverage. Missing dice fields were not invented;
folder names were not treated as verified build provenance.

The 79-requirement manifest has 52 executable bindings, 25 missing-driver entries
and two justified N/A entries. Newer standalone session-intent, participation and
Yahtzee rejoin tests are candidate partial coverage; they do not automatically
satisfy the broader unbound contracts. Three-/four-human cases remain required.

## Qualification findings

All seven initial scenarios completed their primary gameplay/terminal assertions
and verified exact cleanup. Only Cribbage His Heels and Yahtzee Chance passed the
complete observer gate initially. The other five must not be reported as passes.

- **Holm / 3-5-7:** the next actor submitted before the peer had a same-round
  baseline. In the retained Holm case the peer entered that round 392 ms after
  the click. This does not prove a freeze; it means this detector cannot attribute
  that action's progress from the captured baseline. Do not silently accept an
  unrelated successor update or remove this race from the chaos matrix.
- **Gin:** 16 pile actions lacked attributable peer progress before the next
  tracked action; two actor observations exceeded 6,000 ms. Primary gameplay
  completion does not explain or waive these findings. Private/local action
  contracts and the two latency observations require bounded qualification.
- **Horses / SCC:** acting-seat snapshots had no `data-die-idx` dice while the
  canonical control advanced through Roll 1/2/3. The reducer ignored that real
  gameplay ordinal and reported missing/late actor progress. This is an
  identified observation defect, not a demonstrated game freeze.

## Bounded harness correction

The reducer now includes the canonical Horses/SCC roll ordinal in its gameplay
signature. It reads only `horses-scc-turn` in those two game types. Button
enabled/disabled state, other text and unrelated surfaces cannot establish this
progress. No gameplay counter, product state, timer, or database owner changed.
This remains projection evidence; exact authoritative outcome assertions are
still required.

Two positive regression cases failed before the correction. Afterward all 37
harness/manifest checks and the focused detector TypeScript check passed. The
saved Horses/SCC recordings replay without their former attribution failures.
Both live reruns passed in 1.8 minutes; original failure recordings are retained.
The final sample is **four strict passes and three unqualified scenarios**, across
nine fake-session executions with cleanup verified for all nine. Application
TypeScript also passes. No additional full-suite run was necessary for this
test-only correction.

| Qualification scenario | Latest verdict |
| --- | --- |
| Holm all-fold carry | Unqualified: peer baseline |
| 3-5-7 both-fold | Unqualified: peer baseline |
| Cribbage His Heels nonterminal | Pass |
| Gin first upcard / rejoin | Unqualified: attribution and latency |
| Horses round flow | Pass after detector correction |
| Ship Captain Crew round flow | Pass after detector correction |
| Yahtzee Chance | Pass |

## Execution boundary and next work

### Action attribution follow-up

The Holm/357 missing-baseline cases and concealed Gin actions now use specific
mutation receipts. Holm requires the committed `holm_turn_sequence`; Gin
requires the action's committed `actionCount`; 357 requires the exact submitting
player's decision lock. Both clients must render the target under the same
session, dealer-game and round identity. A prior-round peer baseline alone no
longer prevents attribution, but merely arriving in the current round is not
enough. Actor timing also waits for the accepted server acknowledgement.

The browser records only sanitized progress targets and request fingerprints,
never response hands or request cards. Existing authoritative fields are exposed
as passive DOM attributes; there are no new counters or progression owners.
Missing responses/projections fail closed. Identical immutable retries remain
bound to the first action; the intentional Gin lost-response injection uses
the existing finite recovery budget. Normal latency limits are unchanged.

The new reducer checks failed before implementation. After correction, 46
harness checks, focused detector TypeScript, ten isolated browser controls,
1,453 source tests and the full production build pass. The browser controls
include stuck peer, cosmetic-only progress, wrong session, blocked control,
valid retry, and previous-round catch-up without the committed action.

The original Gin latency flags were two Done Laying Off clicks, with RPC
durations of 635 and 925 ms and actor observations over six seconds. The new
live rerun must distinguish committed-action application from later scoring
presentation; those recordings alone do not establish a product latency fix.
Only the three affected live canaries will rerun after publication. Their final
verdicts and cleanup evidence belong in the external `action-proof-results.json`.

Do not launch the 165-row matrix, ten-repetition sets or soak while this gate
remains held. Next, establish per-action contracts for concealed Gin actions and
for actions submitted while another seated client is still presenting the prior
round. Preserve negative controls for absent progress, cosmetic changes, wrong
identities, missing evidence and unusable controls. Do not increase latency limits
or add blanket exemptions to make prior failures green.

Then rerun the three affected qualification scenarios and finish the F00 baseline
before broader schedules. Bind or implement the 25 unresolved requirements only
after checking existing standalone assertions. Existing approval persists; this
hold avoids spending usage on ambiguous repetitions, not a request for approval.

## Follow-up live verdicts

The committed-action follow-up used frontend `844c8252859dd354cba2bea341536b9ba9379183`.
Gin passes with 51 bound actions. Its two Done Laying Off actor observations
are 881 and 4,871 ms; the seated peer observations are 2,231 and 1,445 ms.
The 357 terminal decision clears participant locks atomically, so its receipt
now supplies an exact completed-round target. That focused rerun passes.

Holm exposed a genuine database defect: the single-stayer Chucky draw excluded
only the stayer and community cards, so it could draw a folded player's card.
Two Stay RPCs failed with SQLSTATE 23514 / `holm_card_integrity:duplicate_card`.
Migration `20260905192836` excludes all dealt round cards. A deterministic
rollback reproduction fails before this change and the complete settlement
proof passes with it before and after application. Integrity checks remain on.

The corrected Holm run completes gameplay without card-integrity failures,
but remains a strict timing failure: 6,624 ms peer recovery after the injected
ante response loss and 6,592 ms actor application for a Fold (3,639 ms RPC).
These are retained observations, not evidence of a permanent freeze and not
permission to widen normal limits. Next isolate that Fold's RPC/accepted-frame/
render interval and distinguish the explicit ante fault's recovery contract.
No broad or repeated run is justified until this remaining qualification issue
is explained. Five follow-up fake sessions were cleaned up; all runs, including
failures, remain in `action-proof-results.json` and `holm-cohort-proof.json`.

The latest retained seven-game sample is six strict passes and Holm unqualified.
It spans recorded builds and does not replace the full F00 baseline. Forty-seven
harness checks, the detector TypeScript check and nine focused Holm ownership
tests pass. The full matrix and overnight soak remain held for cost control.

## Evidence

### Holm timing closure

Frontend `83c6070b498c8ada838d9e93706588fa9d9083a0` removes the redundant
selected-round metadata read (978 ms in the retained failure) and the 150 ms
Stay/Fold refresh timer. The frame's exact selected identity and card guards
remain intact. Deliberate ante-response loss now has its existing finite fault
contract recorded explicitly.

The first rerun exposed a driver defect: the connected peer was closed 1,323 ms
after the final Stay before it could finish its live update. Its replacement's
startup was then counted as ordinary action latency. The shared driver now
asserts both connected Session Ended panels before the separate fresh-mount
proof. It retains the original action times and six-second ordinary budget.

The corrected focused run passes in 2.1 minutes: four Holm decisions, maximum
actor 3,828 ms and seated-peer 2,902 ms, zero observation violations or coverage
gaps, both live terminal panels, fresh-peer lobby entry, and verified cleanup.
Both follow-up fake sessions have zero remaining database rows. Detailed
before/after evidence is in `holm-refresh-results.json`; failures remain saved.
The retained seven-game qualification sample now has seven passes across its
recorded builds. The full current-build F00 baseline and unbound requirements
are still outstanding; this is not exhaustive multiplayer acceptance.

The application build/typecheck, 1,453 source tests and 47 harness tests pass.
A standalone compilation of the branch driver additionally reports pre-existing
Gin return-type narrowing and PostgREST `abortSignal` typing errors in unchanged
code. Those are queued separately; the corrected live browser driver passes.

Retained under `C:/Users/jerem/Desktop/poker/poker-seam-campaign-2026-09-05/`:

- `historical-ledger.json` and `inventory.mjs`: scenario/requirement reconciliation.
- `qualification-ledger.json`: original runs, reruns, verdicts and exact game IDs.
- `release-evidence.json`: release, database fingerprint and execution profile.
- `browser/`: scenario evidence, observer recordings and failure traces/screenshots.
- `dice-detector-before.txt`, `dice-detector-after.txt`: red/green detector proof.

This gate does not establish exhaustive coverage, production real-device
acceptance, or elimination of multiplayer freezes. Previously queued production
defects remain separate from these observed qualification results.
