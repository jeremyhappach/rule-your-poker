# Oct27 SCC/Horses/Tri-Towers incident release

Owner approved production after passing checks on 2026-10-28. Base and fetched
origin/main both 500b77fb0be6a9d6e963b70d1e0cf879473c9f8c. Existing Words,
Quintzee, Golf and async releases remain included. Incident branch:
codex/oct27-gameplay-incidents. No customer-state or financial correction.

## Root causes and correction

- SCC size regression: 4ab4f4cc9 added 24px 56px 96px padding inside the fitter,
  changing measured content 140x84 to 252x204 but retaining a 3.409:1 slot.
  Height-constrained fitting reduced the whole composition to about 41% of its
  prior scale. The parent lacks this SCC-only wrapper. Full paint geometry now
  owns the actual assigned rectangle and measured pot reservation.
- Horses held row painted outside the intrinsic box and under the pot; exact
  introducing commit unknown. Shared full-envelope geometry separates both.
- Refresh replay:observer permission bypassed controller historical/hydration
  classification. Permissive line lineage 177122da41 is not proof of the first
  introducing commit. Explicit historical admission now suppresses fly-in;
  undefined admission preserves existing Yahtzee observer behavior.
- NQ overlay's ancestor stacking context defeated its local z-index. It now
  portals to the canonical celebration layer with bounded image waiting.
- Transfers had no exact-round dismissal prerequisite. Visual award and successor
  ante admission now use immutable source/successor ownership. Accounting does
  not wait. Outgoing NQ survives rollover; stale/remount receipts are isolated.
- Initial ante compatibility is preserved through explicit destination metadata
  from the actual initial-round creator. Fresh initial antes animate once;
  historical unknown batches reconcile rather than borrow a completion receipt.
- Final-roll capture depended on mutable actor/playing phase and was cleared at
  terminal handoff. It now captures dealer/round/player/roll identity and waits
  for actual renderer landing.54218fe6a's blanket terminal-only opponent result
  badge gate is removed while current-roll readiness remains enforced.
- Horses lag combined RPC time, a full local timer after response and an older
  extra 1.5s badge gate. 7d8c29e7d introduced the awaited server roll path;
 6e8f99043 introduced the older badge gate. Remaining-duration timing and actual
  landing receipts now govern recognition; server legal deadlines remain intact.
- Tri startup depended on ACK/revision delivery without bounded catch-up.
  Original hook 92d04c1e6; candidate recreates failed channels, catches up at
  deadlines, rejects stale callbacks and retains safe action gates. Historical
  browser cause and cached SHA remain unknown. Tri timeout policy is unchanged.

## Qualification PASS

- 3110 source tests in 450 files; 241 harness tests in 12 files; typecheck pass.
- 119 focused incident/preservation tests pass before aggregate run.
- Actual local two-client Yahtzee winner overlay -> dealer picker -> Tri board:
  dropped Intro->Ready, missing/delayed ACK, channel error, stale callback,
  focus recovery, refresh and one authorized command. Deterministic loopback
  transport, not a substitute for hosted transport/device acceptance.
- 18 controlled geometry cases and final actual-shell 393x852 CSS px/DPR 3 tests
  cover both games 0/2/5 held with no pot intersection. Owner 709x1536 raster image
  does not establish its exact CSS viewport. Final-roll, slow 2400ms RPC,
  remount, rollover and real NQ-overlay/ledger sequencing pass.
- Native isolated PostgreSQL 17 winner/tie/replay/late replay/authorization/
  continuation/mixed-ownership proofs pass; two independent connections produce
  exactly one financial completion. Local committed synthetic concurrency
  fixtures remain only in dice_incident_20261028_0402.

## Hosted migration qualification PASS

Applied once as 20261028184338_dice_transfer_round_identity before client push.
Adds nullable source_round_id/successor_round_id to existing journal/batches;
no backfill, no financial statement reordering or amount changes. Copied
settlement/rollover/initial-admission bodies have metadata-only additions,
verified by source parity tests. A precondition hash guard checks the exact
hosted baselines. Finalizer/journal/cursor functions are unchanged.

Hosted baseline and installed rollback proofs use real authority/triggers with
synthetic fake-money fixtures only. Both games prove initial admission, winner,
tie, duplicate, unauthorized/wrong identity, continuation, balanced batches and
an injected post-financial-write failure with complete rollback. Installed
proof checks exact initial/predecessor/successor identity and immutable batch
metadata. All 12 synthetic sessions from the 3 hosted proof executions are absent
after rollback. No customer session, player balance or financial history changed.

Evidence: supabase/tests/dice-incidents/release-rollback.sql, hosted-baseline.json,
hosted-installed.json, hosted-immutable.json, hosted-installed-schema.json,
hosted-final-hashes.json, local-concurrency.json, local-mixed-ownership.json.
To prove installed metadata, set incident.expect_metadata=true inside the proof
transaction. Never run the fixture outside its enclosing ROLLBACK.

Local/hosted parity review found the local clone's manually loaded settlement
function lacked the hosted execute ACL; corrected ONLY the local clone to
hosted grants before full qualification. Advancement raw hash differed solely
by line endings; normalized body matches exactly. All 4 journal/cursor functions,
canonical settlement writer and deferred finalizer match hosted definitions.
New private functions are not browser-executable. Pre-existing advisor finding
for pending journal RLS is unchanged; anon/authenticated have no table access.

## Publication verification

Client publication follows installed migration proof via approved main push
helper. Verify remote SHA, Vercel READY/production alias, public build manifest,
GitHub release publisher and persisted app release signal agree. Owner authorized
this automated release without an additional prepublication device-smoke gate.
Real iPhone/live two-client acceptance remains unobserved, not claimed complete.
