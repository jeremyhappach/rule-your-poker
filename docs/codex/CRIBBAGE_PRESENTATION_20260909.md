# Cribbage presentation qualification — September 9

Status: Harness implemented under the approved transition plan; local checks
and one published two-client qualification run are the release gates.

Jeremy prioritized Cribbage before Yahtzee after decision-source logging. The
bounded healthy row is `cribbage-presentation-short-win`: two fake-money human
accounts, custom target 1, legal discards/pegging to the actual winner, normal
next-game setup, then custom target 2 and legal discards from both new hands.
It never requests End Session or injects unrelated network faults.

The existing continuous observer and transition observer are reused. Required
evidence includes exact game/dealer-game/round/hand identity, visible winner
announcement, each committed player-to-player transfer's full renderer lifetime,
opening/final displayed balances, conserved authoritative payout, setup only
after transport completion, fresh successor cards and both discard projections.
Missing, stale, duplicated or cancelled flights cannot pass through eventual
settlement or setup. Original traces and independent cleanup checks are retained.

Application changes are passive attributes on the Cribbage root and existing
canonical announcement/celebration owners. Those shared owners remain mounted
through ShellHudChrome and PersistentTableShell for all seven games. No state,
timing, callback, gameplay, settlement, network or persistence behavior changes.

Custom mode disables skunks. This first row records its actual cut/pegging win
path and does not qualify counting, single/double skunk, rejoin, delivery faults,
End Session or a second winner-role run. Those remain separate coverage.

Local validation passed: application typecheck, all 1,538 application tests,
121 harness tests (15 additional checks), seven browser controls (including
completed/cancelled player payouts), and the production build. The separate
E2E typecheck still reports only the ten previously recorded `abortSignal`
typing errors in inherited probe/cleanup helpers. Test discovery selects one
row. Artifacts are under `artifacts/cribbage-presentation/`.

Published live outcome is pending. Release tag: `cribbage-presentation-20260909`.

The first Vercel deployment of `94b6bbb9e` failed before publishing. All 1,538
application assertions passed, but the existing ShellTabBar portal test left
lazy telemetry imports running after jsdom teardown (`localStorage is not
defined`, 28 unhandled rejections). Its fixture now mocks runtime telemetry
and awaits dynamic imports during teardown. The nine focused tests and repeated
full typecheck, 1,538 app tests, 121 harness tests and build pass. Production remained on the validated
decision-provenance release and no Cribbage live session was created.
Original Vercel logs are retained in `artifacts/cribbage-presentation/`.
