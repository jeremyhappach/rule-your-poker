# September 10 real-money failure-toast RCA

Status: original read-only RCA retained below. Play has ended and Jeremy
explicitly approved the correction September 11. Implementation and current
verification are recorded in TOAST_STORM_FIX_20260911.md.

## Conclusion

An open client on build `33c69e736861` requested an obsolete, lazily loaded
3-5-7 diagnostic module after production moved to `2eb3cc29dfcf`. The obsolete
asset URL returned the app's HTML fallback. Unhandled diagnostic import
rejections reached the global error handler, which displayed an error toast
for every rejection. Render-time diagnostic calls amplified the failure.

This identifies the reported notification failure. It is not a financial
reconciliation or proof that every gameplay operation in the session succeeded.
No database action failure is indicated by these particular exceptions.

## Exact identity and runtime evidence

- Session: `41a5f045-b797-4032-82ea-f0c152e36d2c`, real money, created
  `2026-09-11 00:55:04.11714 UTC`.
- Incident dealer game: `187f6896-24e9-4ef4-8a47-38b4c335b46b`, 3-5-7.
  The first other-client error follows round
  `d1e916dd-7852-47d8-86ce-15a0d494eb65`, hand 2 / round 1.
- Both clients identify build `33c69e736861a022f812b339d3d2353570332042`,
  built `00:49:33.285 UTC`, entry asset `index-llGy4W6P.js`.
- Production deployment `dpl_HshxgH7pcuyFoC7uPh3ygiqTezRv` corresponds to
  `2eb3cc29dfcf425c6f23ea007bb5686f6f139896`, built `00:59:04.033 UTC`.
  That final publication changed only harness and documentation source, but
  rebuilding changed the emitted asset names. Session creation preceded it.
- Jeremy's browser correlation `3d3580a1-3d7a-41a2-b19f-6c8e090920c0`
  recorded **588** `357.runtime.error_toast_invoked` events, from
  `01:23:38.964` through `01:24:57.856 UTC`, all with
  `'text/html' is not a valid JavaScript MIME type.`
- Other browser correlation `c1de23bb-c69f-415d-9ee1-88cd8bcb9d93`
  recorded **648** such events, from `01:23:39.282` through
  `01:25:11.616 UTC`, all with `Failed to fetch dynamically imported module:
  https://holm357.com/assets/h1r3ToH2r1-LjauNsX2.js`.
- Counts are persisted toast-handler invocations, not a count of simultaneously
  visible toasts or distinct failed network transfers. A second global-error
  listener recorded another 1,236 diagnostic rows for those same rejections.
- Read-only static asset checks at `02:22:22 UTC` confirmed the obsolete path
  returns HTTP 200 / `text/html` / app index HTML. The current bundle references
  `h1r3ToH2r1-DyvaeKdM.js`, which returns HTTP 200 / JavaScript and imports the
  current entry bundle. The old deployment hostname led to Vercel login HTML;
  that response is excluded from the asset proof.
- At the initial passive capture, `01:26:59 UTC`, the session had already
  advanced to Yahtzee, dealer game `22e38a0e-ed2a-4fad-abce-0a1da6d121e5`,
  round `b2f714f0-a50c-410d-a062-50fae963cb41`. That was capture context,
  not the origin of the toast burst.

## Owner and failure boundary

1. `vercel.json:4` rewrites unmatched paths to `/index.html`. After publication,
   the obsolete chunk path resolves to HTML instead of its expected module.
2. Five client call sites dynamically import the diagnostic seam module and
   `sourceSites`: `Game.tsx:4264`, `MobileGameTable.tsx:6512` and `11804`,
   `ThreeFiveSevenDealOrchestrator.tsx:527` and `1184`.
   Each starts `void (async () => { await import(...) ... })()` inside an
   outer synchronous `try/catch`, without handling the returned rejection.
3. MobileGameTable's hand and opponent-back derivations repeat during eligible
   hand >= 2 / round 1 renders. Their fingerprint deduplication lives inside
   the unloaded module and is called only **after** the import succeeds.
   Failure therefore bypasses deduplication. The actual historical stack
   identifies the module, not which individual one of the five sites rejected;
   source establishes the render paths that can amplify it.
4. `emitWartime` eventually checks `isWartimeCaptureEnabled`, but that gate is
   downstream of the import. An optional diagnostic can fail even before the
   existing off switch is reached. Capture state during this incident was not
   changed or independently established by this RCA.
5. `App.tsx:136-179` handles every `unhandledrejection`, persists diagnostics,
   and calls `toast.error("An error occurred. Please try again.")` each time.
   This handler has no toast deduplication. `runtimeDiag.ts:230-247` advances its
   last-event pointer before persistence; the error-toast call supplies an empty
   identity, so its rows have null game/round IDs. Session-only queries missed
   them; browser correlation IDs and the route recover the direct evidence.
6. `ReleaseVersionGate.tsx:93-137` intentionally admits a game route once and
   retains its mounted table after later publications. This protects active
   gameplay from forced reload, but does not retain old lazy assets. Preserve
   that no-ejection behavior; forced refresh during play is not the correction.

The two MobileGameTable diagnostic blocks date to July 25 commits
`3b2326a56b` and `07db87a428`. The final September 10 harness publication
exposed this existing failure path. Its source diff against `33c69e736`
contains no product behavior change; that does not make its rebuilt assets
compatible with an older open browser.

## Recommended bounded correction

Put all five optional diagnostic call sites behind one failure-contained
loader: check the existing capture gate **before** loading, share one import
attempt, catch import and diagnostic callback failures, and disable the optional
loader for that page after a load failure. Existing successful event identity,
fingerprint dedupe and hand/dealer-game reset behavior remain intact. A failed
optional diagnostic must never reach the gameplay error toast or retry from
every render. Do not conceal genuine gameplay errors with a blanket global
unhandled-rejection suppression.

Preserve rules, decisions and physical-click provenance, authoritative state,
settlement, balances, animation durations, per-client completion, table identity
and release admission continuity. No migration, production-data correction,
extra gameplay request or animation waiting barrier is needed for this fix.

Deployment-safe handling of *other* lazy modules is a separate release-hardening
follow-up. Do not claim this diagnostic fix makes arbitrary mid-session
publications safe. Changing the HTML rewrite alone also would not fix this
storm: an unhandled 404 would still reject the import.

## Validation after approval and the live-play hold

- Local focused tests: capture off performs no load; concurrent calls share
  one attempt; either module rejecting or a diagnostic callback throwing is
  contained; repeated renders after failure do not retry or emit error toasts;
  successful enabled diagnostics retain their existing dedupe and identities.
- Browser regression using a controlled missing/HTML diagnostic response and
  repeated H2/R1 render/deal transitions; require no unhandled rejection or
  diagnostic-generated toast, while both clients continue normal play.
- Healthy 3-5-7 multi-hand/win/successor checks with normal timings, including
  capture off and enabled as appropriate. Stage the asset-mismatch case away
  from real-money play. No live refresh or deliberate production interruption.
- Prior winner/payout/Run Back qualification used freshly loaded clients on
  a fixed build. It did not qualify an older open client across publication.

## Evidence and investigation limits

Saved under `artifacts/live-toast-incident-20260910/`:
`passive-capture.json`, `exception-summary.json`, `first-error-samples.json`,
`related-lifecycle.json`, `deployment-timeline.json`,
`current-static-asset-proof.json`, and `asset-verification.json` (the old
deployment login response is not used as proof of asset availability).

Database reads used short statement timeouts in read-only transactions.
Only existing diagnostics, deployment metadata, source/history and public static
files were inspected. No live browser was touched, no test session started,
no instrumentation changed, no product code edited, and nothing was deployed
or pushed. Documentation and evidence are local only while play remains active.
