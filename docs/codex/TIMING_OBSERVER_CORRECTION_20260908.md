# Cross-game timing observer correction — September 8, 2026

## Approved scope

Jeremy approved a test-only measurement correction and focused Cribbage and
Yahtzee fake-money reruns. Product code, gameplay rules, settlement, schema,
recovery configuration, billing and hardware are unchanged. All production
scenarios below exercise build `f58d800dd2562675c18ffa8facda2deeac3ed80c`
with the corrected local observer, within Jeremy's confirmed no-play window.

## Corrected measurement boundaries

- Cribbage: acknowledge the discard RPC, bind its projected result to the
  exact round and player UUID, then observe that player's four-card hand on
  both clients. A subsequent local click no longer prematurely closes this
  committed discard receipt. The peer projection uses canonical seat UUIDs,
  not display names or a count from another player. A later pegging count of
  three cannot stand in for the required discard count of four.
- Yahtzee: recognize the actor's own Roll 1/2/3 progression and final
  "Pick a category" step. The observer requires the next ordinal within the
  same game/dealer-game/round and uninterrupted own-turn surface. Later
  opponent dice or a later turn cannot repair a missing actor receipt.
- Mutation-bound discard receipts still fail for missing acknowledgments or
  projections, wrong identities and already-present targets. Real latency
  over the unchanged six-second limit still fails. Actor timing is bounded
  below by the selected server acknowledgment when one is captured.

No new production instrumentation or gameplay ownership was introduced.

## Validation

- Ten new regression cases failed against the old observer as expected.
- All 66 harness unit tests pass after the correction.
- All 10 existing browser controls pass; the new real-browser control also
  passes, including UUID-to-hand mapping and the literal "Pick a category"
  surface. Its fixture waits for captured observations instead of assuming a
  fixed sleep is enough.
- Installed application TypeScript check and production Vite build pass.
  The optional `tsgo` executable was unavailable; no dependency was installed.
- All 10 archived successful Cribbage discard RPC responses produce the
  expected exact-player, exact-round target with the new parser.
- One independent read-only review found no actionable issues. This review
  supports measurement correctness, not certification of real-money safety.

## Focused production reruns

Launched September 8 at 22:51:41 UTC, two scenarios concurrently, separate
leased test identities, one worker each, retries disabled. Preflight recovery
was healthy with zero recovery unit failures, lock waiters or real-money game
rows updated since 22:15:24 UTC. The local host had approximately 6 GiB free
memory before launch and 2.7–3.3 GiB in execution samples; host conditions are part of
the test context, not proof of any earlier latency's cause.

Both scenarios passed, including persisted results and both connected clients'
terminal panels. Yahtzee finished at 22:58:52 UTC and Cribbage at 22:59:05 UTC.

| Scenario | Completion | Ordinary actions | Actor p95 / max | Peer p95 / max | RPC max |
| --- | --- | ---: | ---: | ---: | ---: |
| Cribbage | Four hands | 41 | 1,081 / 1,791 ms | 4,475 / 4,965 ms | 961 ms |
| Yahtzee | Full scorecard | 27 | 2,664 / 2,739 ms | 3,330 / 4,379 ms | 2,403 ms |

Across 68 ordinary actions there were no timing problems, observer violations
or coverage errors. All eight live discard receipts contain the expected
UUID/round/four-card target. All 26 live Yahtzee roll receipts are Roll 1;
Roll 2/3 measurement is covered by local controls, not this live scenario.
The six-second threshold was not relaxed. Nearly five-second peer progress
remains noticeable latency, not a claim of instant response.

The harness deleted only its two synthetic sessions. Independent read-only
SQL at 22:59:16 UTC confirmed zero remaining rows for those game IDs or their
rounds, zero real-money game rows updated since 22:15:24 UTC, healthy/fresh
recovery, zero recovery unit failures and zero lock waiters. Deleted fake
sessions were `79de868d-0de5-4925-97d3-7170a83bf068` (Cribbage) and
`4e0c24ee-ff8c-4b19-95ec-ecbc5c9d8f03` (Yahtzee); retained artifacts preserve
their test evidence, not playable sessions.

Artifacts are retained outside the repository at
`C:/Users/jerem/Desktop/poker/safety-check-2026-09-08/measurement-fix/`.
The original failed runs remain under the parent directory, unmodified.

## Interpretation limits

Earlier selected Gin, 3-5-7, Horses and Ship Captain Crew scenarios passed.
An isolated Holm rerun passed after its initial parallel run failed. Those
historical failures remain evidence; reruns do not erase them. All seven
games now have a passing selected scenario, but not all under identical
concurrent load. This bounded
exercise is neither exhaustive cross-game concurrency testing nor a financial
settlement audit, and cannot promise that real-money play will never lag or
freeze. Free-plan capacity and downgrade readiness remain separate questions.
