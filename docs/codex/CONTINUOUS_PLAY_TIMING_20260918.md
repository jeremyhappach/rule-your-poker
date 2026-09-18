# Continuous sampled play timing — September 18

Jeremy approved automatic lightweight observation so game-night timing can be
reviewed afterward. Replay capture remains Gin-only. This release does not
qualify or migrate any other game.

## Collection and retention

- No calendar expiry. Gin ordinary RPCs use an independent 25% random sample.
  Requests >=1 second, failures, scoring and lifecycle calls are also retained.
  `sampleClass` distinguishes `random`, `slow`, `error`, and `lifecycle`.
  Compute ordinary latency percentiles from `random` rows, not the combined
  enriched stream. Account for sample counts, foreground, build and simulation.
- Existing request identities correlate native fetch, intentional simulation
  delay, response parsing and React commit plus two animation frames. Native
  fetch includes real network and transaction/commit-to-headers time; paint
  opportunity does not mean animation completion or physical GPU display.
- Existing six Gin replay boundaries sample 25% of HTTP transactions, sharing
  one transaction-local decision across sections. Header timing is helper work,
  excluding COMMIT/deferred work and caller work outside the helpers. Independent
  server jobs are not measured. Missing headers mean unmeasured, not zero.
- Holm/357 ordinary card-scan timing is retained at most once per five seconds,
  plus scans >=10 ms, labeled `periodic` or `slow`. The underlying missing-card
  checks and incident capture are unchanged. Long tasks are browser-dependent
  and observed only while a supported game context is mounted.
- Batches: 128 scalar samples, eight pending batches in memory/eight persisted,
  60-second normal flush, maximum two batch deliveries per flush, three attempts,
  five-second delivery timeout and 24-hour local queue age. Lifecycle flushes
  remain. Hand/action callbacks update memory; serialization is deferred to
  flush/page exit. Uploads are never awaited by gameplay. Queue caps and dropped
  counts mean best effort, not guaranteed every-event capture.
- Both existing daily cleanup owners preserve `live-play-timing-v1` and
  `card-visibility-invariant` for seven days (eligible on the next daily sweep).
  All other diagnostic retention is unchanged. Durable replay/history is not
  part of this cleanup. Ask within seven days; browser termination/offline loss
  can still leave gaps. The earlier statement that timing could be reviewed
  arbitrarily later was too broad: previous database retention was one day.
- Uses existing `debug_events`, IDs, authorization and indexes. No new table,
  realtime subscription, per-action telemetry request, card operands or faces.

## Validation

Production migration `20260918162031` pins deployed owner definitions and changes
only the timing-start expression in six replay functions plus the two diagnostic
retention predicates. Atomic journal writes and all replay bodies remain intact.
The new private sampling helper has no public/anon/authenticated execute grant.

Before and after migration, rollback proofs cover pilot rejection/duplicate and
authorization cases, knock/layoff, undercut, gin, bots, postgame, dealer selection,
queued sit-out, leave/rejoin, ante timeout (including real-money fixture), setup
timeout, continuation, waiting terminal and the explicit legacy boundary.
All 28 rule exports and ten waiting/lifecycle exports reconstruct offline,
reconcile score/financial edges and preserve historical visibility after live
rows are removed inside the rolled-back proof. Legacy remains partial.
Both actual retention DELETE predicates also pass against temporary probe rows;
no real diagnostics are deleted by the test. Post-proof lock waiters: zero.

25 focused current-source tests pass (the runner also found five archived
baseline tests). Typecheck and Vite production build pass. Phone-width built
preview renders correctly without page errors. Isolated browser transport proof
delegates exactly once, separates Off/Chaos wait, excludes private operands and
performs no timing queue serialization at a hand change. A 500-pair interleaved
immediate-response browser check measured +0.1 ms p95 wrapper CPU cost. This is
not a network/gameplay benchmark or a measurement from either player's phone.

Bounded server instrumentation check, 14 retained interleaved samples/arm after
two warmups, replay enabled in both arms, timing forced on in the enabled arm:

| Category | Preflight added p95 ms | After migration disabled p95 ms | After migration enabled p95 ms | Added p95 ms |
|---|---:|---:|---:|---:|
| Ordinary | 0.573 | 9.155 | 9.304 | 0.149 |
| Compound | 1.020 | 13.511 | 13.666 | 0.155 |
| Reveal/void | -0.419 | 16.865 | 17.324 | 0.459 |
| Scoring | 5.316 | 254.018 | 269.194 | 15.176 |
| Settlement/terminal | -16.569 | 266.605 | 283.787 | 17.182 |

These measure authoritative RPC plus forced deferred constraints within a
rollback, excluding actual COMMIT and network. The small tail sample and run
variation do not establish causation for every millisecond. All observed added
p95 values fit the 10/50 ms guardrails. Production samples only 25%; this check
forces observation on every measured call. Full p50/p95/max evidence is in
`supabase/tests/replay/continuous-timing-overhead-20260918.json`.

## Gate for the remaining games

Continuous live evidence complements the already-qualified Gin replay contract.
It cannot prove zero overhead or substitute for a disabled/enabled comparison.
Before publishing replay for each next game, require deterministic offline
reconstruction, historical privacy, exact score/financial reconciliation, then
an interleaved replay-disabled/enabled benchmark spanning actual authoritative
RPC plus COMMIT. Added p95 budgets remain <=10 ms ordinary/compound/reveal and
<=50 ms scoring/settlement/terminal. Percentages are diagnostic only. Check tails,
locking, query amplification and session-length growth; stop/optimize if material.
Keep correctness-critical replay capture in the authoritative transaction.
Do not turn replay off on live money games to obtain a baseline. No additional
game is authorized by this observation release.

## Recovery and evidence

Client rollback: `156dc522562e6b287c27dcb7ef9d4d84ddab81c5` (old timing window is
expired). Database recovery: `supabase/tests/replay/continuous-timing-recovery.sql`
restores the exact six expired timing declarations and both prior retention
owners, then drops the new sampling helper. It does not delete replay records.
Applying recovery restores one-day diagnostic cleanup on the next scheduled run.

Proof generator: `supabase/tests/replay/build-continuous-timing-proof.mjs`.
Evidence: `artifacts/continuous-timing-*`; synthetic fixture data rolls back.
Both phones must reload the published client once. Actual-phone coverage remains
the next live acceptance step; a healthy login page is not proof of a game-night
receipt. Production client deployment receipt will be recorded in CURRENT_RELEASE.
