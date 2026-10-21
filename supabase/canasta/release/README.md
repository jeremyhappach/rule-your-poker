# Canasta closed release package — October 21, 2026

**Prepared locally; NOT approved for installation, publication or activation.**
The admission correction is fake-money-only, exactly two participants (human/human
or human/bot). Existing gameplay, scores, accepted stakes and recovery are unchanged.
This package does not establish a tester allowlist: the current capability gate,
if globally opened, permits active accounts in eligible fake-money sessions.

## Exact artifacts

- `manifest.json`: ordered inputs and normalized SHA-256 hashes, candidate parent,
  reference main, and explicitly unregistered migration status.
- `closed-install.sql`: one transaction containing authority, admission, lifecycle,
  guarded dispatcher registration, recovery and disabled schedule, in that order.
  Both execution and admission default false. No historical data rewrite.
- `worker/index.ts`: bundled Edge entrypoint; `edge-config.toml`: Canasta-only JWT
  configuration. The database-issued dispatch token remains mandatory; a forged,
  stale, reused or absent token cannot claim work. Node-target bundling alone does
  not qualify the deployed Deno runtime or `node:crypto` compatibility.
- `preflight.sql`: read-only dependency hashes, constraints/index evidence, extension
  versions and existing Canasta/scheduler detection. A changed dispatcher hash
  stops installation. Never relax that guard without reconciling the new owner.
- `closed-verify.sql`: installed flags, inactive scheduler, publication/RLS,
  authority grants and both fake-money guards. Run before enabling recovery.
- `installed-rollback-proof.sql`: real canonical financial transfers/results/
  snapshots and admission tests, always rolled back. Requires actual recent worker
  health; contains no fake heartbeat, scheduler mutation, or captured dispatcher.
- `candidate-rollback-proof.sql`: the exact closed installation and financial proof
  in one rollback transaction, for the separately authorized pre-install hosted
  gate. Does not start recovery, open admission, or require a fabricated heartbeat.
- `close-admission.sql`: incident containment that leaves execution/recovery live
  for accepted matches. It does not unwind balances or erase history.

`node supabase/canasta/release/build.mjs` reproduces the artifacts using installed
dependencies. `node supabase/canasta/release/build.mjs --check` verifies bytes without
changing files. Text is UTF-8 LF without BOM. Do not install proof files, fixtures,
or `ante.production-proof.sql`; the latter is a captured baseline for an old clone.
The SQL is deliberately outside `supabase/migrations`: after reconciliation,
register a migration with the installed CLI and record its version/path/hash.
No migration version has been fabricated or applied.

## Required reconciliation and release sequence

1. Local reconciliation is against `6b15f4eb060df319df13d576948c343920a23b21`,
   including released Race Poker/11 Up and the installed Battle31 package. Canasta
   uses the current catalog/setup and additive terminal-retention branches.
   The read-only deployed Ante Up fingerprint on October 21 is
   `7b6ca8feaa35c1fcce8b00491783e9d4`; reversing the Canasta insertion reproduces it.
   Before release, serialize with other workstreams and re-read remote main and
   deployed authority. Golf retains the next production slot. Any newer shared
   change requires reconciliation and refreshed proof, never replacing a live
   dispatcher with the captured clone definition.
2. For any subsequent source change, rerun the app/server/fixture typechecks, full build,
   focused Canasta and shared-card/lifecycle tests, and all three local database
   runners. Run the exact closed-package proof as well. Capture commit and hashes.
3. With separate release authorization, run candidate-rollback-proof.sql for fresh hosted rollback financial
   qualification on approved synthetic identities and verify actual constraints,
   permissions, shared authority and ledger effects. Do not point the local Docker
   harness at production. Register/apply only the reconciled closed SQL transaction,
   record migration history and installed function hashes, then run closed-verify.
4. Publish the exact worker with the Canasta-only config and the app/API from the
   same reviewed commit. The API needs server-only `CANASTA_SUPABASE_URL` and
   `CANASTA_SUPABASE_SERVICE_ROLE_KEY`; Edge uses platform-provided `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY`. Never include keys in client artifacts/evidence.
   Verify deployment SHA, worker version and actual configuration. The per-function
   setting follows [Supabase configuration documentation](https://supabase.com/docs/guides/functions/function-configuration).
5. Separately authorize execution/recovery enablement while keeping admission
   false. Activate only the Canasta job. Observe real pg_cron → pg_net → Edge →
   service RPC → successful heartbeat, then run installed-rollback-proof. A fabricated
   heartbeat or local HTTP stub is not acceptable installed evidence. Verify invalid
   dispatch token rejection, lease expiry, cold start and zero-client continuation.
6. Run the hosted tester matrix below. No broad admission opening is required:
   approved fake-money sessions may be configured with transaction-local admission
   true and restored false before commit, using the actual consenting dealer's
   identity and canonical configure RPC. The other human must consent normally.
   This requires exact approved account/session IDs and an audited provisioning
   transaction; none are selected or provisioned in this package. Never bypass
   consent or temporarily commit a global open gate to simulate restricted access.
7. Only after evidence passes may Jeremy approve broader fake-money admission.
   Real-money admission remains prohibited. Failure closes admission; retain
   compatible app/API/worker execution for accepted matches. Do not disable recovery,
   drop authority or revert to an incompatible client while accepted matches remain.

## Remaining tester scope and evidence

| Scope | Required evidence before activation |
| --- | --- |
| Two consenting humans, two authenticated browser contexts | Setup → stake consent → private initial deal → large pickup → multiple hands → exact +S/−S result; both perspectives and matching authoritative revisions |
| Human plus canonical bot | Bot admission/consent, own-hand-only decisions, full match, sole-human timeout pause and reclaim; no placeholder identities |
| Outsider, inactive account, real-money session | Discovery denied where applicable, forged direct configure denied, no gameplay/financial writes, private hand and revision access denied |
| Realtime and recovery | Both tabs receive final revision after Stand Up; disconnect after committed pickup; lost response/retry; no clients; cold/restarted worker; stale/duplicate lease rejection |
| Timers and canonical controls | Deadline/command race; eligible fake Auto-play; all-human inactivity pause; normal pause budget; one expiry-resume budget; reclaim cannot replay stale automatic action |
| Settlement and continuation | One immutable result, one balanced canonical batch, exact chips and final snapshots; duplicate/late replay and injected rollback; tied target continues same match/stake; Run Back fresh consent; sit-out/Stand Up; terminal hold → Session Ended; fresh reconnect → lobby |
| Native mobile and shared regressions | Small/large iPhone, portrait/landscape and safe areas; 15/30/60/71-card hands, >=44px targets, duplicates, wild reassignment and cancellation; canonical Joker transport; current Race/11 Up and existing card games retain behavior |

Required identities: two approved active human testers, a permitted canonical bot,
and approved outsider/inactive negative-test identities; exact fake-money session
IDs and synthetic proof scope remain to be supplied/authorized. No real-money
gameplay test is part of initial access. Real-money settlement regression remains
rollback-contained synthetic evidence, never live admission.

Store commit/deployment/worker/migration identities, pre/post authority hashes,
request and revision IDs, scheduler/HTTP outcomes, redacted browser evidence,
canonical chip/result/batch/snapshot queries, and native-device acceptance together.
Screenshots alone cannot prove settlement or worker delivery.

## Local evidence for this correction

The admission proof checks closed discovery, fake-money positive setup, real-money
direct/forged-config rejection without writes, internal begin rejection, a real
mode change after genuine fake setup, browser denial of private begin, and exact
setup replay after gate closure. Run Back shares the guarded configure RPC;
its browser route still needs hosted qualification.

`release/proof.mjs` executes the exact install body, verifies disabled flags/job,
and executes the installed rollback proof in the network-disabled local clone.
It substitutes local health only in its harness, never in the installed proof.
The earlier consent/control, independent concurrency and process-restart proofs
remain separate. Local passes do not establish hosted readiness.

`node supabase/canasta/reconciled-baseline.mjs` separately copies the existing local
financial snapshot into a uniquely named disposable database, installs the exact
released Race/11 Up/Battle31 owners using Battle31's baseline recipe, and checks the
Canasta package plus released-game proofs together. It compares 305 prior function
bodies, permits only the additive Ante Up change and drops its database afterward.
Its old snapshot requires the exact deployed deferred financial trigger restored
locally and uses the reference package's scheduler metadata fixture. Those harness
repairs are excluded from release SQL. The source snapshot is never modified.
The Docker proof separately exercises real pg_cron registration with job launching
disabled and network mode none. Neither proves hosted dispatch delivery.
