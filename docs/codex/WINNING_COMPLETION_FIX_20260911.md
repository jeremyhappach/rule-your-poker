# September 11 leg-award native completion correction

Jeremy approved the correction described in WINNING_COMPLETION_RCA_20260911.md.

## Scope and preserved behavior

LegEarnedAnimation now hides its flight and emits the local completion callback
only on that flight's trusted native animationend. Child effects, synthetic
events, cancellation and obsolete generations cannot complete the award.
The flight type is locked at cycle start. Each new generation receives a new
DOM node even if show stays true or two cycles have the same timestamp.
Existing generation consumption and ordinary show=false reset behavior remain.

The only rendered consumer remains the 3-5-7 award in MobileGameTable. Its
existing ordinary-round receipt and terminal descriptor checks are unchanged.
The 1,500/1,800 ms animations, canonical target geometry, settlement, balances,
per-client progression and all other presentation owners are preserved. No
migration, request, timer padding or all-player completion barrier is added.
The strict transition observer and its assertions are unchanged.

## Local evidence

Nine actual-renderer Chrome controls pass under React StrictMode: ordinary and
winning flights with normal/delayed CSS startup; child and synthetic events;
native cancellation across the former timer deadline; descriptor cancellation
and successor admission; direct generation replacement with an identical
timestamp; locked flight type; and ordinary cancellation/restart. Successful
callbacks require native animationend, finished browser animation state and
currentTime >= the full declared duration. All controls make zero backend
requests. The original RCA's before-fix truncation evidence is preserved.

Typecheck, all 1,592 app tests, 150 harness tests and the production build pass.
Published winner/payout/Run Back verification and independent fake-session
cleanup pass, as recorded below.

Evidence: artifacts/winning-completion-fix-20260911/.

## Published verification

Product commit 70133cc140be1682ede000f4b2411514a4c99fe4 is Vercel READY
(dpl_9mb6VJxKL8Qn1QKEZUfd2eZiAUVG). The public manifest and both qualification
browsers report that exact commit. Local tag:
checkpoint/leg-award-native-completion-20260911.

The unchanged strict two-browser host-win scenario passes in 1.9 minutes.
Fake session 80c3272d-9385-4f19-b387-65122526b30b completed five legal rounds.
Both clients prove reveal completion, the final leg, both losing-leg flights,
the pot transfer, appropriately released balances, and setup after presentation.
The terminal result records an $18 payout ($10 leg sweep plus $8 pot), with
closing balances +$8/-$8. Both Run Back configurations match exactly, including
three $2 legs, $3 ante, $15 pot maximum, $1 pussy tax and $1 rollover. Both
clients then complete legal decisions in the new dealer game.

The continuous observer records 17 action receipts, zero violations, zero
progress failures and no coverage problems. RPC median/p95 is 109/194 ms;
peer progress median/max is 752/1,226 ms. These bounded measurements do not
certify all network conditions or smaller database capacity.

The host-only optional module fault (HTTP 200 text/html) makes one request;
the healthy enabled peer makes one successful request. Both clients record
zero error toasts and no optional-loader errors through successor play.

Guarded cleanup passed. Independent read-only SQL confirms zero remaining
games, players, rounds, dealer games and session snapshots for the exact fake
session. Both pre-cleanup screenshots show fresh successor cards and locked
decisions; all browser contexts are closed. No historical session was changed.

This run qualifies the healthy host-win path. The earlier failed captures
remain preserved; their missing sweep/pot evidence is not retroactively called
a pass or attributed conclusively to the leg timer. No sweep/pot owner or
observer change was needed for this fresh pass. Adverse delivery, reconnect,
other winner paths and Jeremy's normal smoke remain separate coverage.
