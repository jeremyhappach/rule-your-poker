# September 12 local metrics collector

Status: approved, configured and running locally. Jeremy approved the proposed
local collector after asking whether last night's measurements were automatic.
No application release, migration, production-data write, compute resize,
new external monitoring account, or dependency installation was needed.

## Delivered

- Source: .codex/metrics/collector.cjs and Control-Metrics.ps1; operator
  instructions in .codex/metrics/README.md.
- Secure setup: existing project secret key reused through the authenticated
  dashboard's Copy control, validated by HTTP 200 from the exact project's
  metrics endpoint, then stored with Windows current-user DPAPI. No new key
  or permission grant was created. The key remains privileged; the collector
  restricts its own behavior to one fixed HTTPS GET endpoint.
- Local data: C:\Users\jerem\AppData\Local\PTownPoker\metrics. Directory ACL
  permits only Jeremy's Windows user and SYSTEM. Data and credentials stay
  outside the Git repository. The credential was not printed or stored in
  source, logs, arguments, or a frontend environment variable.
- Desktop folder: C:\Users\jerem\Desktop\P-Town Poker Metrics, with Start
  capture (24 hours), Stop capture and Capture status shortcuts.
- Current capture ends September 15, 2026, 18:00 America/Chicago
  (23:00 UTC). It runs once per minute while this computer is awake and
  online. A reboot requires using Start again; a manual start defaults to
  24 hours. No system sleep setting or persistent execution policy changed.

## Measured coverage and overhead

The live endpoint exposed 303 named metric families in the initial response;
300 had finite numeric values in the subsequent parsed probe. Available
metrics include detailed node memory categories, MemAvailable, swap and disk
counters, CPU modes, database connections and cumulative workload counters,
PostgREST pool availability/waiting/timeouts, and reported process RSS for
postgresql/gotrue service labels.

The postgresql RSS label can describe the exporter process. Do not equate
its approximately 15 MB reading with all PostgreSQL backend memory. There is
no complete per-backend/PostgREST RSS breakdown. The exposed swap-in/out
counters read zero despite about 60 MiB retained swap occupancy; use the
memory and disk signals together rather than overclaiming those counters.

HTTPS gzip transferred about 19.8 KB per successful sample (about 240 KB
decoded). That is approximately 1.2 MB/hour or 29 MB/day of response bodies
at the observed size. The collector records actual response-body wireBytes;
headers and Supabase billing attribution are not included. Account for this
new observation traffic when comparing usage. It is one independent read per
minute, without overlapping requests or catch-up bursts after sleep. It does
not add an awaited step to any game action; zero infrastructure overhead is
not claimed.

## Verification

- Six focused Node tests pass: escaped-label/scientific-value parsing,
  missing-value handling, reset handling, elapsed-time CPU/disk/swap deltas,
  database-stat reset invalidation and credential containment on redirect.
- Authenticated probe succeeds over HTTPS/gzip; missing required project
  memory metrics would reject the response.
- First live capture recorded two successful samples at 17:48:06.942 and
  17:49:06.852 UTC with no failed reads. A duplicate Start was refused.
- Stop ended that process, released its lock and preserved both snapshots.
- Restart at 17:50:13.937 UTC succeeded. At 17:52:17 UTC it had three
  successful samples, zero failures, a measured 60-second final gap, three
  compressed snapshots and an empty stderr log. Pool waiting/timeouts were
  both zero. Current PID at this checkpoint: 16240; do not treat it as a
  permanent identifier.
- User/SYSTEM-only ACL and absence of secret-key patterns in top-level
  collector outputs were checked. Full original metric snapshots and parsed
  JSONL samples are saved locally; missing metrics are not replaced by zero.

Per-statement baseline: artifacts/metrics-collector-20260912/statement-baseline.json,
668 retained authenticated/anon/authenticator statement entries at
17:49:41.554984 UTC, with original statistic-reset timestamps. Later deltas
must account for resets/eviction and separate capture/setup activity from
gameplay. The collector itself uses the Metrics API, not repeated custom SQL.

## Follow-up

Jeremy only needs to leave the computer awake and connected during ordinary
play and for 45 minutes afterward. Review the local samples against the
authoritative session timestamps and the existing September 15 quota check.
The collector stops on its deadline, an explicit Stop, authentication
failure, or five consecutive failed reads; Capture status exposes failures.
No separate notification automation was created.

These measurements refine memory-pressure attribution. They do not establish
equivalent performance on Free, replace Jeremy's smoke acceptance, or grant
authorization for any later infrastructure change.
