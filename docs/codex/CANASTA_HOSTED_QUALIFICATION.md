# Canasta hosted qualification — 2026-10-21

## October 22 outcome: connected terminal presentation blocks release

Closed candidate `5188ba145a7b3f28267bfdf2da69805514ade316` is READY at
`dpl_F2CrJwrnmvj5HgyyqPEK2V3Bnv2q`. Public manifest publishedAt
`2026-10-22T16:39:32.078Z`, bundle `assets/index-CuTrEOiW.js`, matches exactly.
It includes Golf's released code unchanged. Remote main remains
`cb11f17d292ffbda8b067b2ee5bba5713a6ea8ce`; no final main push/CI/activation occurred.

Passed hosted evidence under `dev/canasta/evidence/`:

- `hosted-api-replay*.json`: real Auth/API, unauthenticated 401, two distinct
  waiting PostgreSQL backends, two held exact replays in 5,749ms, no repayment.
- `hosted-browser.json`: explicit fresh consent, private redaction, actual
  draw/discard and reconnect, 320x568 / 430x932 / 932x430 tap targets >=44px.
- `hosted-zero-client-restart.json`: unchanged worker source redeployed as v2;
  all clients closed before the actual 120-second deadline. Revision 5/turn 2
  advanced to revision 6/turn 3; chips stayed 100/100; actual heartbeat has no failure.
- `hosted-final-race*.json`: independent waiting backends; one HTTP 200 and one
  409; one result, balanced batch and two snapshots; exact replay preserved settlement.
- `hosted-run-back.json`: next match retained stake 5, required fresh consent,
  and was unchanged by the preceding match's exact receipt replay.
- `hosted-financial-terminal.json`: both matches finished, each with precisely
  one result, one balanced canonical batch and two snapshots. Combined chips 110/90.

**Failed release gate:** `hosted-terminal-race.json` has `passed:false`. The host's
canonical end-session request was accepted, two competing requests again produced
one acceptance/one conflict, and PostgreSQL reached `session_ended`/finished.
The connected 390x844 browser never showed exact canonical text `Session Ended`
within 30 seconds. Source confirms that is the correct canonical announcement.
The live tab closed on failure before diagnostic pixels/state were captured;
therefore no exact client failure owner or correction is claimed. Failure capture
is now included for the next authorized reproduction. Cold-ended reconnect was
not reached and remains unqualified. Do not reopen the ended fixture to reproduce.

Preserved fresh fake fixture: session `07f06622-4b34-40e6-98ae-f95792fc9046`;
matches `c2c92d95-ea94-41ea-bf86-c96e07998bc2` and
`9c16bffb-f635-47d6-84db-dfdd8f9bb9ec`. The first fixture naturally expired through
canonical setup inactivity while the deployment was building, ending its session;
its original history/settlement is untouched. Its departed actor's later action
returned 403 as the membership gate requires. The fresh fixture's before-consent
and browser checks were resumed after correcting that harness assumption.

Cleanup verified zero temporary qualification grants, Canasta execution true /
general admission false, Golf execution true / admission true. Both fixtures are
ended; no transaction, browser harness or deployment remains in flight. The
installed migration and worker engine bytes are unchanged. No real-money gameplay
occurred. Stop at this material terminal gate under the owner's release condition.

## October 22 resumed authorization and preflight

The owner superseded the former two-account/24-hour proposal: after all hosted
gates pass, open general play-money admission without allowlist or expiration;
real money stays denied. Golf's published `cb11f17d292ffbda8b067b2ee5bba5713a6ea8ce`
and both-money flags are preserved. The documentation-only merge retains both
release histories. No installed migration is reapplied.

Installed rollback proof `supabase/canasta/open-play-money.proof.sql` passes:
ordinary accounts without grants can discover/configure in a play-money session
with general admission enabled; real-money discovery is false and setup raises
`canasta:fake_money_only`. The transaction rolls back. No new mode switch is needed.
The host-parsed-body regression reproduced four failures before correction;
the Run21-compatible adapter now passes all five body tests. Ninety-one focused
tests, application/server typechecks, native Node entry proof and Vite build pass.
The installed SQL and recovery worker bundle hashes remain unchanged.
The following sections are chronological historical checkpoints, not activation.

Jeremy authorized conditional release and a 24-hour fake-money smoke window for
Hap (`d7dc1928-3727-4351-b0ff-0e80c81c2953`) and Happach Gmail
(`fb835d1f-db2f-4de4-84e2-ce0074512e46`). No general or real-money opening.
Golf briefly held the production-write window, then returned it without changes.
Canasta resumed qualification. This pass stops at the mandatory 100-tool-call
execution-budget checkpoint; the remaining independent transport proof is not met.

## Installed state

- Hosted migration `20261021235336_canasta_v1_scoped_qualification`, registered
  by the connector; the local migration records those exact installed bytes.
- Recovery Edge function `canasta-recovery`, version 1, deployed with its own
  database-issued single-use lease authentication. Platform JWT verification is
  disabled for that authenticated scheduler endpoint. No public grant writer.
- Execution enabled and the five-second cron active, with actual successful
  Edge heartbeats observed. General admission false. Zero qualification grants;
  no Canasta owner smoke session has been provisioned or activated. One temporary
  qualification session was created, completed and deliberately paused; its grants
  have been removed.
- No client publication, main integration, push, or app deployment occurred.
  Verified production app remains `52aa5528143fe031c4ddf8c3787eff85c0392aa9`.
- Golf migration `20261021230433`, 11 Up `20261021221415`, Golf's existing grants
  and all historical rows were preserved. No Cribbage owner was changed.

## Scope and implementation

Reconciled the isolated Canasta branch with that released main. Shared conflicts
were additive Canasta/Golf catalog, setup, Run Back and terminal retention entries;
both registrations remain. The guarded Ante Up insertion requires live baseline
hash `71a82570740f60593bdb09e504aa744c` and retains all prior branches.

`private.canasta_qualification` follows Golf's exact existing account/session/
expiry pattern. New setup requires every human's valid grant while the general
gate is closed; bots do not require account grants. Fake-money mode and active
profiles remain mandatory. Global discovery stays closed. Expired or removed
grants cannot admit a new match/Run Back, but accepted setup retries, subsequent
consent by the frozen roster, existing match authority and recovery remain live.

The production adapter can reuse the existing server-only Run21 project
credential pair when no Canasta override exists. A partial override fails closed,
as does any other project URL. No credential was copied, disclosed or changed.
The Vercel connector confirms those existing sensitive variables, but cannot
decrypt their values. No CLI is installed. Hosted API qualification must use an
authorized deployment path with the existing production environment; this has
not yet been exercised. Do not publish or activate merely from local evidence.

## Evidence

- App and server TypeScript, production Vite build and 135 focused tests passed
  (87 Canasta/Golf/catalog/setup/route, three server credential and 45 shared
  physical-card/seat/terminal/transport checks).
- Combined disposable local database proof passes with released Golf and 11 Up:
  336 existing functions compared, only additive Ante Up dispatch changed; prior
  defaults preserved. Canasta scope/consent/finance/control/RLS and Race/11 Up
  regressions pass. Local scheduler health remains explicitly fixture-only.
- Hosted candidate: fake-money and real-money financial rollback units plus
  injected failure passed. Real-money tests are rollback-only authority fixtures;
  they do not authorize real-money admission.
- Hosted installed: all five independent units passed: fake and real finance,
  injected failure, admission, and scoped qualification. Actual scheduler health
  is required at entry. Every unit rolls back and compares unscoped historical
  rows in the same repeatable-read snapshot.
- Financial checks include signed totals, qualifying tie continuation, +S/-S
  actual chips, balanced ledger, atomic results/snapshots, replay/changed payload,
  post-continuation replay, deadline rejection, pause/resume and real three-second
  terminal holds. Injected snapshot failure restores all financial/authority state.
- Initial hosted rehearsal exceeded 15 seconds while redundantly hashing history.
  The harness adopted Golf's post-rehearsal capture / post-rollback comparison,
  removing one full scan without weakening checks or changing health/presentation
  guards. Subsequent distinct units passed; the failed attempt is not counted.

Machine-readable results: `supabase/canasta/release/hosted-evidence.json`.
Builder: `supabase/canasta/release/hosted-proof.mjs`; generated payloads stay in
ignored `qualification.local/canasta/hosted/`. No fabricated heartbeat is used.

## Authenticated live fixture

Both approved accounts authenticated using existing local test credentials,
subscribed to Realtime, configured stake 5, and gave fresh human consent. The
scheduled worker dealt the initial hand; both clients received revisions 0 and 1
with only `dealer_game_id`, `game_id`, `revision`. Authenticated client access to
the service-only state RPC was rejected. See `dev/canasta/evidence/hosted-transport.json`.

Session `3ec92708-bf27-4433-9140-beb0db4fec6b`, dealer-game
`2b918113-88ed-41c0-9597-1e76cbd53b23`, is a qualification fixture, not owner smoke.
A legal near-final state was constructed with 234 shared-reducer actions and
108-card conservation. Two connector commit attempts produced one acceptance and
one conflict, but the live lock observation returned no overlapping connections.
**This does not establish independent concurrency.** Do not repeat until lucky or
count the earlier local race as hosted transport evidence.

With clients closed, actual scheduled recovery completed terminal continuation.
Final evidence: one result, one balanced batch, two snapshots, chips 105/95,
`finished=true`. The canonical pause RPC paused this session after continuation;
its two temporary one-hour grants were removed. General admission remains false,
zero Canasta grants remain. Retain this isolated fixture for traceability; no
historical session or other game balance was modified.

## Remaining before release

Recheck the latest code and installed dispatcher baseline before any further
shared write. Complete deployed authenticated API, independent connection races,
zero-client gameplay/restart and
canonical terminal/Run Back/browser qualification; prior local evidence does not
replace these. Verify the exact READY deployment/public manifest and phone-sized
rendering, then provision and record only the approved account/session 24-hour
smoke scope. Physical iPhone acceptance remains Jeremy's smoke. Do not expire
execution or recovery for already admitted games when new-admission grants expire.

The smallest unresolved engineering choice is the independent transport harness.
Canasta's commit RPC is intentionally service-only, while Golf's action RPC is
authenticated. Therefore Golf's two authenticated PostgREST action connections
cannot be copied directly. The existing Vercel server credential is configured
but non-exportable through the connector; no new credential is assumed necessary.
Use a supported closed deployment/API qualification path or a carefully scoped
temporary fixture bridge, with explicit containment and removal, rather than
broadening production commit grants. No main push or app publication is justified
by the incomplete concurrency proof.
# Closed deployment transport follow-up — October 21

## Owner hold at 2026-10-21 19:14 America/Chicago

Jeremy prioritized Golf smoke corrections and held every other release. No further
Canasta release action is authorized until resumed. At this safe boundary:

- Public manifest: `7c43a27b854b754ef5fb0a5dd28a5f5a090a13da`, published
  `2026-10-22T00:09:01.292Z`, bundle `assets/index-Duq1AZuT.js`.
- READY production: `dpl_8SHB6u8CmcMscgemm3zuTuPaeCzx`.
- Native ESM correction: branch-pushed commit
  `823262a3b9f9bf7d4d6c82b7a2d5a6b6b5041342`; application and server typechecks,
  75 focused tests, native emitted-entry proof and local build pass.
- Its production deployment `dpl_rLg9Ar8UxZEho583nnKmHyF1TsPS` was BUILDING and
  successfully CANCELED. Automatic preview `dpl_2dP3QEBU3QNM22DrM9LFZv539qZ7`
  was already READY. Neither deployment has work remaining in flight.
- At `2026-10-22T00:14:25.655196Z`, temporary grants were removed and canonical
  pause completed on session `3ec92708-bf27-4433-9140-beb0db4fec6b`:
  `game_selection`, paused, pause version 3. Zero grants verified afterward.
- Original match `2b918113-88ed-41c0-9597-1e76cbd53b23` remains settled and
  finished. No new match was configured; browser/final-race preparation was not run.
- Canasta execution true / admission false; Golf execution true / admission true.
  Installed migration and worker bytes are unchanged. Worker has no recorded
  failure; completed heartbeat observed at `2026-10-22T00:14:29.090246Z`.
- No main integration/push, owner-smoke activation, transaction or pending local
  validation process remains. The 24-hour smoke period has never started.

Resume gaps: successful deployed API startup; held two-connection HTTP replay and
final-action race; actual browser/terminal/fresh Run Back; restart and zero-client
gameplay; final controlled release. `hosted-api-replay.json` records the failed
500 attempt honestly. `hosted-browser.mjs` and the fresh-final fixture option are
prepared, syntax-checked/unexecuted scaffolding, not passing evidence. Source
inspection additionally identifies host-preparsed `req.body` handling as a needed
transport check against Run21's existing pattern; no correction or live proof is
claimed for that boundary. Keep the original final fixture/receipt intact.

The continuation narrative below predates this hold.

The approved closed production deployment of `7c43a27b854b754ef5fb0a5dd28a5f5a090a13da`
became READY as `dpl_8SHB6u8CmcMscgemm3zuTuPaeCzx`; the public build manifest matched.
Its first authenticated Canasta API request returned 500 before authentication:
the runtime reported `ERR_MODULE_NOT_FOUND` for the extensionless production import.
Explicit `.js` imports now match the established Run21 native ESM convention through
the eleven-module runtime chain. `dev/canasta/node-entry-proof.mjs` transpiles without
bundling and imports the actual entry in Node, verifying the fail-closed 503 path.
Seventy-five focused tests and the local Vite build pass. SQL and bundled recovery
worker hashes are unchanged; no migration or RPC permission change is needed.
This correction is pending closed redeployment and successful live transport gates.
Temporary one-hour grants are restricted to the original two-account fixture;
the owner smoke window has not started. Golf's two live release flags remain true.

