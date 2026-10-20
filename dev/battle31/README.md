# Battle 31 local qualification

All runners use the disposable PostgreSQL clone in
`qualification.local/battle31/context.json` at 127.0.0.1:55439.
They are not production runners. Never substitute a hosted database.

The main-route harness mounts the real `src/pages/Game.tsx`, auth guard,
setup, Ante Up, Battle 31, canonical financial presentation and continuation.
It substitutes only the Supabase transport. Opaque loopback tokens bind each
browser to a synthetic auth UUID; public RPC/read transactions run as the
`authenticated` PostgreSQL role. PostgreSQL notifications feed local SSE.
Browser requests to non-loopback hosts are blocked by the runner.

With the existing candidate/clone and installed dependencies available:

```text
node dev/battle31/prepare-route.mjs
node dev/battle31/build-route.mjs
node dev/battle31/route-server.mjs
```

In a second terminal:

```text
node dev/battle31/main-route.mjs
node dev/battle31/main-route.mjs --fake
```

Preparation installs exact repository definitions for read_session_frame and
request_session_end plus fixture-only read/profile grants missing from the
clone. The server creates local notification triggers, enables the local Battle
31 gate, selects fullscreen defaults, and runs the local recovery worker.
The runner creates synthetic users/sessions and changes their local chips.
Token-bearing fixture files and build output stay in ignored qualification.local.
Retained evidence contains synthetic identities but no browser tokens.

This proves the exercised application route against actual candidate SQL.
It does not prove hosted GoTrue JWT validation, PostgREST, Supabase Realtime,
production grants/RLS parity, hosted scheduling, or physical iPhone audio.
The transport implements only the query surface needed by this journey;
optional presence/storage/functions and unused query operators are stubs.
Mute uses persisted profile state and the actual shared AudioManager preference
API; the Settings screen itself is not part of this journey.
