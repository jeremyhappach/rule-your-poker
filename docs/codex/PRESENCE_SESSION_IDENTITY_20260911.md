# September 11 presence identity optimization

Jeremy approved removal of the repeated heartbeat identity lookup, measurement
of its savings, and assessment of the lobby refresh path. This scope includes
client publication and isolated presence checks; it does not include changing
plans, resizing compute, resolving historical money sessions, changing lobby
behavior, or the separately pending diagnostic-import fix.

## Owner and correction

`src/lib/runtimeInstrumentation/voicePresenceHeartbeat.ts:writeHeartbeat`
previously called `supabase.auth.getUser()` before every presence upsert.
It now reads `supabase.auth.getSession()`, which uses the current SDK-managed
browser session and performs the normal token refresh when necessary. There
is no new cached identity, auth listener, scheduler, retry or telemetry writer.

Deployed RLS is enabled. `vph_manage_own` is restricted to `authenticated`,
with both USING and WITH CHECK equal to `user_id = auth.uid()`. The peer
policy is SELECT-only. `(user_id, tab_id)` remains unique, and
`trg_vph_updated_at` calls the database timestamp trigger. The browser session
supplies the requested identity; it does not authorize writes.

Preserved: four-second cadence; immediate route, visibility, pagehide and safe
boundary observations; single in-flight write and newest-context coalescing;
normal SDK auth changes and token refresh; server timestamps; RLS; presence
lease and abandonment rules; every game rule, action, timer and settlement.

Official SDK behavior was verified against the current getSession/getUser
documentation and the Supabase changelog. No relevant breaking change applies
to this use of the existing installed client; no dependencies were changed.

## Validation

- Eight focused heartbeat tests pass: cadence/idempotent start, coalescing,
  write failure recovery, sign-in/sign-out/account changes, sign-out/account
  change while a write is stalled, failed session refresh recovery, and
  hidden/leaving observations.
- `bun run build` passes the required app typecheck, all 1,570 app tests,
  150 harness tests and production bundling. Existing chunk-size/mixed-import
  warnings remain non-fatal.
- `e2e/liveness/presenceCost.spec.ts` measures two separate authenticated
  browser contexts in the lobby for 44 seconds after warm-up. It creates and
  joins no game, captures counts rather than credentials, closes both tabs,
  deletes only their exact presence leases, and verifies their deletion.
- Published baseline `2eb3cc29dfcf425c6f23ea007bb5686f6f139896`: each browser
  made 11 Auth user requests, 11 successful heartbeat writes and 12 lobby
  reads. Heartbeat intervals ranged from 3,978 to 4,055 ms.

The first local preview used the repository's older source-project `.env`
(`ehccrxumpibuoehfsmms`), so its measurements are excluded from the matched
comparison. The local bundle was rebuilt with process-only production URL/key
overrides, leaving `.env` unchanged. The test now requires the expected project
before login and records both observed backend origins. It also waits for all
responses to heartbeat requests made within the measurement window, and
directly checks rejection of cross-user and unauthenticated presence writes.

The corrected local production-mode candidate passed against
`xvhmbuppghwmwpwrkzao`: both browsers made zero Auth user lookups and 11
heartbeat writes, and all 22 responses succeeded. Both retained 12 lobby reads;
there were no presence HTTP failures or page errors. Intervals were
3,985-4,013 ms. Cross-user writes returned 403; unauthenticated writes were
rejected. Exact presence cleanup passed. Candidate screenshots were inspected.
The candidate embeds the pre-commit base SHA `e2eaebb8911d54c49a71c85f0e30b360948d2768`
with the approved working-tree change; this is not a published build claim.

Production verification remains pending the approved push.
Evidence is under `artifacts/presence-session-20260911/`.

## Remaining lobby candidate

The baseline confirms 12 foreground lobby reads per browser in 44 seconds,
consistent with four refreshes of games, players and ended-session snapshots.
The source also refreshes on games/players realtime events and focus/resume.
The lobby already bounds the list to 50 and coalesces in-flight requests.
Further work must distinguish redundant refreshes or unchanged history reads
from necessary fresh admission/results data. This measurement does not prove
the same rate for an overnight hidden tab. Lobby behavior remains unchanged.

Request removal is measurable; CPU, RAM, monthly egress savings and Free
capacity are not certified by this short lobby comparison.
