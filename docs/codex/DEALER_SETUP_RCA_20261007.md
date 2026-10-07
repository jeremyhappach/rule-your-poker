# Real-money dealer setup rejection — October 7, 2026 RCA

The RCA below records the read-only findings. Jeremy approved the two-part
correction on October 7; implementation and validation are recorded at the end.
The waiting-room watchdog theory is rejected and `useWaitingRoomActions.ts`
is unchanged.

Session: `58974b5a-20a9-48fb-9da6-463cac2c53d2` (Oct 6 - Weather Report Suite).
Production: Supabase `xvhmbuppghwmwpwrkzao`; Vercel `ptown-poker`, deployment
`dpl_6GGEE8QK1WxmM2nyJd5VnAP5HWKX`, READY on
`4a06f203fb14a320fbd1d132dabee4aec87a591d`. The production alias was checked
again during this RCA.

## Finding

The dealer submitted configuration, but PostgreSQL rejected the transaction at
the real-money admission trigger. An obsolete waiting-phase
`session_abandonment` recovery failure still counted as an active session
failure after Start Game had successfully advanced out of waiting.

The server's precise rejection was
`real_money_liveness_unavailable:session_recovery_failure`, SQLSTATE `55000`.
The client then concealed that reason behind `Could not configure the game`
because its message helper mishandles Supabase's plain-object error shape.

## Incident evidence

All times below are October 7 UTC (October 6 evening in Central time).

| Time | Evidence |
|---|---|
| 01:07:55.633–55.777 | Persistent Start Game events report successful `started` / `dealer_selection`. |
| 01:07:59.74–59.81 | Both clients record `game_selection`. |
| 01:08:12.108 | Dealer user's GET for the exact Cribbage selection defaults succeeds, HTTP 200. |
| 01:08:12.808 | First authenticated POST to `configure_dealer_game`, HTTP 500. |
| 01:08:12.880 | PostgreSQL logs the exact session ID and real-money admission rejection. |
| 01:08:14.243 / 16.226 / 20.460 | Three additional authenticated configuration POSTs, all HTTP 500 / SQLSTATE 55000. |

The authenticated caller was user `fb835d1f-db2f-4de4-84e2-ce0074512e46`,
player `799594b6-9723-4909-b8b2-a8c7e093e72e`, the seat-6 dealer. The other
human was seat 3. OPTIONS requests also returned HTTP 200; those are CORS
preflights, not successful configuration submissions.

Each PostgreSQL error names this exact session and reports:

- `reason = session_recovery_failure`, `admission_allowed = false`;
- session failure task `session_abandonment`;
- unit `1:58974b5a-20a9-48fb-9da6-463cac2c53d2`;
- underlying recovery SQLSTATE `55P03` (lock unavailable);
- retry-after `2026-10-07T01:07:56.984878Z`;
- a fresh, completed scheduler pass and zero consecutive partial failures;
- no global failure tasks and no overdue authoritative timers.

The error stack places rejection in
`private.enforce_real_money_liveness_admission()` at its RAISE, invoked by
the final `UPDATE public.games` inside `public.configure_dealer_game`.
Thus configuration passed the RPC's phase, deadline, dealer identity,
authorization and selected-game validation before the trigger rejected it.
The transaction did not commit. There are zero dealer-game rows for the session;
the final game row remained unconfigured and eventually became session-ended.

## Answers to the seven questions

1. **Cribbage selection:** strongly established by the dealer's exact
   `game_defaults?...&game_type=eq.cribbage` request at 01:08:12.108. The selected
   fields match `DealerGameSetup.handleGameSelect` at lines 901–911. This is
   source/request evidence, not a retained screenshot or click event. The
   configuration POST body itself was not retained in these logs.
2. **Submit fired:** yes; four authenticated configuration POSTs reached the
   backend from that dealer. The single production client RPC wrapper is
   `configureDealerGame`, called by `DealerGameSetup.commitSetup`.
3. **RPC called:** yes. Its absence from `debug_events` did not establish its
   absence from the request stream. This path had no equivalent persistent
   Start Game stage trace.
4. **Local guard prevented dispatch:** no. The observed requests rule that
   out for these attempts. Cribbage's selection allows up to four players;
   this session had two. The setup component has no local real-money prop
   controlling Cribbage selection.
5. **Exact returned failure:** HTTP 500 / SQLSTATE 55000 with
   `real_money_liveness_unavailable:session_recovery_failure`; error DETAIL
   contains the session-scoped health object described above. The raw HTTP
   response body is not retained, but the PostgreSQL error and gateway code
   agree on this rejection.
6. **Corresponding UI string:** `Could not configure the game`, from
   `dealerSetupFailureMessage` at `DealerGameSetup.tsx:159–164`, called by
   the simple-game submit catch at lines 1058–1061. This source mapping is
   reproduced locally with the installed Supabase client.
7. **Authority/stale state/real-money condition:** the failing condition was
   the server's real-money liveness check over an obsolete waiting-phase
   recovery record. It was not a dealer-authority mismatch or client-side
   Cribbage rule rejection.

## Exact ownership defect

The deployed definitions were inspected directly and captured with the evidence.

1. `private.reconcile_session_abandonment` applies only to `waiting` or
   `waiting_for_players` with no `current_game_uuid`. It locks the game row.
2. The scheduled `private.reconcile_abandoned_sessions` locks due watch rows,
   invokes that owner, records per-session failures, and clears the failure
   only after a successful invocation for a selected watch.
3. `private.on_game_abandonment_boundary` deletes the watch when the game
   leaves waiting. It does not clear the corresponding recovery failure.
4. `private.evaluate_real_money_liveness` selects failures by session,
   dealer-game and round identity. It does not check whether the abandonment
   task's waiting-phase precondition still applies. At initial game selection,
   both the saved failure and game still have a null dealer-game ID, so the
   old failure qualifies.
5. The now-removed watch cannot be selected by the scheduled abandonment
   owner to clear the old failure. The expired retry-after is only a backoff
   timestamp; it does not retire the failure or make health admission pass.

This explains a healthy dispatcher alongside a blocked first real-money setup.
The original competing lock holder is not retained and is not asserted. The
failure row is absent now and the ended session reports healthy; that later
state does not override the four incident-time error DETAIL objects.

## Error-message defect and proof

`configureDealerGame` throws `response.error` unchanged. The installed
PostgREST client parses an unsuccessful HTTP body to a plain object by default.
`dealerSetupFailureMessage` instead reads `error.message` only for
`error instanceof Error`; otherwise it uses `String(error)`. That produces
`[object Object]` and misses the existing real-money-liveness branch.

Read-only local command:

```text
node artifacts/dealer-setup-rca-20261007/verify-error-message.mjs
```

Pre-correction result: PASS. Uses the actual source helper and installed Supabase client,
with every HTTP request mocked. The actual response shape displays the generic
message; an Error instance with the same message selects the intended
real-money recovery explanation. No live RPC or database mutation occurs.

Other reviewed setup messages include invalid ante, unsupported game, player
count limits, card-game settings validation/loading, Run21 access, missing
Run Back settings, bot setup failure, dealer timeout failure and Farkle
defaults failure. The separate route's `Start Game failed` and
`Unable to start the session: ...` strings belong to the already-successful
waiting-to-dealer-selection RPC. `Game.handleConfigComplete` consumes only a
successful committed result; this incident did not reach that callback.

## Approved correction

1. Add a narrowly scoped migration to `private.evaluate_real_money_liveness`:
   count `session_abandonment` failures only when their authoritative waiting
   precondition remains applicable (`waiting` / `waiting_for_players` and no
   live dealer-game pointer). Preserve the existing failure record as evidence.
   Do not use its expired retry-after as proof of health.
2. Read a string `message` from structured Supabase errors in
   `dealerSetupFailureMessage`, while retaining the existing generic fallback
   and real-money recovery message.

Preserve all genuine current-task failures, global recovery failures, scheduler
freshness checks, overdue timer checks, paused-game behavior, exact setup
identity/deadline/auth checks, rollback semantics, game rules, settlement,
balances, and the existing waiting-room watchdog. No blanket SQLSTATE bypass,
retry loop, polling, or historical session repair.

Before release: rollback-only SQL proof of obsolete abandonment failure versus
eligible waiting failure, healthy and unhealthy scheduler controls, other
current-task failures, overdue timers, fake-money behavior, authorized setup,
dedupe/replay and transaction atomicity; focused structured-error regression;
existing dealer setup/real-money tests; app typecheck and production build.
Apply only the approved migration after proof, then verify publication on the
exact commit. Jeremy's fresh-session smoke remains runtime acceptance.

No additional production instrumentation is required to identify this branch:
the retained HTTP and PostgreSQL logs already demonstrate it. Vercel's error
scan for the requested minute was empty; these direct browser-to-Supabase
errors are outside Vercel's function logs.

Evidence: `artifacts/dealer-setup-rca-20261007/evidence.json`, limited to relevant
request metadata, database errors, session identity and deployed definitions.
Authorization headers, tokens and network-location details are excluded.

## Implementation and validation — October 7

Migration `20261007150935_scope_waiting_abandonment_failure_admission.sql`
changes only the health evaluator's applicability predicate for
`session_abandonment`. It checks the exact deployed definition before changing
it and is idempotent. It neither deletes old failures nor changes recovery
execution, game rules, setup RPCs, finance, privileges or historical sessions.
The Supabase CLI was unavailable; the authenticated migration tool assigned
the recorded version, which is mirrored exactly in the repository.

The client change reads a string `message` from structured errors. Five new
tests use the real Cribbage selection/submit controls to cover Supabase objects,
Error instances, unrelated errors, malformed messages and null rejection.
The original diagnostic script now verifies the corrected production behavior.

Candidate SQL proof first reproduced the old admission failure, then patched
the function inside BEGIN/ROLLBACK. It passed together with
`dealer_game_setup_handoff_rollback_proof.sql`; the original function hash
`31f01bf997a3396b3d2efe386add11e3` was restored after rollback. A fixture using
legacy `waiting_for_players` initially failed the deployed status constraint;
the proof uses supported `waiting` without altering that constraint.

After applying the migration, both SQL proofs passed again. Installed function
hash: `b332b750f1ae7b9cd65c31403f334277`. New fixture rows remaining: zero.
The new proof is self-contained and rolls back. To include the existing
seven-game setup proof, insert its body before the new proof's final ROLLBACK;
use a distinct `Rollback waiting-failure handoff -` name prefix for cleanup
verification. Existing historical proof rows are not cleanup targets.

App typecheck and production Vite build passed. The complete app suite passed
2,018 of 2,020 tests. The two failures are unchanged baseline source-contract
assertions in `gameTimerAuthority.test.ts` and
`systemSettingsRollbackProofIsolation.test.ts`; inspected inputs match HEAD.
All 241 harness tests pass. Vercel's existing build command is
`npm run typecheck && vite build`; no build gate was altered.

Runtime acceptance: refresh both clients onto the new production build, create
a fresh two-human real-money session, select Cribbage as the elected dealer,
submit once, and verify configured state/ante flow with no generic setup error.
Do not reuse or repair the historical incident session. No production smoke
pass is claimed before Jeremy performs that check.
