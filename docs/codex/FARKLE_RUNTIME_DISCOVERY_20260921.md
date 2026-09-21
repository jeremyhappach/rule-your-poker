# Isolated Supabase runtime discovery correction

The failed Holm campaign did not establish a gameplay defect. Its runtime
discovery and impairment owner, `e2e/liveness/support/crossCountryNetwork.ts`,
accepted only hosts ending in `.supabase.co`. The isolated API is
`http://127.0.0.1:57321`. Requests followed the expected `/auth/v1/` and `/rest/v1/`
paths but failed the hostname predicate before counting or API-key discovery.
The continuous observer had the same filter and would omit local REST receipts.

The actual-client diagnostic attached before opening a page. Before the correction,
two fresh contexts captured 29 and 28 API requests, both successful login responses,
and API-key-bearing requests beginning 9.1 and 10.3 seconds after attachment.
Both discovery attempts failed and their auth-request counters remained zero.
This rules out late observer attachment or missing HTTP requests as the cause.
The diagnostic's initial full-load wait was corrected to the existing harness's
`domcontentloaded` startup contract; that separate attempt was not counted as proof.

The harness-only correction adds `PTOWN_E2E_LOCAL_SUPABASE_ORIGIN`, which must be
an explicit loopback HTTP(S) origin without credentials, path, query or fragment.
When configured, HTTP and equivalent WS/WSS traffic must match that exact scheme,
host and port; frontend ports and hosted databases are excluded. Without the
setting, existing hosted matching is unchanged. Runtime credentials still come
from actual browser request headers. No environment-key fallback or weakened
gameplay/terminal/timing expectation was added.

The same matcher feeds continuous REST observation, preserving its `/rest/v1/`
boundary. Response-loss injection, transport latency and ordered WebSocket
delivery remain active for the local database. Unit coverage proves origin
negatives, observed-key discovery, response loss, WS matching and REST receipts.
The existing network queue tests are now included in the full harness script.
No application source, migration, production setting or game behavior changed.

After correction, both fresh diagnostic contexts observed 28 requests, discovered
the exact runtime and recorded one auth request. Both unchanged focused Holm
liveness cases passed with zero retries: dealer draw, deliberately lost ante
response, live recovery/remount and canonical continuity. Both fixtures were
deleted through the existing guarded cleanup. Total focused duration: 256.6 seconds.
Focused units: 59 assertions across the network and observer test files.

These focused checks precede final qualification. The complete 21-case campaign
must start from case 1 at the resulting committed SHA, with all deterministic and
Farkle gates confirmed there. Prior failed/unrun cases are not carried forward.
Production creation remains disabled, admin-only enabled, defaults unapproved
and unseeded. Main integration remains held.

Sanitized before/after request timestamps and focused summary are recorded in
[`runtime-discovery`](../../supabase/farkle/wave2-qualification/20260921-runtime-discovery/focused-summary.json).
Raw traces containing authentication traffic remain local and are not published.
