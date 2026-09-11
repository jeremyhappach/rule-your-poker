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
cleanup will be recorded below after publication.

Evidence: artifacts/winning-completion-fix-20260911/.
