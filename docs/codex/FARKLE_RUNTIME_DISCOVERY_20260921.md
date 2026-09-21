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

## Exact-SHA follow-up: separate reclaim proof failure

The correction was committed and pushed as
`852c22349b39d7cc83ededce98b330cda69cfaef`. The frontend was restarted at that SHA.
Application source and migration tree hashes exactly match the previously tested
notice-fix SHA `6493c590cd7aa50c4a37709988c6cfc4bfb87f77`.

An additional single Farkle matrix run passed its first ten cases, then failed
`fake_deferred` at `runtime-farkle.local/timeout-proof.spec.ts:79`:
the actual `set_automatic_play` response had `deferred=false`, while the proof
expected `true` solely from the scenario label. Two remaining cases were unrun.
The proof waits for takeover, refreshes the actor, and clicks Rejoin under a
TEST ONLY five-second bot-action delay. It does not establish that the same actor
still owns the turn when Rejoin reaches the server.

Both failure screenshots show Farkle Test 1 with 50 banked points and one completed
turn, with Farkle Test 2 active. This supports a proof timing-race hypothesis:
the bot may have banked during refresh, making immediate reclaim legitimate.
It is not enough to prove the exact authority state at RPC entry, which was not
captured. No product defect is established; no product or assertion change was
made in response. The fixture's existing finally block cleaned its gameplay rows.
The full 21-case seven-game campaign was held after this separate failed gate.

Next diagnostic: capture the authoritative actor, sequence, completed-turn count,
bot flags, Rejoin request/response and timestamps before/after the request. Only
then correct the proof if it attempted deferred reclaim after the turn completed.
Preserve both deferred-current-turn and immediate-out-of-turn expectations.

Final local cleanup found no synthetic users/profiles or fixture tables beyond
the expected three private control rows and seven existing-game defaults. The
single setup-timeout debug row was verified as owned and removed by exact identity.
All 384 local function fingerprints/owners/security settings/grants match the
applied capture. Fresh production verification also found no drift, creation
disabled, admin-only enabled, zero Farkle defaults/games/handoffs and defaults
approval false. The task's frontend and timer scheduler were stopped.

`farkle-stopped.json`, `reclaim-timeout-proof.json`, both failure screenshots,
`source-integrity.json`, `production-final.json` and `cleanup.json` are recorded
beside the runtime-discovery proof. This remains an incomplete qualification;
no main integration occurred.

The final exact-SHA deterministic run passed: 1,659 application tests in 248 files,
241 harness tests in 12 files, typecheck and the Vite production build (36.23 s).
The application suite ran after browser contexts closed, without a concurrent
browser campaign. The earlier 158 SQL assertion result is preserved; those SQL
proofs were not rerun in this request. Their deployed function metadata and the
immutable migration tree were confirmed unchanged. All failed/unrun browser and
remaining final SQL gates remain required before qualification.
