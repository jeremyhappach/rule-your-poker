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

## Published verification

Product commit 728844859b52ee35dc51b724b22033e5ba747d07 is Vercel READY
(dpl_2EFKFVUQtxieUVGyJ6kCX7gbcDqq), and the public manifest matches. Both
qualification browsers confirmed that exact build.

The first run (971e0b05-ef43-4529-af77-05d5671fed52) is retained as failed.
Both clients passed the first four rounds. Neither client's terminal reveal
returned after expiry, and both leg balance changes occurred after completion.
The final sequence could not be fully qualified: the host missed one sweep
flight's finished sample, and peer award/pot completion evidence reported
observation gaps. Thirteen action receipts had zero progress violations.
Guarded cleanup passed. These missing observations are not treated as proof
of either correct or incorrect animation completion. A fresh run uses the
same published source, fault injection and unchanged strict assertions.

The second run (1b4085dd-1289-4592-b9bd-01f40b14ea0b) also remains failed:
the strict observer reported a 110 ms gap at the terminal winning-leg award
without CSS completion evidence. Both clients again passed the first four
rounds, and all thirteen action receipts had zero progress violations. Run
Back and the final continuous diagnostic-error/toast assertions were not
reached in either run; neither is a full-ending or toast-fault qualification.

The scoped reveal correction is supported by both published traces: neither
client had an expired reveal return. Terminal leg balance release followed
the final reveal deadline by 83.5/112.5 ms in run one and 68.5/54 ms in run two
(host/peer). The pre-cleanup screenshots show normal dealer setup and the
peer waiting for that selection. Completion evidence remains a separate,
queued investigation; no assertions were loosened or unrelated product
changes made to force a pass.

Both sessions passed guarded cleanup. Independent read-only SQL confirms zero
remaining games, players, rounds, dealer games and session snapshots for both
IDs. Final local browser contexts are closed. No historical real-money session
was changed. Full-ending qualification remains incomplete; the scoped clock
fix and its six local renderer regressions pass.
