# Holm ending and Run Back qualification — September 10, 2026

Approved healthy qualification follows the verified Gin correction. Scope:
one deterministic solo win against Chucky, full local presentation on both
browsers, unchanged Run Back configuration, and both successor decisions.
Horses/SCC remain skipped. Fault, reconnect and End Session rows are separate.

The existing deployed `arm_target_rule_branch_harness` profile
`holm:solo:win` is admin/participant-only, exact-session, fake-money-only,
restricted to pre-hand status and expires after 600 seconds. The deployed
get/cancel definitions were inspected. Cancellation removes its exact request.
The test creates its own session and uses ordinary Stay/Fold browser actions;
there is no SQL fixture rewrite, migration or historical-session mutation.

The harness reuses the shared continuous observer and winner/payout checker.
Holm selects the exact pot transfer instead of a seat transfer. Its observed
community and Chucky card identities must match the authoritative round;
all four community faces must finish flipping and all four normal 600 ms
Chucky flips must complete before the winner announcement. The 20 ms card
sampling tolerance is separate from native CSS duration, which must remain
600 ms. The payout requires full native completion, exact transfer identity,
conserved balances and setup after completion. Both clients then retain the
complete saved configuration, enter a fresh dealer game/hand, and complete
their first Fold decisions within the unchanged six-second peer budget.

Product changes are passive DOM attributes only in MobileGameTable and
HolmCanonicalCommunityRow. Chucky uses its existing card-id and flip markers.
These expose existing
identity/render state without adding state, effects, requests or timers.
Rules, settlement, ledger ownership, reveal pacing, independent client
completion and all game flows are preserved. React review found no new
subscription, effect, rendering branch or network waterfall.

The native Chucky renderer browser control replaces only leaf card artwork;
the actual flip state machine, DOM structure and CSS transition run in Chromium.
Positive/negative controls distinguish a full flip from shortened CSS,
missing community completion, stale/duplicate identities, and early winner.
Pot-flight controls also reject cancellation and shortened animation.

App typecheck, all 1,564 app tests, 149 harness tests and production build
pass. The 28 browser controls pass across the full run and focused Chucky
rerun (the initial Chucky control had a corrected esbuild resolve-directory
error). The final Chucky control uses the renderer's existing parent card ID.
The supplementary E2E typecheck has only the same ten inherited
`abortSignal` typing errors in the existing session/probe helpers.

Evidence: `artifacts/holm-presentation-20260910/`. The single published
browser run remains pending at this publication checkpoint.
