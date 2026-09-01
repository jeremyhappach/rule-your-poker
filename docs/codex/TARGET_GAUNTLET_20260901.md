# Yahtzee, Holm, and 3-5-7 production fake-money gauntlet — 2026-09-01

## Scope and safety

This campaign exercised the deployed `https://holm357.com` frontend against
Supabase project `xvhmbuppghwmwpwrkzao` with two complete human identities per
isolated slot, the continuous observer, and a 6000 ms action-to-peer budget.
The observed production build was
`27b52d436cab206a83777a39ce8484c50972376b`
(`assets/index-DkgDxAT3.js`). Every created session was fake money. No
real-money browser session was opened or mutated.

The campaign attempted 66 rows: 45 deterministic gameplay/rule rows, nine
deadline/rejoin rows, and 12 lifecycle transitions. Strict outcome was 27 pass
and 39 fail. A row fails when its primary assertion fails or the continuous
observer records a missing timer, browser invariant violation, or peer receipt
over 6000 ms. This is a time-bounded discovery result, not full coverage and
not a no-bug declaration.

## Outcomes

| Suite | Pass | Fail | Wall span | Result notes |
| --- | ---: | ---: | ---: | --- |
| Yahtzee deterministic rules | 14 | 4 | 35.7 min | Most category, scratch, Joker, and below-threshold branches passed. Failures: fives ante progression, four-of-a-kind defaults response, upper-bonus assertion, tied-scorecard continuation/timer. |
| Holm deterministic rules | 0 | 15 | 31.8 min | Five rule programs completed gameplay but exceeded the peer budget; eight rows could not locate Rabbit Hunt setup; one stalled before ante progression; one stopped at login before table creation. |
| 3-5-7 deterministic rules | 5 | 7 | 22.8 min | Both-fold tax branches, one-stayer, unique winner, and tie passed. Failures: progression latency, instant-sweep lifecycle, three missing reveal controls, and one missing setup owner. |
| Deadline/rejoin | 7 | 2 | 4.0 min | All setup and ante deadlines passed. Holm gameplay deadline passed. Yahtzee exposed no running timer rail; 3-5-7 exposed timed decisions without visible timers on both clients. |
| Target lifecycle transitions | 1 | 11 | 32.5 min | Only 3-5-7 to Holm passed strictly. Remaining rows exposed action/setup absence, unchanged successor config, status mismatch, noncommitting Yahtzee action, timer violations, or peer latency. |

The deterministic rule runs were concurrent, as were the deadline and
transition groups. Their wall spans therefore must not be summed as serial
runtime. The maximum observed peer receipt in the transition campaign was
55,326 ms. The deterministic Holm and 3-5-7 maxima were 14,766 ms and 12,548
ms respectively.

## Evidence roots

- `artifacts/target-gauntlet/full/target_full_yahtzee_20260831`
- `artifacts/target-gauntlet/full/target_full_holm_20260831`
- `artifacts/target-gauntlet/full/target_full_357_20260831`
- `artifacts/target-gauntlet/deadlines`
- `artifacts/target-gauntlet/transitions`
- `artifacts/target-gauntlet/canary-r6/target_canary_r6_yahtzee`

Every failed row with a created session retains its evidence JSON, continuous
observer JSON, screenshots, error context, and trace. One Holm login failure
occurred before a table was created and therefore has only Playwright failure
artifacts.

## Failures requiring later RCA

These are symptoms, not root-cause claims:

1. Yahtzee gameplay and lifecycle: missing gameplay timer rail, a Run It Back
   source action that did not commit, cross-game successor choices that did not
   appear, tied-scorecard continuation that did not arrive, and repeated peer
   receipts over budget during long-form play.
2. Holm gameplay and lifecycle: repeated 7.6–14.8 second peer receipts, a
   missing decision surface in Run It Back, changed parameters that remained
   equal to the source config, and timer/latency violations when transitioning
   to 3-5-7 or Yahtzee.
3. 3-5-7 gameplay and lifecycle: timed legal decisions without visible timers,
   peer receipts over budget, a changed-parameter successor with no action
   surface, a 3-5-7-to-Yahtzee successor that remained `waiting`, and an instant
   sweep that reached `game_selection` before the driver's expected live phase.
4. Harness-or-product boundary checks: the production setup surface did not
   expose controls under the exact `Rabbit Hunt` and `Secret Reveal at
   Showdown` selectors used by the new matrix. The Yahtzee upper-bonus storage
   assertion and two setup/ante waits also require RCA before being classified
   as product defects.

No failure was corrected during the discovery campaign.

## Cleanup and authority proof

Cleanup was independently checked after the browser runs: 76 exact campaign
and canary game UUIDs were absent from `public.games`, and the exact-game
fixture request map contained zero entries. The Yahtzee, Holm, 3-5-7, and
target-fixture rollback proof suites passed after the final deployed fixture
correction. The fixture remains fake-money-only, exact-game scoped, expiring,
single-consumption, admin-and-participant guarded, and explicitly cancellable.

## Untested or incomplete scope

- Holm partial-top tie needs at least three human participants.
- 3-5-7 setup-owner decline is not automated.
- Yahtzee phase-by-phase rejoin coverage is not automated.
- Cross-game transitions involving Cribbage, Gin, Horses, or Ship Captain Crew
  were outside this target campaign.
- Real-money semantics received rollback-only database proof; no real-money
  browser game was touched.
- Repetition/soak was not used to dilute known failures. RCA and correction of
  the preserved failures is the next confidence-increasing step.
