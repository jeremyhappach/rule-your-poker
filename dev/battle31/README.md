# Battle 31 local qualification

The original route runners use the disposable PostgreSQL clone in
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


## Recovery and release package

Run with the already-installed dependencies and loopback PostgreSQL service:

```text
node dev/battle31/recovery-contention.mjs
node dev/battle31/package-release.mjs
node dev/battle31/package-proof.mjs
node dev/battle31/recovery-regressions.mjs
```

Contention and package proofs create dedicated `battle31_*` clones of the existing
money-qualification template. They never mutate the template or production.
The package builder briefly installs current-main registration in a rolled-back
local transaction to obtain its canonical preimage hashes. It writes the portable
atomic migration `supabase/battle31/release.sql` and hash manifest. No Supabase CLI
is installed here; a history filename must be assigned on the approved release
host using its CLI. Do not silently regenerate against unreviewed main changes.

The package proof models cron registration with a local metadata stub and creates
a publication catalog entry. It does not prove real pg_cron execution or logical
replication: the clone has no pg_cron extension and uses `wal_level=replica`.
Regression runners accept `BATTLE31_DATABASE` only for named disposable Battle 31
databases. Fixtures deliberately enable local admission and write synthetic
recovery-health timestamps; these runners must never become hosted proof scripts.
The regression wrapper checks package replay over settled fixture data and closes
its local admission gates afterward. Retained proof results are in `evidence/`.


## Hosted qualification preparation (separate authorization required)

`node dev/battle31/hosted-qualification.mjs` only prints preparation status.
It makes no connection by default. An authorized operator must explicitly supply
`--run-installed` and `BATTLE31_QUALIFICATION_URL` through the approved secret
channel. Do not print or commit the connection value. The driver requires the
exact installed package and all four release flags closed, checks actual cron
execution and canonical health, then runs rollback-only financial fixtures.
It does not install, schedule, activate, or manufacture health. Local
`proof.mjs` explicitly opts into synthetic health; the hosted driver does not.

Run `node dev/battle31/hosted-qualification.test.mjs` for mocked preflight tests.
These tests prove fail-closed handling, not hosted health. See
`docs/codex/BATTLE31_RELEASE_CORRECTIONS.md` for qualification limits and current
package identity. Closing new admission preserves accepted offers in qualified
modes; do not revoke enabled/money qualification before pending offers drain.

## Timeout and reclaim correction

After package-proof, set BATTLE31_DATABASE to its returned disposable database
and run `node dev/battle31/timeout-lifecycle.mjs`. For the actual-route proof,
prepare/build/start the route server against the same local database and run
`node dev/battle31/timeout-browser.mjs`. It checks both money modes, reconnect,
checkbox reclaim, opponent robot and canonical host resume. No hosted credentials
are accepted. The exact canonical lifecycle helper installs missing clone
functions only; it is not part of the release payload.

Real-money timeout now pauses. The concurrency runner explicitly opts both
humans into autoplay before testing unattended real-money progression; it no
longer mislabels forced PASS progression as real-money recovery policy.
