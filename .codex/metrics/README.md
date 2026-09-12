# Local server-metrics capture

This standalone collector reads the existing Supabase Metrics API once per
minute. It is independent of the poker application and is not deployed to
Vercel. It needs the already installed Node.js and Windows PowerShell only.

Jeremy's desktop folder **P-Town Poker Metrics** contains three shortcuts:

- **Start capture (24 hours)**: starts a hidden local collector, unless one
  is already running. It stops automatically after 24 hours.
- **Stop capture**: stops after the current read; saved samples are retained.
- **Capture status**: displays whether the process is running, sample counts,
  failed reads, latest timestamp, deadline and saved-data location.

Keep this computer awake and connected while playing and for 45 minutes
afterward. The collector does not prevent sleep, start after a reboot, or
catch up with a burst of requests after a gap. Start it again after a reboot.
The initial approved capture runs until September 15, 2026 at 6 p.m. Central.

## Storage and access

Data and the encrypted credential are under
`%LOCALAPPDATA%\PTownPoker\metrics`, outside the repository. The directory's
ACL allows the current Windows user and SYSTEM. `access.dpapi` is encrypted
with Windows DPAPI for the current user. An existing project secret API key
was reused; it is privileged, not a newly scoped read-only key. The program
only issues GET to this project's fixed HTTPS metrics endpoint. Redirects
are rejected. Keys never appear in process arguments, collected files or logs.

Each capture directory contains compressed original Prometheus snapshots,
`samples.jsonl` with derived measurements, and `errors.jsonl` when reads fail.
`status.json` holds the latest status. No saved history is automatically deleted.
Responses are limited to 8 MiB and requests time out after 20 seconds. There
is at most one request per minute and one active local collector. Five
consecutive failed reads stop the run; authentication failure stops it
immediately. There is no automatic notification service.

The initial endpoint read returned roughly 240 KB decoded / 20 KB compressed
over the network. About 1.2 MB/hour of response bodies is recorded separately
as `wireBytes`; headers and billing attribution are not included. Include
this observation traffic when interpreting the next usage check.

## What the capture can establish

Available signals include MemAvailable, shared/anonymous/cache/slab memory,
swap occupancy and exported swap counters, CPU/I/O-wait counter deltas, I/O
by disk, database connection count, PostgREST pool availability/waiting/
timeouts, and database/query counters. Missing values remain null; counter
decreases and known resets invalidate deltas. Original snapshots allow later
comparison with exact session timestamps without additional gameplay writes.

The exported `process_resident_memory_bytes` has `postgresql` and `gotrue`
service labels. The PostgreSQL label can refer to the exporter process;
it must not be reported as total database-backend RAM. There is no complete
per-backend/PostgREST resident-memory breakdown. These samples do not certify
Free performance. Exported swap counters currently read zero despite retained
swap occupancy, so assess them alongside memory and disk evidence.

## Maintenance

Run controls with process-local PowerShell script execution enabled:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .codex/metrics/Control-Metrics.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .codex/metrics/Control-Metrics.ps1 -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .codex/metrics/Control-Metrics.ps1 -Action Stop
node --test .codex/metrics/collector.test.cjs
```

`Start -Until <ISO timestamp>` can set a deadline up to seven days away.
Windows execution policy is not changed persistently. A stale lock is removed
only after checking that its PID is not this collector. No unrelated process
is terminated.

For an intentional credential replacement, copy the existing secret from
the authenticated Supabase API Keys dashboard and run
`Import-MetricsAccess.ps1` with the same PowerShell options. It validates
access to the fixed project endpoint before encrypting the key and replaces
the clipboard contents afterward. Never put a secret in a command argument,
repository file, frontend environment variable, or documentation.

Reference: [Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics/vendor-agnostic).
