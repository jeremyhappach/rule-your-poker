# September 8 recovery cost measurement

Status: production migration `20260908152010` applied; idle execution reduced
22.6%. Browser qualification and Jeremy's production smoke remain incomplete.
Scope: the Cribbage branch of `private.game_recovery_task_is_due` only.
Project: `xvhmbuppghwmwpwrkzao`, unchanged Small compute. Frontend baseline:
`838ac54ad2d448a2c0f77876b1a41a93fe3ee2f1`.

## Exact waste and correction

The deployed admission query inspects private JSON before filtering historical
rounds down to the game's current dealer-game and hand. Read-only EXPLAIN
shows 328 Cribbage states examined, 291 round/game probes, 1,944 shared-buffer
hits, and 15.676 ms execution (5.325 ms planning). None is due.

The correction materializes only current round identities using existing
indexes before inspecting private state, then selects the single phase branch
with CASE. Its measured query uses 74 current round probes, 593 shared-buffer
hits, and 2.448 ms execution (5.695 ms planning). No new index, registry, owner,
timer, cache, or dependency is introduced. A repeated comparison and the
whole-scheduler before/after measurement remain the acceptance evidence;
these individual EXPLAIN samples are not a capacity proof.

Preserved: exact game/dealer-game/hand identity; paused-game exclusion;
registered fallback timers and dealer selection; bot discard/pegging;
counting/terminal/continuation admission; all seven other task branches;
the one-second cron cadence, rotating full safety task, advisory lock,
failure isolation, health heartbeat and real-money guard. No action or
settlement implementation, participant identity, balance or history changes.

## Baseline on unchanged Small

Five-minute-plus idle observation: 14:32:20.023526–14:37:35.278670 UTC,
315.255 seconds. Dispatcher: 310 calls, 16,502.461 ms total execution,
53.234 ms per call, 1,613,679 shared-buffer hits, 334,244 WAL bytes.
Database sessions increased by 319 (includes our read-only probes and
other services; not exclusively cron). All eight due checks were false
during profiling. No production statistics were reset or evicted in the
window; statistics reset remains August 2.

Counters use the full dbid/userid/queryid/toplevel identity. The dispatcher
key is dbid 5, userid 16388, queryid -3152103405064032454, toplevel true.
`pg_stat_statements.track=top` and planning tracking is off: cumulative
dispatcher execution includes nested work, but cannot attribute every nested
query or separate its planning time. Read-only EXPLAIN isolates the query.

This first correction cannot establish the plan's 80% whole-scheduler target:
other admission queries, rotating safety work, and per-connection planning
remain. Do not report the roughly 84% reduction in this one query as an 84%
reduction in the server, app bill, or whole scheduler.

## Deployed idle comparison

After window: 15:20:28.798853–15:25:43.567991 UTC, 314.769 seconds,
same Small compute and frontend, no benchmark browsers open. Both windows
contain exactly 310 dispatcher calls; statistics reset and eviction counters
are unchanged within each window. Of the captured dispatcher, Cribbage,
presence and retired chat counters, only dispatcher calls moved after deployment.

| Dispatcher measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Execution per call | 53.234 ms | 41.205 ms | -22.6% |
| Total execution, 310 calls | 16,502.461 ms | 12,773.462 ms | -22.6% |
| Shared-buffer hits | 1,613,679 | 1,191,398 | -26.2% |
| WAL bytes | 334,244 | 334,726 | +0.1% |
| Database sessions (whole DB) | 319 | 322 | approximately unchanged |

This is reduced database execution and buffer work, not a direct CPU or RAM
measurement. The 80% whole-scheduler target is **not met**. Other admission
queries, rotating full recovery, per-connection planning/startup and required
heartbeat writes remain. Further reduction must target measured remaining
work; this result does not justify disabling safety or claiming Nano capacity.

## Verification

- 12 focused source tests pass, including unchanged other admission branches.
- All five SQL proofs pass with the candidate loaded transaction-locally,
  then rolled back: Cribbage admission, shared scheduler, canonical timer
  settlement/replay, recovery isolation, and seven-game pause/resume.
- All five proofs pass again after deployment against the actual deployed
  function (without reloading the candidate in the proof). Recovery health is
  healthy, admission allowed, no active failure tasks, zero consecutive
  partial failures. Local migration version matches remote migration history.
- The new admission proof covers 21 phase/actor/pause/identity cases,
  registered fallback versus missing-registry discovery, repeat reads,
  retired dealer identity, other-owner parity and private permissions.
- Fixture corrections preserve immutable participant identities and isolate
  the automatically registered fallback timer before testing legacy discovery.
  No synthetic SQL rows or candidate DDL from the proofs were committed.
- Full build passes: application TypeScript, 1,472 application tests, 47
  harness tests and production bundle. The narrower tsgo binary is absent;
  the repository's installed TypeScript build gate was used, with no install.
- The added benchmark-readiness unit test brings the harness suite to 48
  passing tests. An extra standalone harness typecheck exposed a misnamed
  callback, corrected to `onCribbageProgress`; remaining errors are in
  unchanged navigation narrowing and PostgREST `abortSignal` call sites.
  Those broader harness typing issues are not part of this SQL correction.

## Browser baseline qualification

The initial default chaos run completed five hands and settlement, but did
not qualify: 48 actor receipts and 47 peer receipts, with one missing peer
baseline at a hand boundary. The peer entered that new round 242 ms after
the discard click. This is not a clean sample, and the failure is retained
under the external `recovery-cost-pre` artifact namespace. Its run also
overlapped the tail of the local build, so it is not an isolated latency
comparison. There were no visual violations; observed maxima were 864 ms
for RPC, 1,420 ms for actor progress and 3,803 ms for attributed peer progress.

The opt-in ordinary-cost mode (`PTOWN_E2E_COST_BASELINE=1`) requires captured
matching game/dealer-game/round frames from both clients before discarding.
Readiness itself is bounded to six seconds. It does not change the default
chaos scenario, fabricate progress, or relax post-click attribution or timing.
The first run in `recovery-cost-pre-synchronized` loaded before the callback
name correction and must remain separate from the strictly matched set.
That attempt failed two missing-peer-baseline checks and stopped before its
remaining repeats. No failed run is erased or reclassified as passed.

The corrected `recovery-cost-pre-ready` set ran three complete games:
two passed (six and five hands); the third completed five hands and settlement
but is retained as failed qualification. All three cleanups are verified.
The two qualified runs contain 112 measured actions, 108 ordinary actions:
ordinary observed peer progress p50 991 ms, p95 2,102 ms, maximum 2,765 ms.
Their actor-progress p95 is 506 ms, maximum 1,062 ms. These generic DOM
progress observations can include optimistic rendering; they are not exact
mutation-commit timings.

The third run's `peer-1788880587682-19` (6-diamonds play) is `peer-incomplete`.
The next same-client click arrived 951 ms later, ending the legacy observer's
attribution window. The host then displayed that exact card at +1,251 ms,
with the same game/dealer-game/round identity and its opponent back count
falling from three to two. The actual pegging RPC took 810 ms; the generic
receipt instead attached a nearby `read_session_frame` request. Do not treat
its generic RPC summary as action-command latency, widen the detector's
window, or let the later action turn this failure green. The strict three-run
qualification is incomplete; the two passed runs provide the bounded
108-ordinary-action comparator. No rerun is used to chase three green tests.

The identical post-change invocation (`recovery-cost-post-ready`, no retries,
stop after one failure) completed one five-hand game, settlement and verified
cleanup. It recorded 53 actions, 53 actor-progress observations and 52 peer
observations, with no observed six-second breach or visual violation, but
failed qualification on `peer-1788881225087-4` (5-diamonds play). The next
same-client click closed its attribution window at +905 ms; the host showed
that card at +997 ms with matching full identity and opponent backs falling
from three to two. Its actual pegging request finished in 537 ms.
The two remaining repeats did not run. This failure is retained unchanged.

Consequently, **matched repeated browser qualification is not complete**;
do not report a fully green browser suite, established latency non-regression,
or lower-tier readiness. This is the same demonstrated attribution-window
limitation seen before deployment, not evidence of a newly introduced stall.
Exact endpoint timings from all recorded runs (not nearest-RPC click guesses)
are descriptive only: before/after pegging p95 866/809 ms (124/40 requests),
discard p95 858/550 ms (32/10), configuration max 561/400 ms (3/1).
They are unequal samples and cannot replace the missing matched browser gate.

Further browser work needs a bounded Cribbage-specific committed-action
attribution correction using authoritative identity/sequence, preserving
negative controls against later actions masking stuck earlier ones. It is
deferred rather than silently expanding this SQL optimization into product
instrumentation. Raw artifacts remain outside the repository under
`C:/Users/jerem/Desktop/poker/recovery-cost-2026-09-08/`; all six synthetic
browser sessions from exploratory and comparison runs were removed with
verified cleanup. Historical sessions and balances were not modified.

## Egress evidence

The dashboard's selected previous billing cycle shows 8.11 GB organization
egress: poker 8.036 GB, recipes 0.074 GB. Poker also shows 491,773 Realtime
messages, peak nine connections, 9,130 Edge Function calls and eight monthly
active users. These totals include development/testing and the now-retired
request amplifier; they are not a forecast for normal two-human play.
The newly started Pro period is not yet representative. CPU optimization
alone does not resolve the prior egress warning or prove Free eligibility.

Jeremy's September 8 usage estimate is 5–7 hours of play per week (roughly
22–30 hours per month), and he usually leaves the app open between sessions.
The next client-cost measurement must therefore include sustained open-but-idle
lobby and ended-table states, not just active games or a closed browser.
Do not assume a background tab's timer throttling or disable the live-session
presence lease; measure actual requests and lifecycle ownership first.

The retained initial five-hand trace contains 1,426 HTTP requests to poker's
Supabase origin, 2,450,095 browser-recorded transfer bytes and 5,555,060 decoded
content bytes. `read_session_frame` contributes 1,101,699 transfer bytes across
260 requests; `cribbage_get_state` contributes 375,905 across 234. Auth user
lookups add 173 requests. These browser counters include setup, deliberate
network recovery, remount and cleanup, omit unrecorded/WebSocket traffic, and
are not Supabase's billed-egress meter. They identify measurement targets,
not a monthly forecast or proof that every repeated request is avoidable.

## Remaining cost gates

Follow `PERFORMANCE_COST_REDUCTION_PLAN.md`. Repeated matched browser proof,
representative client/egress measurements, sustained resource evidence and
an explicitly approved lower-tier trial are still required. No subscription,
project transfer, recipes configuration, database size or billing change has
been made in this phase. The monthly bill has not yet been reduced.
