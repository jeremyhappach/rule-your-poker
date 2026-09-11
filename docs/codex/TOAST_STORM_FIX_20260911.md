# Optional diagnostic toast-storm correction — September 11, 2026

Jeremy approved the bounded correction identified in FAILURE_TOAST_RCA_20260910.md.
The prior play hold is resolved. Historical incident evidence is unchanged.

## Correction

All five seam-diagnostic callers in Game, MobileGameTable and
ThreeFiveSevenDealOrchestrator now use optionalSeamDiagnostics.ts. The shared
page-local loader checks the existing capture gate before loading, shares one
attempt for both modules, catches load and callback failures, and permanently
stops optional load retries after failure. It checks game/dealer-game scope
again before invoking a callback after an asynchronous load.

The global error handler, action errors, rules, financial state, animation
lengths, per-client completion and release admission are unchanged. Existing
successful diagnostic event identities and fingerprint keys are retained.
There is no migration, gameplay wait, diagnostic write on failure, or forced
refresh of an active table. This bounds the known optional-diagnostic failure;
it does not provide general retention of all old lazy assets across releases.

## Local evidence

Twelve new tests exercise disabled capture, both module failure cases,
concurrent loading, repeated callers after rejection, callback failures,
identity retirement and all five production call sites. App typecheck,
1,592 app tests and 150 harness tests pass.

The real-browser local-source regression returns HTTP 200 text/html for the
seam module. Disabled capture makes zero attempts; enabled capture makes one
failed attempt across more than 3,000 callers, with zero callback executions
and zero unhandled page errors. No backend data is submitted by that fixture.

React review found no changed hook ordering, dependencies, rendering geometry,
state ownership or gameplay scheduling. The product diff is limited to the
optional loader, its gate and the five existing diagnostic call sites.

The production build passes. Product commit e9c9a831cd5787d69531ca431119c853142c5444
is Vercel READY (dpl_4ZYBDzbs8RZL522X9GThSvCEiXBo), and the live manifest
matched that commit. Published qualification returns HTML only for the host's
optional module; the peer receives the healthy module. Both play the existing
five-leg, two-hand winner/payout/Run Back/successor scenario with normal timing
and strict presentation checks. Synthetic sessions are guarded fake-money
sessions and must be cleaned up.

## Qualification observer correction

The first published run is retained as failed. Its fake session
e5362ab5-b5ed-4065-b0b8-2e88162a8bd3 passed both clients through the first two
rounds, then the observer misclassified the next hand ante as a payout with
stale round identity. Both clients had reached hand 2; guarded cleanup was
verified. This is a classification failure, not proof of a failed game action.

ChipPresentationLedger already marks recipient awards canonicalWinTransfer
and ordinary player-to-pot antes default. The observer now requires the
existing canonicalWinTransfer marker for seat-origin payouts, matching its
pot-origin winner selector. Strict identity, timing, reveal, payout completion
and balance assertions remain. All 61 observer unit checks and 29 browser
controls pass, including early/cancelled/shortened payout rejection and a
new test separating the next hand ante from an actual winner payout.
No additional product code changed.

The second published run (29c4a5e6-be55-48d8-81e0-f729a8f54bfe) passed all
five rounds, winner, payout, exact-config Run Back and successor decisions,
then failed the final diagnostic assertion: the peer requested the module
once despite the test switching capture off. The host's single failed-load
assertion passed; later error/toast assertions were not reached. Cleanup was
verified, and this run remains failed rather than retrospectively qualified.

Source identifies the test's invalid assumption: holmFullForensics.ffRecord
automatically calls ensureFullHolmForensicsArmed after a manual/storage-event
disable, and shared timer/deal owners call ffRecord in other games. The
published test now explicitly enables both browsers, requiring one failed
host load, one healthy peer load, no unhandled errors and no generic failure
toasts. It saves these counters before asserting them. The isolated actual-
loader browser regression remains the capture-off proof. Automatic admin
tracing re-enablement is a separate queued observation; its behavior was not
changed to make this test pass.

## Published outcome and limits

The final run (40c5a462-e9a6-4537-90e4-51491d772b87) passed the first four
rounds on both clients, including hand 1 to hand 2. The fifth terminal round
failed the unchanged strict assertion for an early winner balance before
reveal completion. Round: 6225c654-1de6-4d50-aed1-fe8c53a9e471; dealer game:
ba0ed990-acdf-4574-be10-4ccc397eea6a. The action receipt records a settled
18-chip winner payout, but that does not qualify its presentation timing.
The continuous observer reports zero action-progress violations or coverage
problems. This timing observation is queued for separate RCA; no assertion
was loosened and no timing/product patch was added to this release.

Post-run inspection of the second run's saved browser traces finds no
page-error events and no generic failure message in 206 host / 174 peer DOM
snapshots. The pre-cleanup screenshots show both clients in successor play
without failure toasts. This supports the focused regression; it does not
replace the final continuous toast-counter assertions, which were not reached.
Full production presentation qualification therefore remains incomplete.

All three fake sessions passed guarded cleanup. Independent read-only SQL
confirms zero remaining games, players, rounds, dealer games or session
snapshots for those session IDs. No historical real-money session was mutated.
Evidence and failed traces remain under artifacts/toast-storm-20260911/.

The scoped toast correction is published and its focused loader/browser
regressions pass. Existing open tabs need a normal refresh from the lobby
to acquire it. This is not a claim of general old-asset continuity or full
cross-game qualification. The follow-up commit changes only the harness and
verification records; product source remains identical to e9c9a831c.
