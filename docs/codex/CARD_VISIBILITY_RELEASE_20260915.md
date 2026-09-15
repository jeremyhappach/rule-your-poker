# Automatic card-visibility diagnostics — September 15, 2026

Status: qualified for production publication. All final release gates pass.

Jeremy approved deployment for Holm and 3-5-7, including the revised absolute
responsiveness budget of at most +20 ms added HUD click-to-paint p95. This
supersedes the earlier +5 ms gate; the failed measurements remain preserved in
[the initial checkpoint](CARD_VISIBILITY_CHECKPOINT_20260915.md).

## Changes and boundaries

The canonical shell now hosts an invisible observer for admitted self cards
and Holm community cards, independent of the debug UI. It checks actual card
children, ancestor visibility, clipping and hand identity. Game-specific
admission continues to own intentional dealing, tabling and terminal removal.
It does not grant visibility or change gameplay, timers, balances or replay.

Checks are coalesced to at most four per second, with no recurring idle scan.
Two observations confirm a loss. A change in the card-admission contract or
browser lifecycle invalidates pending confirmation and its first-loss sample.
The new regression test demonstrates why this matters: a rapid Cards → Chat →
Cards change can otherwise reuse a failure sampled before the interruption.
It fails on the held checkpoint and passes with the correction, while a
sustained loss still records exactly once with the new first-loss timestamp.

An incident freezes count-only evidence, authoritative/presentation/runtime
identities, bounded preceding observations and fetch breadcrumbs. No card
faces, credentials or private opponent values enter the payload. An existing
`debug_events` sink receives idempotent UUID upserts outside the gameplay path.
The local queue is capped at eight incidents, 24-hour retention, five attempts,
two sends per flush and a 30-second cooldown. Existing indexes and policies
were verified by the prior rollback-safe duplicate-insert proof; there is no
schema migration or new gameplay query/subscription.

## Validation and interpretation

TypeScript, 237 application test files / 1,623 tests, 10 harness files / 150
tests, and the production bundle pass. The initial broad local validation
also discovered tests inside the archived baseline; it was stopped, then the
complete source suite was rerun excluding `test-results/**`. No test or build
configuration change was made to production, and no dependencies were installed.

All eight final fixture tests pass in Chrome mobile emulation and WebKit
iPhone emulation: missing/hidden/clipped surfaces, hand identity, healthy
admission changes, idle behavior, cost budgets, normal-user persistence,
privacy and offline/reload delivery using the same incident UUID.

Both corrected-bundle real-table lifecycle tests pass with zero false incidents
at all 20 checkpoints. Holm covers solo/Chucky and multiplayer reveals, terminal
dealer setup, Run Back, same-dealer Hand 2, pause/reload/reconnect/resume and the
post-showdown successor. 3-5-7 covers all 3/5/7 waves, Hand 2, pause/reload/
reconnect/resume, settlement and connected Session Ended card removal.

The actual-table comparison uses an archived production baseline
`1bf23a265c812e89a4c8fa63eca9f63089e8bb3b`, the same fake-money session/viewer,
and interleaved blocks with 48 retained clicks per arm. Both arms now enter
through the same fresh historical-entry path. Earlier comparisons left the
candidate in its live-entry runtime, so their differences cannot be attributed
solely to diagnostic overhead. All earlier runs remain in local artifacts.

The metric is click to two animation frames, not RPC transaction latency.
A separate 40-click Chrome CPU profile uses local-only source maps and records
long tasks and diagnostic writes. Sampling gives approximate cumulative cost;
it cannot prove zero cost or physical-phone performance. Source maps and the
profiling harness are not enabled in the deployed application.

Final interleaved results (milliseconds, 48 clicks per arm):

| Table | Baseline p50 | Enabled p50 | Baseline p95 | Enabled p95 | Added p95 | Baseline max | Enabled max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Holm | 74.7 | 70.7 | 110.6 | 96.9 | -13.7 (-12.4%) | 149.6 | 117.1 |
| 3-5-7 | 54.8 | 57.8 | 88.0 | 80.4 | -7.6 (-8.6%) | 113.8 | 85.8 |

Both pass the +20 ms added-p95 budget. Negative differences are not evidence
that diagnostics make the app faster; scheduling variation remains substantial.
The final Holm profile sampled 45.0 ms including diagnostic descendants across
4,666.9 ms / 40 HUD clicks (about 1% of elapsed profile time). It observed three
whole-app long tasks of 51, 52 and 59 ms, none >=100 ms, and zero diagnostic
writes during healthy interaction. Earlier equivalent-entry profiles had no
long tasks. The profile does not attribute those whole-app tasks to the new
detector or justify unrelated gameplay optimization.

Final fixture scan p95 was 0.7 ms in Chrome and 1.0 ms in WebKit; maxima were
1.3 and 2.0 ms. Both passed the existing frame and handler budgets. Queue,
history, dedupe and observer sets are bounded; the idle test shows no recurring
scan. The lifecycle runs cover multiple hands, not a long-duration soak.

All four final actual-table tests pass: both lifecycle runs have zero false
incidents, and both injected-loss runs have exactly one durable incident after
reload and repeated tab interaction. All synthetic cleanup receipts pass.
Raw final results and CPU samples are retained in
`artifacts/card-visibility-release-proof/`; earlier failed and diagnostic runs
remain in the other `artifacts/card-visibility-*` directories and logs.

The 3-5-7 terminal test now waits for the connected client's Session Ended
surface before asserting card removal, matching the existing terminal harness.
The earlier immediate post-database assertion failed during presentation;
the old production baseline passes the corrected boundary. No terminal
gameplay patch was made.

## Release and recovery

Only the observer, bounded incident delivery, diagnostic fetch breadcrumbs and
their tests are included. Production history and real-money sessions are not
mutated. Practice sessions and their synthetic diagnostic rows are cleaned up
with exact-ID guards, and cleanup receipts are retained.

Rollback is a revert of the client diagnostics changes or restoration of the
previous production deployment `dpl_Fkcyi1vKQRhpyJWmgVYSWU9B3GGW`. No database
recovery is needed. The held implementation checkpoint remains tagged
`card-visibility-held-20260915`.

The original reported disappearance has not been reproduced or explained.
This release makes supported future losses observable. It cannot record while
a browser is suspended/killed, guarantee delivery if browser storage fails,
or diagnose a GPU-only defect invisible to DOM/style inspection. Tabled
opponent/winner surfaces are outside this detector's current coverage. Physical
iPhone Chrome and Android Chrome acceptance remains Jeremy's production smoke.
