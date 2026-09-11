# September 11 expired reveal clock correction

Jeremy approved the correction in EARLY_BALANCE_RCA_20260911.md.

## Change and preserve list

ThreeFiveSevenDecisionReveal reads current local time when rendering a clock.
Its existing animation-frame state still triggers renders, but the last frame
timestamp no longer determines visibility after the loop has stopped. The
production change is limited to two expressions and an explanatory comment.

The server window, clock reconciliation, authoritative pause extensions,
identity boundaries, financial admission, settlement, transfers, reveal and
award durations, and per-client completion remain unchanged. No extra timer,
network request, delay, migration or shared completion barrier is added.
The strict presentation observer is unchanged.

## Validation

The new actual-renderer browser regression failed on the old source with one
expired reveal still visible after a -59.5 ms clock adjustment. With the fix,
all six local browser controls pass: unchanged and both shifted offsets,
authoritative pause extension, successor identity, and expired/active late
entry. The tests hold the next animation frame so it cannot hide a stale
render, and assert zero backend requests.

The existing strict observer includes genuine early-balance negative controls.
Typecheck, all 1,592 app tests, 150 harness tests and the production build
pass. A fresh
published two-client 3-5-7 winner/payout/Run Back sequence will use normal timing,
the existing host-only optional-module failure, and guarded fake-money cleanup.
The original failed campaign and diagnostic replay remain preserved.

The source review confirms unchanged hook ordering, effect dependencies,
animation scheduling, identity inputs and financial owners. Only current-time
selection changes. No other product source was edited.

Evidence: artifacts/reveal-clock-fix-20260911/.
