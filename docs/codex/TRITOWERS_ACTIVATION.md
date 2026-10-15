# TriTowers production activation — October 14, 2026

Migration `20261015003637_activate_tri_towers_test_play` applied successfully
to `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`). The CLI created the migration;
its filename was reconciled with the migration service's recorded version.
The inactive client base was `92d04c1e6fb6f1f69b99cc4120cec480b59c2266`.

## Installed scope and safety

- Four private tables, one RLS-protected public revision table, 20 game-owned
  functions, a private publish trigger and a TriTowers-only pause trigger.
- One new catalog row: key `tri-towers`, label mapped by the client to
  `TriTowers`, presentation `fullscreen`, default stake 5, fake money.
  The catalog has no display-name column.
- One publication member and one five-second pg_cron job, with a three-second
  statement limit. All three existing jobs remain unchanged.
- No replacement of existing functions, triggers, RLS policies or grants.
  Transaction assertions check existing function definitions, all nine catalog
  rows and absence of writes to existing application tables except the new
  catalog row. No historical/session/financial records were changed.
- Shared foreign-key and trigger locks are acquired at the end using NOWAIT,
  followed only by bounded DDL and commit. No table rebuild or scan of existing
  session data. A conflicting local writer caused an immediate error and full
  rollback; no catalog row or partial objects survived. Latest complete
  uncontended local migration: 27 ms; contended attempt: 31 ms.

## Qualification evidence

Isolated PostgreSQL 17.10 used deployed PostgreSQL 17.6 metadata: 94 table
definitions, 95 shared trigger/dependency functions, 88 exact shared triggers,
unique indexes, 16 gameplay foreign keys and deployed player RLS. Local Auth
claims substitute test accounts; the auth.users host FK is not part of the
isolated fixture. No production financial simulation was run.

Engine and adapter rollback proofs passed. Complete two-human competitions,
seven-player admission, all nine previous-game handoffs, redaction and spectator
authorization, revoked-account denial, duplicate/replay/stale/concurrent actions,
pause/resume, independent stage decks, immutable scores, winner/ties/all-tie,
one balanced settlement, snapshots/history, make-it-take-it, continuation and
zero-client timeout/terminal races passed with shared triggers and player RLS.
Two real browser contexts passed live spectator updates, reconnect, sequential
turns and settlement using the local SQL authority.

97 focused client tests passed across selection, Run Back, capabilities,
presentation routing, existing setup and real-money admission. TypeScript and
Vite build passed. Existing build warnings concern bundle size, mixed imports
and Browserslist age.

The local Windows PostgreSQL package has no pg_cron extension or Supabase
Realtime service. The migration proof omits only the platform-specific cron
call; the actual production extension, scheduler signature and second-based
cadence were inspected before application. Production verification shows
successful five-second runs (about 8 ms), unchanged existing jobs, publication
membership and a successful Realtime `SUBSCRIBED` acknowledgement.
The real revision RLS was tested locally with deployed player policies.
Actual authenticated multiplayer event delivery is the owner's acceptance test;
no synthetic production sessions, settlements or wallet transactions were made.

Production PostgREST returns all ten catalog rows. Anonymous capability calls
fail with 42501; an approved account's capability is true. All raw tables and
private helpers reject browser access; only six validated public RPCs are
executable by authenticated users. The security advisor's TriTowers findings
are intentional: private tables have deny-all RLS and public entry RPCs are
SECURITY DEFINER with explicit internal authorization. See the advisor
[RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
No existing advisory was changed as part of this release.

Evidence is kept under ignored `qualification.local/tri-towers/`, including
`activation-proof.json`, `local-integration-results.json`,
`production-verification.json` and `production-api.json`.
Repeatable loopback scripts are under `dev/tri-towers/`.
The local environment points at a legacy Supabase project; production checks
explicitly bind the verified production project and never reuse that setting.

## Access and owner acceptance

1. Open https://holm357.com/ and refresh to the activation release.
2. Sign in with an active approved account. Create a new session with
   **Real Money turned off**. Have 2–7 approved human accounts join and sit.
3. Start the session normally. The dealer chooses **Other → TriTowers**,
   sets the match stake and confirms setup.
4. The active player selects **Start my turn**. Other players watch the same
   visible board. Test removes/draws, subsequent stages, next player, reconnect,
   final settlement, continuation and ending the session.
5. Check Run21 and an ordinary table game in their usual layouts.

Invited testers use the platform's existing account approval and session access.
There is no new allowlist UI or separate preview environment. Eligibility is
the same active-profile rule as Run21, but TriTowers has an independent gate.
Real-money TriTowers is rejected by the database. Fake-money chip settlement
still exercises the canonical transfer ledger without touching user wallets.

Scoring/time/wrapping assumptions remain `ptown-tritowers/1`, documented in
`TRITOWERS_RULES.md`; this release does not claim exact original-ROM scoring.

## Recovery

If installation fails, its transaction rolls back entirely, including the cron
job and catalog row. Do not retry indefinitely on NOWAIT contention.
After installation, do not drop tables or delete match/history records.
For a confirmed TriTowers incident, the private singleton release gate can be
set false to close admission and player RPCs; existing games remain unaffected.
This also prevents players finishing an active TriTowers match, so prefer
draining those matches before disabling the gate. The dedicated worker can be
deactivated separately if its behavior is implicated. Preserve records and
ship a forward correction; do not reverse financial entries or rewrite history.
