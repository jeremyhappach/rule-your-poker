# SCC/Horses postrelease smoke follow-up — local qualification PASS

Owner approved production publication after WWF polish on 2026-10-28. The
coordinator confirmed WWF READY/publisher/manifest/signal agreement at
`77c7c715190e658a5393cdbbbfb79d0589d04778` and released the writer hold. The incident
writer acquired the shared lock and reconciled without conflicts in isolation.

Candidate branch: `codex/oct28-dice-smoke`, original candidate `b8610d065` based on
`39f585520`, reconciled with WWF main in merge `3ba9804cb`.
No migration, paused-session change, real wager or financial correction is part
of this release. No transition-audit implementation or Words UI is included.

## Corrected ownership

- The hidden dice `PotToPlayerAnimation` still ran a legacy timer and released
  terminal navigation independently of the canonical award flight. Its hidden
  mode dates to `a89e8f7bb7`; release `99249d8bd` added result prerequisites without
  replacing this older completion owner. The candidate removes that dice mount
  and releases only through exact canonical transfer cursor receipts.
- A peer's next-dealer update could retire this client's queued/running award.
  The ledger now retains the current SCC/Horses pot award while its presentation
  admission owner remains mounted. Other games retain the existing default;
  mismatched and historical batches still reconcile normally.
- Own NQ badges became eligible at landing while their exact overlay remained
  pending. Both own-result rendering paths now wait for overlay completion.
- Completed-roll capture introduced in `99249d8bd` classified server timestamps
  older than 2.3 seconds as history. Live advancing keys now animate independently
  of timestamp age, including an unrolled participant's first key. Initial
  per-player history stays consumed. SCC/Horses reveal final faces at landing;
  the shared renderer's default behavior is preserved for other games.

The current paused Horses snapshot contains the final roll and result. No client
arrival trace exists for that incident. The latency/clock-age mechanism is locally
reproduced; its historical causal attribution remains unproven.

## Receipt and compatibility contract

Terminal trigger, session, dealer game and source round must agree. Every exact
pot-to-player batch cursor must be settled or reconciled, with authoritative
terminal results observed and no pending result/NQ presentation. Zero-amount
awards need no flight but still wait for result readiness. Stale async lookups,
duplicate callbacks and old trigger receipts cannot release a newer identity.

Pre-metadata awards in the exact session/dealer may finish only through historical
ledger reconciliation; they cannot borrow a settled live receipt. No SQL changes
are required. The previously installed source-round metadata remains in use.

`retainCurrentPotAwardOnDealerAdvance` defaults false. The provider enables it
only for SCC/Horses with a registered admission owner. Retention requires round
metadata, pot-to-player topology and admission other than `reconcile`; `false`
admission means the current award is waiting for its own prerequisite. Do not
globally remove old-dealer retirement. Accounting and authoritative settlement
remain independent of these visual waits.

Shared integration surfaces: `ChipPresentationLedger.ts`,
`ChipTransportProvider.tsx`, `MobileGameTable.tsx`. Coordinate these hunks with
the transition audit; no production recovery hook or `Game.tsx` route was edited.

## Validation and limits

- Aggregate run: 3,133 source tests in 451 files; 241 harness tests in 12 files.
- Subsequent landing, first-roll baseline, owner-presence and legacy-history
  refinements: 37 focused tests in six files, all passing.
- Final typecheck and production client build passed; final diff check passed.
- Two separate browser contexts passed both games with a 3.5-second delayed
  final observer snapshot, batch-before-snapshot ordering, peer next-game update,
  remount during flight, own NQ badge after overlay dismissal, and fresh dealer/
  round identity after Run It Back. Final runner process 83284 exited 0.
- Navigation was compared to the canonical flight deadline with only 1ms for
  integer `Date.now` resolution. Frame samples show no selection/flight overlap.
  The final owner NQ trace showed the badge 24ms after overlay dismissal.

The browser harness mounts actual MobileGameTable, controllers, persistent shell,
ledger/runtime and DealerGamePicker. It uses deterministic local authority,
injected roll snapshots and a fixture navigation callback. It does not prove the
complete production router, hosted Realtime behavior, physical-device behavior or
formal transition-matrix coverage. Existing real-money settlement is unchanged.

Preserved workspace evidence: `../incident-smoke-evidence.md`,
`../incident-smoke-transition-contract.md`, `../incident-smoke-visuals/`, and
`../incident-smoke-*-build.log` / focused/typecheck logs. The reproducible browser
entry point is `e2e/incidents/verify-smoke.mjs` with the incident Vite config.

## Authorized release continuation

1. Wait for explicit coordinator confirmation that WWF's writer finished.
2. Reconcile with its resulting main, preserving all unrelated releases. Stop
   for a material merge judgment rather than resolving unrelated changes silently.
3. Rerun required aggregate/integration checks on the integrated candidate.
4. Use the repository's normal single-writer integration and main push helper.
5. Verify remote SHA, required CI/publisher, Vercel READY, public manifest and
   persisted release signal agree. Record publication evidence here.

Integrated qualification after WWF reconciliation passed: 3,149 source assertions
in 455 files; 241 harness assertions in 12 files; application typecheck; production
bundle (1m55s); both actual-shell browser contexts and games, including the 1ms
deadline assertion. Source, dependencies, authority and workflow preservation were
reviewed against WWF main. Only intended incident files differ. The generated
Cribbage snapshot line-ending artifact was restored. No migration was run.

Publication status: **APPROVED; INTEGRATED QUALIFICATION PASS.** Exact-SHA production
agreement must be recorded in the local publication receipt before claiming live.
