# Battle 31 local release corrections — October 21, 2026

Local correction to checkpoint `0446d75e5d2f3dd7c250b204a05d9e5b337f8b1a`.
No production writes, push, deployment, activation, or rules changes.

The later timeout/controller correction and current package evidence are in
[BATTLE31_TIMEOUT_QUALIFICATION.md](BATTLE31_TIMEOUT_QUALIFICATION.md).

## Final behavior

- Definition fingerprints normalize CRLF to LF only. Bare carriage returns,
  spaces, SQL/body changes, function configuration, ACLs, schema, publication and
  scheduler drift still reject. Both baseline and installed receipts use this rule.
- Four server-owned flags start false: enabled, admission_enabled,
  fake_qualified and real_qualified. New setup requires enabled, new admission,
  active-account eligibility and the session's qualified money mode.
- Bootstrap rechecks enabled and money qualification. Closing new admission
  alone does not strand an already accepted offer. Keep money qualification and
  gameplay enabled while existing offers/matches drain; revoking qualification
  intentionally prevents that mode's pending offers from starting. Do not treat
  enabled=false as a graceful shutdown.
- Existing setup retries remain idempotent. Active matches continue when new
  admission or money qualification closes. Run Back creates a new offer and must
  pass current admission and obtain fresh non-caller consent.
- Capability v3 is session-mode aware. The client accepts an authorized fake-only
  response; the previous hook's v2/false-only check was caught by the browser
  proof and corrected. Account eligibility is unchanged: no owner/tester bypass
  or new account grants. Fake-only activation would admit all currently eligible
  active accounts in fake-money sessions, not just Jeremy.

## Current-main client integration

Combined the Game route, setup/Ante Up, catalog, continuation, financial shell,
retention and liveness paths with main `0d9469ecc24345175b3cb07052d16283a1c4f42c`.
Race Poker files and Box Drop's current presentation match main exactly after
line-ending normalization; shared paths contain both games. The Race Poker test
fixture helper is also retained. Battle 31 uses the shared frozen-version help
path, rejects unknown versions, and never requests Arcade/leaderboard admission. No other game's SQL or release flags changed.
`client-integration.json` lists exact and combined paths.
This is source integration in the isolated branch; main ancestry integration and
publication remain separate. No merge into main, rebase or cherry-pick occurred.

## Local evidence

- Package proof: 19 cases, including CRLF baseline installation and repeat,
  bare-CR/space/body/config/ACL drift rejection, atomic failures, scheduler
  collisions, closed defaults and exact Race Poker registration preservation.
- Shared financial proof: both-money winner, draw, abort, consent, nonmember and
  raw-state denial, wrong actions, injected after-chip failure, duplicate/late
  replay, terminal continuation; actual canonical chips, transfers and snapshots.
  New cases reject unqualified setup/bootstrap, retain accepted-offer start after
  new-admission closure, retain setup retry, and settle after gates close.
  Existing balances are checked before rollback; fixture users/profiles/players/
  snapshots/games/results/batches are absent afterward.
- Concurrency/human-bot regressions and both-money recovery contention passed.
  The 42-fixture contention test still skips locked heads, processes healthy
  tails, preserves independent Box Drop recovery and produces balanced results.
- 146 focused client tests, application typecheck and production build passed.
- Actual Game route passed with fake-only and real-only qualification separately:
  changed stake 9, fresh consent, hidden hands, lost-response retry/reload, mute,
  offline recovery, one 9-chip settlement, Run Back, terminal retirement and
  fresh-ended/anonymous routing. Both browser runs had zero page errors.
  These are local authenticated-role/loopback checks, not hosted JWT,
  PostgREST, Realtime, or physical iPhone acceptance.

Package SHA256: `b0c5610a3eef4b25ca2e0323ad4f694bff7ae11b8b6c5e40fd6396aafc659ff2`.
Source SHA256: `d6416ebbde5c023dab36bd94f22e2b2b91d8e15bf58d90fd32f1395ea7c8d068`.

## Prepared hosted qualification — not executed

`hosted-qualification.mjs` defaults to no connection. A separately authorized
`--run-installed` execution requires an explicit qualification connection. It
refuses an absent/wrong package or open admission gates, validates the installed
package through its rollback-contained repeat path, and requires a real pg_cron
extension, three successful recent Battle 31 job executions and fresh successful
canonical dispatcher health. It never imports the local database/bootstrap helper
and calls the shared financial proof without synthetic health.

Its eight preflight tests use test doubles and prove rejection behavior only.
They do not establish hosted scheduler health. The shared finance cases were
executed locally using explicitly local health fixtures. The hosted driver
contains no install, job scheduling, activation or commit path. Fixture and gate
changes occur only in a transaction that rolls back on success and failure.

Still required under separate release authorization: register/install the
migration with admission closed; run hosted rollback proof and independent
concurrency checks; verify actual zero-client dispatch, publication/RLS,
authenticated PostgREST and Realtime; integrate branch ancestry without replacing
other workstreams; publish; separately activate the approved money mode; perform
owner/physical-iPhone smoke. Preserve active Race Poker flags, jobs and sessions.
