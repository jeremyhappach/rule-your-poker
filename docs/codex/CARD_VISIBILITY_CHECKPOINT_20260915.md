# Missing-card diagnostics checkpoint — September 15, 2026

Follow-up: Jeremy approved a +20 ms added-p95 budget and the bounded final
qualification. See [the subsequent release record](CARD_VISIBILITY_RELEASE_20260915.md).
The original held checkpoint and its measurements below remain preserved.

Status: **deployment held; local implementation is not release-qualified**.
Jeremy approved automatic Holm/3-5-7 diagnostics with a tight responsiveness
guardrail. The bounded phase stopped after the final actual-table Holm
comparison failed that guardrail. Do not merge or deploy this checkpoint as-is.
The original reported Hand 2 disappearance remains unresolved.

## Scope and retained implementation

Branch: `codex/card-visibility-incidents`. Baseline:
`1bf23a265c812e89a4c8fa63eca9f63089e8bb3b`.

- `CardVisibilityMonitor` is mounted for Holm and 3-5-7 inside the existing
  runtime provider and observes the persistent canonical shell. Holm's
  community row is portalled outside the MobileGameTable child subtree.
- Shared observation checks admitted self cards and Holm community cards for
  missing children, hidden ancestors, fully clipped/zero-area geometry and
  runtime hand-identity mismatch. Intentional deal/ownership/terminal
  exclusions remain game-specific. This does not monitor every tabled
  opponent/winner-card surface.
- Checks coalesce at most four times per second and require two observations
  before reporting. There is no recurring idle scan, new gameplay RPC,
  subscription, authoritative state write or visible debug UI.
- The first-loss capsule contains scalar identities, counts, visibility
  reasons, admission state and bounded fetch breadcrumbs, without card faces
  or credentials. A local queue retains up to eight incidents for 24 hours;
  UUID upserts support idempotent retries, capped at five attempts with a
  30-second cooldown and two sends per flush. Delivery is separate from
  gameplay. Browser storage failures or process termination can still prevent
  capture; this is bounded diagnostic retention, not guaranteed delivery.

No schema migration, replay change, money logic or other-game capture is
included. No real-money session was changed by validation.

## Final evidence

The production-built candidate and an archived build of the baseline used the
same paused fake-money session and viewer. Tests alternated enabled/baseline
blocks on actual Chat/Cards HUD controls. Each arm retained 48 observations,
excluding two warm-up clicks per block. The metric is click to two animation
frames, a local responsiveness proxy; it is not an authoritative RPC latency
measurement or a physical-phone measurement.

| Actual table | Baseline p50 | Candidate p50 | Baseline p95 | Candidate p95 | Added p95 | Gate |
|---|---:|---:|---:|---:|---:|---|
| Holm | 55.3 ms | 61.1 ms | 80.5 ms | 95.6 ms | +15.1 ms (+18.8%) | FAIL: maximum +5 ms |
| 3-5-7 | 43.0 ms | 45.3 ms | 61.0 ms | 59.6 ms | -1.4 ms (-2.3%) | PASS |

The preceding Holm run also failed: baseline p95 64.1 ms, candidate 73.8 ms,
added 9.7 ms. Scope-limited style observation, geometry caching and memoized
monitor props did not establish an acceptable actual-table result. Do not
waive the gate or repeatedly rerun until a passing sample appears. These
comparisons do not yet isolate the causal cost from render/scheduling noise.

The final isolated-browser suite passed all eight tests across Chrome mobile
emulation and WebKit iPhone emulation:

| Fixture metric | Chrome | WebKit | Gate |
|---|---:|---:|---|
| Scanner p95 | 0.5 ms | 1.0 ms | <=2 ms |
| Maximum scanner duration | 1.1 ms | 1.0 ms | <10 ms |
| Added frame p95 | 0.0 ms | +4.0 ms | <=4 ms |
| Added input-handler p95 | +0.2 ms | 0.0 ms | <=2 ms |

Scanner timing covers geometry binding and sampling, not all mutation callback,
React, history serialization or incident-delivery work. This explains why the
small fixture alone cannot qualify actual application responsiveness.

Both actual-game tests recorded zero healthy-opening incidents and exactly one
durable incident after a local self-hand opacity fault with debug UI off.
The fake sessions and their diagnostic rows were deleted and cleanup verified.
Three residual diagnostic rows from earlier synthetic runs were also removed
using exact fake game IDs and a guard requiring their gameplay rows be absent.
No historical production incident was deleted.

Authenticated sink conflict behavior passed a rollback proof: duplicate UUID
inserts retain one original row. Browser tests passed offline retention across
reload and same-UUID delivery, privacy checks, missing/hidden/clipped/identity
faults, synthetic H1/H2 changes and 3/5/7 count changes. Actual tests covered
openings, local loss and pause/HUD interaction; complete real-game reveal,
showdown, terminal and next-hand qualification remains outstanding. The final
Holm performance assertion ran before its final no-repeated-incident assertion.

Initial full validation passed 236 test files / 1,622 tests and 10 harness
files / 150 tests, plus the production build. After the final optimizations,
the three incident-delivery unit tests, installed TypeScript compiler, app
build and fixture build passed. No dependencies were installed. `bunx tsgo`
was unavailable (404), so the installed compiler was used instead.

## Evidence and resumption boundary

Raw local evidence is retained under
`artifacts/card-visibility-checkpoint-20260915/`, including final per-game
measurements, incident capsules, browser results and the earlier failed Holm
comparison. Build logs remain under `artifacts/card-visibility-*.log`.
Tests and fixtures are retained in `e2e/cardVisibility*` and
`e2e/fixtures/cardVisibility*`.

Next bounded work: profile actual Holm HUD interaction with the observer
enabled/disabled, including mutation callbacks, geometry reads, React commits
and long tasks; isolate repeatable overhead before another optimization.
Retain the existing absolute budgets and then complete the remaining actual
lifecycle exclusions. No broader game or gameplay refactor is authorized by
this checkpoint.

Production remains on the baseline. No push, merge, deployment or schema
change occurred in this phase. The prior production deployment is
`dpl_Fkcyi1vKQRhpyJWmgVYSWU9B3GGW`; if this client change is later qualified and
released, recovery is a client-commit revert/previous-deployment restoration,
without a database recovery step. The execution-budget stop requires no new
implementation approval, but this failed gate must be resolved before release.
