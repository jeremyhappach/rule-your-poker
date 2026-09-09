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

## First live run — observer endpoint mismatch

Published `45d3ffc256139bf73baad0afac84266b9ea7ad9c` passed deployment and
both browser build checks. Namespace `cribbage-win-20260909-2258` stopped once
at `missing payout flight`; no successor or retry ran. Exact identities:

- Session: `540773c4-cff4-4d86-be29-317b6f2b0aa4`.
- Dealer game: `656ab270-888d-4545-bf61-0fe5d93a8008`.
- Hand 1 / round: `05330f18-b91d-430b-b846-e49fa924dc5e`.
- Winner: `ac1601b2-dff2-4327-8560-7a52f5b147f4`, pegging Go point, score 1–0.
- One $10 transfer, correct payer/payee deltas and conserved balances.
- Nine action receipts, no progress/coverage violations; RPC median 111 ms,
  maximum 181 ms, maximum peer progress 1,039 ms.

The observer incorrectly matched `data-chip-transport-from="player"` (the
database endpoint), while ChipPresentationLedger resolves that to the renderer's
`ChipEndpointRef` kind `seat`. Extracted trace frames show the actual $10 flight
on desktop and mobile. This is an observer defect, not evidence of a missing
game animation. The selector and browser control now use the renderer's seat
kind, with the fixture typed against `ChipEndpointRef`.

Independent cleanup confirmed zero rows for this exact session in games,
players, rounds, dealer_games (`session_id`), game_results, transfer batches,
session snapshots and the private decision journal. Original trace, JSON and
screenshots remain unchanged. Corrected live qualification remains pending.

The corrected observer passed all 121 harness tests and seven browser controls.
The next run pins the same published app `45d3ffc25`; only local harness code
changes, so no product redeployment is needed to exercise the correction.
Original trace SHA256:
`A5ABD36F80D350B5B6852FB33CD82BFB8095A3EF9D5C5B3E5F0610A5375EF4EB`.
