# September 12 server-memory investigation

Status: read-only investigation complete; historical process attribution remains
unresolved. No application, hosting, production-data, logging configuration,
statistics reset, extension installation or deployment change was made.

## Conclusion

The approximately 1 GB Used peak was temporary. It fell substantially while
the game continued, and returned below its pre-game baseline about 33 minutes
after session end. This does not demonstrate a persistent memory leak from
leaving the lobby open. It also does not establish Free capacity or prove
which process held the extra RAM.

Small's memory configuration and cache behavior cannot be treated as the
application's fixed minimum requirement. Conversely, subtracting buffer sizes
from the peak would not prove a smaller machine will perform identically.
No memory-setting correction is supported by this evidence alone.

## Identity and timeline

Project: xvhmbuppghwmwpwrkzao, ptown-poker-prod, Small compute.
Session: 8b683d7c-fd57-4a28-a339-710860b35b0f, Sep 11 - Scottie Pippen.
Two humans; session 02:13:58.789822–02:56:41.603561 UTC September 12
(21:13–21:56 Central September 11). Jeremy reports clean real-money play.

The Database report was extended to 01:50–05:00 UTC. Values below are
approximate rendered SVG measurements, in the chart's MB units; 96 two-minute
bins, 524.52 MB per 30 vertical pixels. They are not raw exports or
instantaneous maximum measurements.

| Central time September 11 | Used memory | Context |
|---|---:|---|
| 20:50–21:12 | 369–374 MB | Before session |
| 21:14 | 468 MB | Yahtzee begins at 21:14:17 |
| 21:24 | 801 MB | 3-5-7 begins at 21:22:32 |
| 21:40 | 1,037 MB | Peak; Gin begins at 21:39:18 |
| 21:42 / 21:44 | 680 / 550 MB | Drops while Gin continues |
| 21:56 | 663 MB | Session ends at 21:56:41 |
| 22:00 / 22:18 | 515 / 404 MB | After play |
| 22:30 / 23:00 | 354 / 354 MB | Back below baseline |
| Midnight | 353 MB | About two hours after end |

Cribbage began at 21:25:06; the two Holm dealer games began at 21:36:33 and
21:37:03. Timing alone does not identify any game as the RAM owner. Memory
rises across several games; the steep drop occurs during Gin, not at its end.

Cache/buffers ranged approximately 835–1,207 chart MB. Swap rose from about
0.25 MB to 59 MB during play, then stayed near that level as Used RAM fell;
about 60 MB remained at midnight. Swap occupancy alone does not establish
continuing swap I/O or latency. The earlier 02:00–03:10 window showed CPU
averaging about 5.3%, peaking at 12.9%, with I/O wait peaking at 1.17%.
See USAGE_CHECK_20260912.md for that original measurement.

## Configuration and query evidence

Read-only deployed settings at 17:08 UTC:

- shared_buffers 512 MiB; wal_buffers 16 MiB.
- work_mem 5 MiB per qualifying operation; hash_mem_multiplier 2.
- maintenance_work_mem 128 MiB; autovacuum_work_mem inherits it.
- temp_buffers 8 MiB; effective_cache_size 1.5 GiB is a planner estimate,
  not an allocation.
- max_connections 90. PostgREST logs show a pool maximum of 30; that is a
  ceiling, not the actual historical connection count.

The point sample had two idle PostgREST client backends, not a current
connection pileup. The browser Supabase client is a module singleton in
src/integrations/supabase/client.ts using HTTP and Realtime; players are not
equivalent to dedicated PostgreSQL connections. Historical connection and
disk charts remained unavailable. The separate Connections report is live,
not a source of historical counts.

Retained pg_stat_statements entries for 595 authenticated statement shapes
report zero temporary blocks written. The largest retained temporary-file
writers were administrative/diagnostic queries. However, statement tracking
is top-level, reset dates are old (August 2 for statements, July 24 for
database totals), and entries can be evicted. These are not session-isolated
measurements or proof that queries consumed little RAM. The old cumulative
502 GB temporary-byte counter must not be attributed to last night's game.

pg_buffercache is not installed. No historical per-process resident-memory
or allocator samples were available. Shared-buffer allocation is not a
measurement of resident pages. These boundaries prevent a defensible split
among shared database buffers, private backend memory and other VM services.

## Historical logs and diagnostics

Unified Logs successfully loaded the exact 01:50–05:00 UTC interval.
All 41 PostgREST log entries were successful reload/cache/pool messages, in
clusters at 02:13:55–57 and 04:25:56–57 UTC. No PostgREST restart/reload was
logged at the 02:40 peak or the following steep drop.

The 14 returned PostgreSQL error entries contain 11 RLS rejections of
chat_message_delivery_trace at 02:37:55–02:38:31, two
account_balances:not_authorized entries at 02:13:55 and 02:56:54, and one
three_five_seven_current_frame:not_357_game at 02:25:07. None is a memory
exhaustion error. Record these for separate ownership/authorization review;
do not weaken RLS or assume they affected user-visible play. The Realtime
log read timed out, so no conclusion is made about those entries.

Within this interval, debug_events contains 1,216 rows, 1,373,184 stored
payload bytes total, and a largest stored payload of 15,804 bytes. All rows
are either tied to this session (859) or have null game_id (357). First/last
timestamps are 02:13:59–02:56:50 UTC. There is measurable optional diagnostic
work, including 3-5-7 wartime capture, but stored bytes do not measure its
network volume or RAM demand. It cannot explain the peak by itself.

The previously queued tracing issue is still present in source:
holmFullForensics.ts arms on import and ffRecord re-arms stopped recording.
Correcting that behavior is a separate candidate to reduce optional work,
not an established RAM remedy. Preserve explicit action provenance, genuine
errors, settlement evidence and all gameplay timing in any later correction.

## Recommended next step

Before a hosting trial, obtain a bounded passive capture during ordinary
play on the unchanged Small instance: one scrape per minute of the existing
Metrics API, retaining available memory, swap-in/out counters, disk I/O,
connections and available service memory. Pair with small before/after
statement-statistic deltas and exact session timestamps. No synthetic game
or special test by Jeremy is needed for that observation.

First inspect which series this project's endpoint actually exposes. The
published metrics catalog includes Auth resident memory but does not promise
per-process PostgreSQL/PostgREST RSS. If the attribution remains missing,
request provider-side process evidence rather than repeatedly collecting the
same aggregate chart or claiming the capture must identify the process.
The connector exposes publishable keys only; no privileged metric collector
or secret-key retrieval was configured in this investigation.

This monitoring setup and any compute change remain proposals. Passive
measurements can narrow the risk; equivalent performance on Free's up-to-0.5
GB hardware still requires a separately approved controlled trial. Keep the
already scheduled September 15 clean-week quota review. The goal remains
reducing the monthly bill with evidence, not accepting $40 indefinitely.

## Evidence and interpretation sources

- Local evidence: artifacts/memory-investigation-20260912/evidence.json.
- [Supabase reports](https://supabase.com/docs/guides/observability/reports):
  Used/cache/commitment categories.
- [Memory and swap](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0)
  and [high swap](https://supabase.com/docs/guides/troubleshooting/exhaust-swap):
  interpret occupancy alongside resource pressure and I/O.
- [Metrics API collection](https://supabase.com/docs/guides/observability/metrics/grafana-self-hosted):
  existing endpoint and 60-second collection cadence.
- [Published metrics catalog](https://github.com/supabase/supabase-grafana/blob/main/docs/metrics.md):
  inspect actual service coverage before promising process attribution.
- [Compute specifications](https://supabase.com/docs/guides/platform/compute-and-disk):
  current Small/Micro/Nano resources; no tier change made.
