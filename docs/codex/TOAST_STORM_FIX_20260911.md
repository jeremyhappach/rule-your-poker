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

The production build passes. Publication and the two-human production
qualification are pending.
The planned production test enables diagnostics only in its host browser and
returns HTML only for that browser's optional module. The peer keeps capture
off. Both play the existing five-leg, two-hand winner/payout/Run Back/successor
scenario; normal gameplay timing and strict presentation checks stay enabled.
Synthetic sessions are guarded fake-money sessions and must be cleaned up.
