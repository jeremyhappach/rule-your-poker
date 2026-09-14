# Gin replay production deployment — September 14, 2026

Production project: xvhmbuppghwmwpwrkzao. Qualified source: af0867d42.
Applied migration: 20260914192806_gin_replay_v1, at 19:28 UTC.
Human-readable canonical history remains unchanged. No replay UI or other game capture is included.

## Deployment delta and ownership

The preflight export of all 14 production schema sections exactly matched the
qualified baseline. Production ended at 20260912192636_canonical_hand_history,
with no replay tables, helpers or enrollment fields. The migration guards all
23 replaced authority definitions against their original hashes and applies
transactionally with a five-second lock timeout.

The approved replay/1 schema, six Gin owners, 17 shared hooks and journal-only
exporter come from the qualified checkpoint. Only successful initial/next-hand
opening now sets the enrollment marker automatically. Shared hooks additionally
require game_type = gin-rummy, and skip end processing without a Gin context.
The action, scoring, visibility, closing and settlement contracts are unchanged.

Opening checkpoints, ordered lossless substeps and closing snapshots remain in
the authoritative transaction. A complete seal applies to the captured hand;
coverage remains hand_boundary. Existing hands and pre-enrollment session
history are not backfilled or claimed session-genesis complete. Sequence values
retain the qualified globally monotonic contract; interleaving and rollbacks can
leave numeric gaps. Consumers use recorded order and the seal, not arithmetic
contiguity across sessions.

## Focused validation

- 13 headless replay/visibility tests, app TypeScript check and Vite production build pass.
- 40 actual database exports reconstruct offline, reconcile scores and exact
  transfer edges, and preserve historical visibility for public/participant views.
- The database proof removes mutable gameplay rows and obtains identical exports.
- Gin, knock, undercut, layoff, void, automatic play, continuation, postgame,
  dealer selection, termination, mid-hand shared changes and duplicate
  settlement/continuation checks pass.
- Deployment boundary proof passes: an existing uncaptured hand remains
  uncaptured, fresh hands automatically record opening, other-game shared
  actions skip the journal, and recovery preserves prior rows with a partial tail.
- All 43 deployed function definitions (including the preserved overload)
  match the validated temporary database exactly.
- Journal tables have RLS and postgres-only ACLs, two targeted unique indexes,
  and no Realtime publication. Production had zero lock waiters and zero
  enrolled/backfilled sessions immediately after migration.

## Committed latency recheck

80 interleaved disabled/enabled samples per category, 800 authoritative actions.
Timing includes the authenticated RPC and actual COMMIT, including deferred
ledger work; fixture preparation and network/rendering are excluded.
synchronous_commit and fsync were on. A temporary fixture-only reset disables
capture for the baseline after opening; no bypass is added to production.

All times are milliseconds. Relative change is diagnostic only.

| Action | p50 disabled / enabled | Added p50 | p95 disabled / enabled | Added p95 (%) | Max disabled / enabled |
| --- | ---: | ---: | ---: | ---: | ---: |
| compound | 9.253 / 12.115 | 2.862 | 15.847 / 21.021 | 5.174 (32.65%) | 31.76 / 32.77 |
| ordinary | 8.749 / 9.918 | 1.169 | 15.893 / 15.655 | -0.238 (-1.50%) | 28.96 / 31.56 |
| reveal_void | 9.505 / 13.715 | 4.210 | 16.661 / 22.036 | 5.375 (32.26%) | 18.71 / 44.61 |
| scoring | 131.312 / 134.866 | 3.554 | 219.683 / 217.426 | -2.257 (-1.03%) | 288.42 / 485.40 |
| settlement_terminal | 148.942 / 152.465 | 3.523 | 265.504 / 254.555 | -10.949 (-4.12%) | 388.63 / 383.13 |

All added p95 values pass 10 ms for ordinary/compound/reveal and 50 ms for
scoring/terminal. Negative differences represent sampling variation, not a
claim that replay improves gameplay speed. One enabled scoring sample reached
485.40 ms; disabled/enabled terminal maxima were 388.63/383.13 ms. There was no
repeated outlier pattern or observed lock waiting. This bounded check is not a
long-session or broad concurrency stress test; prior qualification limitations
remain. No unrelated scoring optimization was made.

Machine-readable measurements:
supabase/tests/replay/gin-production-latency-20260914.json.

## Recovery and smoke boundary

supabase/tests/replay/gin-production-recovery.sql is a controlled, transactional
recovery script, not an automatic down migration. It locks enrolled sessions,
appends capture.suspended, clears enrollment using the existing pause-write
guard, and restores the original 23 authority definitions. Replay rows and
export remain available; the affected tail is partial. The rollback proof
executes this path, verifies preservation and partial sealing, then rolls all
fixtures and recovery changes back. The original qualified branch remains
preserved. Future re-enrollment must begin at a new authoritative opening.

The temporary preflight branch and its credentials are removed at release
completion. Production runtime acceptance is pending Jeremy's fresh Gin
hand/session. A hand already open before deployment remains legacy partial;
start a new hand or session for the smoke check. The other six games remain
outside this release.
