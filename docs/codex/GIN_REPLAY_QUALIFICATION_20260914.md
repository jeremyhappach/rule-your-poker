# Gin replay qualification — September 14, 2026

Status: Gin hand capture and offline export qualified in a disposable database;
absolute p95 budgets pass after removing redundant closing-context writes.
Unreleased checkpoint on codex/replay-contract. No other game or visual replayer
was implemented. No production migration or enrollment occurred.

## Scope and completeness

New openings freeze the Gin rules/configuration, full game/round checkpoint,
roster/participation, scores, balances, private card identities and historical
visibility. Version gin-replay/1 permits complete hand seals. Existing contexts
without this capture contract remain partial. Parent coverage is hand_boundary:
this is not a complete session-genesis recording or a claim about pre-opening
dealer selection. No legacy history is backfilled or promoted.

Seventeen shared authoritative owners capture participation, pause/resume,
host changes, seat/join/departure, financial transfers, end requests, shared
terminal handling and dealer selection. Compound Gin operations record ordered
card movement, reveal/grouping, scoring, financial and closing deltas; dealer
draws record ordered draw rounds. One append records each meaningful transaction.
Duplicate/no-op actions append nothing. Existing authority locks are preserved.

Forty actual exports cover void, scoring, settlement/session termination,
knock/layoff, undercut, Gin/system scoring, bot action, postgame, end requests,
pause/resume, intent, automatic play, host transfer, join/departure, exact shared
transfers and subsequent dealer selection. SQL proofs delete synthetic live
games/rounds/players and prove export unchanged; the independent TypeScript
applier then reconstructs and reconciles every package with no database access.
All forty pass complete-hand-seal and historical privacy checks after optimization.
Thirteen focused unit tests and the application TypeScript check pass.

Two concurrent real connections submitted the same action: one applied and one
returned stale_action. The journal contained exactly opening plus one action;
no deadlock or duplicate append occurred. This is a bounded contention proof,
not a high-concurrency load test. Shared context lookup uses reverse journal PK
plus round PK, independent of the number of earlier hands. Active-action capture
does not scan/reconstruct the journal. Closing roster aggregation is limited to
session participants. Only two journal indexes exist; no replay Realtime rows.

## Committed latency

Milliseconds; disabled/enabled order alternates within each category/sample.
80 measured samples per mode/category in the final optimized run, 800 actions.
The timer covers the actual authoritative RPC and COMMIT, including deferred
ledger work, with synchronous_commit and fsync on. Transport and rendering are
excluded. Baseline means replay-disabled instrumented owners, as requested.

| Action | p50 disabled / enabled | Added p50 (%) | p95 disabled / enabled | Added p95 (%) | Max disabled / enabled |
| --- | ---: | ---: | ---: | ---: | ---: |
| ordinary | 5.37 / 6.53 | 1.16 (21.6%) | 8.14 / 9.78 | 1.64 (20.1%) | 11.07 / 10.09 |
| compound | 6.03 / 8.34 | 2.31 (38.3%) | 8.54 / 12.50 | 3.96 (46.4%) | 9.53 / 13.58 |
| reveal_void | 5.97 / 10.13 | 4.16 (69.7%) | 8.87 / 14.08 | 5.21 (58.8%) | 11.59 / 16.55 |
| scoring | 123.06 / 126.50 | 3.44 (2.8%) | 204.98 / 218.97 | 14.00 (6.8%) | 242.97 / 304.50 |
| settlement_terminal | 132.41 / 136.45 | 4.05 (3.1%) | 193.85 / 221.12 | 27.28 (14.1%) | 235.34 / 358.83 |

All added p95 values meet 10 ms (ordinary/compound/reveal) or 50 ms
(scoring/settlement/terminal). Percentages are diagnostic only.

The first complete-capture run failed reveal/void at +14.28 ms and had one
740.22 ms scoring outlier. No extra private-state triggers existed. Removing the
redundant closing-context UPDATE preserved the atomic closing checkpoint and
all offline proofs; the fresh interleaved run reduced reveal/void overhead to
+5.21 ms. The 740 ms outlier did not recur; final maxima are shown above. The
outlier's exact origin was not established; the earlier baseline also spiked
at that sample. No unrelated scoring optimization was performed.

The initial long benchmark CALL reached its statement timeout after 804
measurements; prior COMMITs remained intact. Its unfinished sample was excluded
and the remaining paired samples completed with an explicit 180-second
benchmark-session timeout. The final optimized 800-measurement run completed
without interruption. Samples from the two implementations are not pooled.

## Reusable pattern and limitations

Keep authoritative OLD/NEW values in the owner, capture intermediate outcomes
there, append compact lossless deltas once, and make closing snapshots the
durable terminal checkpoint. Retain raw secret facts privately with recorded
grants; project viewer-safe identities/faces only during historical export.
Avoid updating another cached copy of the closing snapshot. Reuse existing
locks/idempotency and indexed identity lookups; never defer required facts.

The public standalone settlement wrapper and service-only legacy owner are
instrumented. Successful independent recovery from an otherwise unreachable
half-settled new hand was not fabricated; normal atomic settlement and duplicate
settlement were exercised. The existing forced dealer-tie harness fails SQLSTATE
42804 (double precision versus bytea shuffle keys); the normal dealer draw
passes and the unrelated harness defect is queued separately. No long-session
stress or broad concurrent load campaign was performed. General untrusted
package runtime-schema hardening remains a future exporter integration check.

Production rollout, automatic enrollment/session-genesis coverage and the
remaining games remain deferred. Continue to preserve human-readable canonical
history as its own model.

## Durable artifacts and cleanup

Draft schema/writers/exporter/proofs: supabase/tests/replay.
Headless contract: src/lib/replay/contractV1.ts.
Local evidence: artifacts/replay-baseline/gin-phase-three-compact-close-proof.json,
gin-phase-three-final-benchmark.json, and gin-concurrency-results.json.
The paid temporary project zvjgtqtpsyqhjfpppkmm is deleted at phase completion;
its local credential file is removed. Do not reuse its project ID.
