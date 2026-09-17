# Separate simulated delay from native request latency

Approved September 17 after the prior live observation could not distinguish
an intentional Chaos wait from organic response latency. This is a client-only
measurement correction; game rules, replay writers, transaction boundaries,
settlement and database schema are unchanged.

Each observed Gin RPC now includes `transportTimingVersion: 1` and:

- `networkSimMode`: effective mode captured when transport starts.
- `chaosPhase`: the phase that supplied this request's simulation decision.
- `injectedDelayPlannedMs`: the chosen artificial wait.
- `injectedDelayMs`: actual elapsed wait, including scheduling delay or an
  interrupted wait. It does not pretend the configured duration always elapsed.
- `nativeFetchMs`: native fetch dispatch to response headers, or elapsed native
  fetch time until failure. Null means the native request was never measured,
  including simulated failure/abort before send; it is not a zero-duration RPC.
- `simulationFailure`: simulated before-send failure or response loss, otherwise
  null. HTTP status and the existing failure flag retain their meanings.

The existing `responseHeadersMs` remains total transport elapsed time, including
injected wait. Request UUID connects these fields to parsed-response and paint
opportunity records. Fields are additive; old rows lack them and cannot be
retroactively classified. No raw request operands, faces, response bodies or
error strings are added to telemetry.

Observation is request-local, so concurrent calls and preference changes during
a wait cannot overwrite another request's measurements. Existing transport
decisions, original aborts/errors, response-loss behavior and exactly-once native
delegation are preserved. Capture adds scalar assignments and clock reads only
to the existing timed Gin requests; there is no extra gameplay request, journal
write, subscription, query or awaited telemetry delivery.

Client observation is reopened until **September 18 at 12:00 UTC / 07:00 Central**
for the next play session, retaining the existing batch limits and expiry. The
September 16 server helper observation remains expired; `replayMs` may be null.
This release does not restart or change those database helpers. Native request
duration combines real network and server work; it does not independently
separate server locks, commit or connection acquisition.

Validation: 23 current focused tests across six files, TypeScript and the
production build pass. The new eight tests cover 5,000 ms injected wait versus
100 ms native fetch, simulation Off, concurrent requests, mid-request preference
change, simulated pre-send failure, response loss, native failure, abort and
expiry. Existing privacy, batching and one-send checks also pass.

Browser proof passes with locally intercepted responses and no production
gameplay writes. Simulation Off recorded 0 ms injected / 121.9 ms native;
Chaos recorded 203 ms planned / 211.3 ms actual wait / 117.1 ms native, for
328.7 ms total. Each action delegated exactly once. These are attribution
checks, not a production performance benchmark. Phone-width built `/auth`
returns 200 with no JavaScript errors. The development server stalled before
the first proof, so verification used the built preview and an isolated bundle
of the same transport modules. Evidence is retained in
`artifacts/live-timing-transport-browser.json` and the associated local scripts.

Recovery: revert this client change to source checkpoint
`d19626a0cfe24b16934b6a0f7c2d52e9d3c988ef`; no database recovery or journal
changes are required. The timing window also stops automatically at expiry.
