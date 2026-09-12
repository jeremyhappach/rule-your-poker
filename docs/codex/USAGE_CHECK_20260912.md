# September 12 usage after clean cross-country play

Read-only check approximately 11:58 AM–12:04 PM Central / 16:58–17:04 UTC.
Jeremy reports zero issues in last night's cross-country real-money session.
No gameplay, production data, billing, compute or application changes were made.

## Session and health

The matching session is 8b683d7c-fd57-4a28-a339-710860b35b0f, named
Sep 11 - Scottie Pippen: September 11 21:13:58–21:56:41 Central, approximately
43 minutes. It ended normally. Two humans played six dealer games: one each
of 3-5-7, Cribbage, Gin and Yahtzee, plus two Holm games.

All 80 retained scheduled recovery batches starting during the session
succeeded. These are approximately 30-second batches, not individual tick or
action latency measurements. Current task/unit failure registries are empty;
the latest dispatcher is completed with zero consecutive partial failures.
The current point sample has 23 database connections and zero lock waits.
Database size is 154,356,883 bytes, about 154 decimal MB (September 11: 163 MB).
This is database size, not the provisioned disk or RAM footprint.

The client-runtime table reports build id `dev` for this session; it does not
identify an immutable published SHA. Record Jeremy's smoke as a session-level
pass, without assigning that telemetry value to a specific source build.

## Bandwidth and activity

Current cycle September 8–October 8; the dashboard may lag by one hour.

| Metric | September 11 check | September 12 check | Change |
| --- | ---: | ---: | ---: |
| Poker uncached egress | 0.438 GB | 0.531 GB | about 93 MB |
| Organization uncached egress, both apps | 0.450 GB | 0.548 GB | about 98 MB |
| Poker realtime messages | 35,168 | 43,940 | 8,772 |
| Organization realtime messages | 35,172 | 43,944 | 8,772 |
| Peak realtime connections, poker / organization | 7 / 8 | 7 / 8 | unchanged |
| Edge Function invocations, poker / organization | 9 / 9 | 17 / 17 | 8 |

Organization Pro quotas show no overages. MAU remains 8; object storage remains
0.004 GB. Poker's September 12 partial daily chart shows Auth 37.346 KB,
PostgREST 18.107 MB, Realtime 47.876 MB and functions 570 bytes: approximately
66 MB, with 72.5% in Realtime. These are dashboard labels, not a dedicated
byte meter for the 43-minute session.

The roughly 25-hour change includes yesterday's engineering tests, ordinary
play and any open-tab traffic. Extending its organization rate gives about
2.8 GB per 30 days, below the previously established 4 GB safety target and
lower than yesterday's 3.9 GB short-window estimate. It is a provisional pace,
not an isolated game rate or a qualified monthly forecast.

## CPU and memory around play

The database chart window is September 12 02:00–03:10 UTC, displayed locally
as September 11 21:00–22:10. Estimates below reconstruct 36 rendered two-minute
bars from their SVG heights and labeled axes; brief sub-bin spikes may be missed.
CPU categories use 100% per 120 chart pixels. Memory uses the labeled
524.52 MB per 30 pixels; labels use roughly 1,024 MB per GB.

| Measurement | Approximate observed range / summary |
| --- | --- |
| Total CPU across rendered categories | 5.30% average; 12.90% maximum |
| CPU I/O wait | 0.23% average; 1.17% maximum |
| Used memory, excluding cache/buffers | 370–1,037 chart MB; 628 MB average |
| Cache and buffers | 835–1,207 chart MB |
| Swap allocated | 0.25–59.32 chart MB |

The main memory heading is 1.89 GB; it must not be interpreted as application
memory alone. The chart separately displays Used, Cache + Buffers, Free and
Swap. A roughly 1 GB Used peak and some allocated swap remain reasons not to
infer Free performance from light CPU or lower bandwidth. Allocated swap does
not itself establish active swapping or observed lag.

Network throughput, disk IOPS/throughput and connection-history charts report
Unable to load data even after one refresh. This check therefore cannot supply
those historical metrics. Current SQL connection counts are not substituted
for the missing historical chart.

Conclusion: the reported clean play agrees with light CPU, low I/O wait and
healthy recovery on current Small compute. Bandwidth pace has improved. Free
capacity remains unqualified; this check performs no downgrade or new tests.

Sources: [usage](https://supabase.com/dashboard/org/fctcvjjjpybsvywoqbac/usage),
[poker database play window](https://supabase.com/dashboard/project/xvhmbuppghwmwpwrkzao/observability/database?its=2026-09-12T02%3A00%3A00.000Z&ite=2026-09-12T03%3A10%3A00.000Z&isHelper=false),
read-only deployed SQL, and USAGE_CHECK_20260911.md for the prior snapshot.
