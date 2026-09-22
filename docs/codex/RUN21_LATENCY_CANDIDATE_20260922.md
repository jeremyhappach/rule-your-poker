# Run21 latency candidate — isolated September 22

Base: `d99d3190675218c3f7f52c28abd7d904706e249a`, fetched once from origin/main.
Branch/worktree: `codex/run21-latency`, `../run21-latency`.
No main integration, Farkle edits, production data access, production migration,
gate change, or deployment. This is a locally measured candidate, not production qualification.

## Findings and correction

The historical 2,775 ms outlier belongs to the single `run21_server_authorize`
RPC. Its recorded span combines transport, pool/database waiting and execution;
there is no historical server-side subdivision that proves which caused it.
It was **not** multiple sequential bearer-token verifications: Auth and the gate
already ran concurrently, once each. Do not label the old outlier a proven SQL
scan or claim it is conclusively fixed in production.

The candidate retains fresh `auth.getUser(token)` on every request. It does not
cache admission, trust unsigned JWT contents, or use editable metadata. The
decoded UUID remains only a speculative read key; a verified, identical Auth
UUID and current allowlist/admin admission must both succeed before using it.
`run21_server_admit` combines the fresh gate, membership and current snapshot
in one indexed lookup, replacing the separate gate plus subsequent cold load.
The snapshot can seed the existing revision-CAS path; it never bypasses a write.
The installed Supabase JS is 2.84.0. Although current documentation provides
[getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), this
change keeps getUser's fresh user validation instead of changing its security
semantics for a gate-RPC outlier. Timings separately record token verification,
gate/membership RPC, database gate and membership execution, player membership,
command authorization/rules CPU, total admission, commit and total handler.

Every old commit serialized the entire growing accepted-event array into the
request, rewrote it in the snapshot JSON, and returned it again. Engine cloning
also copied this array. The candidate moves immutable events into the private
`run21_events` table keyed by dealer game and sequence. A trigger appends only
new sequential events in the **same transaction and under the existing match
row lock**. It rejects gaps, changed historical events and cursor disagreement.
The current snapshot retains rules-required rounds, receipts, deadlines and
secrets, with an explicit journal cursor and an empty stored event array.
The new handler submits/receives only newly accepted events. No authoritative
write is deferred; CAS, settlement, request receipts and private projections
remain intact. This removes journal-size scaling, not every possible dependence
on the number of match rounds or request receipts.

History and replay explicitly reconstruct the full journal. Reconnect reads
use the sequence index for their requested suffix; recovery that also accepts
a timeout retains both that suffix and the new transition. Legacy full-history
load/commit callers still work during migration-before-deploy rollout.

## Local measurements

48 accepted Place/Pass actions, 12 each in rounds 1–4, with genuine rule-driven
zero-score ties reaching overtime. Existing local Supabase Auth/PostgREST and
PostgreSQL ran against a separate `run21_latency` database cloned from the local
Run21 stack. No production connection was made. The browser used the unchanged
`useRun21Local` hook; only initial SSE admission was supplied by the fixture.
All measured action requests traversed the real handler and database RPC.
An injected test clock and synthetic fixture deck made phase coverage repeatable.
These are loopback measurements, not a claim about production network latency.

Each cell is **p50 / p95 / maximum**, milliseconds (rounded).

| Phase (12 actions each) | Authorization | Commit RPC | Handler | Response→frame | Tap→card |
|---|---|---|---|---|---|
| Early, round 1 | 127 / 308 / 308 | 43 / 91 / 91 | 179 / 395 / 395 | 4.5 / 15.2 / 15.2 | 207 / 420 / 420 |
| Middle, round 2 | 83 / 101 / 101 | 34 / 51 / 51 | 119 / 144 / 144 | 5.4 / 13.5 / 13.5 | 140.2 / 174.7 / 174.7 |
| Late, round 3 | 72 / 107 / 107 | 36 / 56 / 56 | 110 / 167 / 167 | 2.9 / 10.5 / 10.5 | 128.8 / 192 / 192 |
| Overtime, round 4 | 93 / 176 / 176 | 43 / 62 / 62 | 136 / 241 / 241 | 10.5 / 15.6 / 15.6 | 162.7 / 274.8 / 274.8 |

Combined authorization: **92 / 176 / 308**. Commit: **38 / 62 / 91**.
Tap-to-card: **159 / 274.8 / 420**. Response-to-frame: **5.9 / 14.9 / 15.6**.
Gate SQL execution: **0.564 / 0.944 / 2.510**; membership SQL:
**0.766 / 1.970 / 3.832**. No measured authorization exceeded 750 ms;
no request exceeded 1.5 seconds. Combined acceptance thresholds pass locally;
the early-phase authorization p95 alone is 308 ms and is reported without removal.
Commit timing is not monotonically increasing across the four phases. All
responses painted on the first following animation frame. Raw secret-free
spans are in `.codex/scripts/run21-latency/measured-timing.json`.

## Verification

- 38 existing rules/privacy/replay tests passed.
- 8 authority tests passed: sequential turns, duplicate Pass, outsider/actor
  rejection, deadline recovery, both starting orders through settlement/replay,
  passive reads and reconnect prefix preservation during recovered timeout.
- 5 authentication tests passed: exact verified identity, denied gate, denied
  membership, failed Auth and no authorization reuse between requests.
- 1 hot/full journal test passed: identical accepted states, request receipts,
  opponent projections and reconstructed replay after snapshot-only restart.
- Rollback-only database proof passed before local apply, then the same proof
  passed after local apply: four rounds, 267 unchanged events, one settlement,
  CAS conflict, full-history parity, empty hot journal, service-only RPC grants,
  private table isolation, gate denial, legacy response parity, rejected rewrite.
- Application typecheck and production Vite build passed. Only Run21 tests ran.
- Main/Farkle/shared files and historical migrations are outside the diff.

The first in-memory authority run timed out while retaining the old full-history
storage fixture. Its fixture now models the journal/snapshot separation, without
relaxing assertions. This exposed and fixed a real catchup issue: a read that
also recovers a timeout must retain the requested prior event suffix. The
browser driver's original startup barrier could click a saved prior-round
snapshot; it now waits for the exact test round. The final 48 samples use that
barrier; failed diagnostic runs were not counted as passes.

Reproduction scripts are under `.codex/scripts/run21-latency/`: `setup.mjs`
creates an isolated local clone/API pair, `proof.mjs` runs rollback/apply proofs,
and `latency.mjs` drives the browser hook. They require the repository's existing
local Run21 stack and installed dependencies; no tools are installed. They
never use a production project ref or remote credentials. The clone deliberately
omits unrelated cron/realtime infrastructure; the fixture calls the existing
private dealer-preparation routine normally owned by its scheduler. Fixture
games are removed through the canonical cleanup RPC; final clone removal also
removes fixtures from failed setup attempts.

## Migration and later reconciliation

Prepared only: `20260922191358_run21_bounded_live_journal.sql`, created with
`supabase migration new`. It adds one private journal table/trigger and cursor,
two service-only current/admission RPCs, and forward replacements of Run21's
load/commit functions. No historical SQL file, shared owner, UI, rule, gate,
Farkle or lifecycle owner changed. It is **not applied to production**.

After Farkle work is complete, in a fresh reconciliation worktree:

1. Fetch the final main once; preserve all final Farkle commits and uncommitted work.
2. Cherry-pick this candidate; resolve only Run21 hunks. Stop on shared conflicts.
3. Check final main's migration head. If this unpublished version collides or
   precedes newly released Farkle versions, generate a new migration filename
   with the installed CLI and port this exact SQL; update the proof's path.
   Do not renumber or edit any applied migration.
4. Re-run these focused proofs/typecheck/build against that integrated candidate.
5. Under a separate release authorization, dry-run only the expected pending
   migration; apply it before deploying the new handler (legacy compatibility
   was tested). Keep the Hap-only gate unchanged.
6. Measure the same early/middle/late/overtime phases in production, using the
   new token/gate/membership split. Investigate any remaining external outlier
   rather than substituting these loopback timings for production acceptance.
