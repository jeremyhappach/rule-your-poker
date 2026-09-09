# September 9 healthy transition batch — host pass, peer incomplete

Historical failure record: Jeremy subsequently approved the capture correction.
Separate final runs both pass; see `TRANSITION_ACCEPTANCE_HEALTHY_20260909.md`.
The outcomes and artifacts below remain unchanged.

Status: the corrected host-win case passed. The peer-win case passed outgoing
terminal presentation and settlement, but its full scenario failed because
successor action observation ended before peer progress was captured. The live
batch stopped there. No fix or automatic retry was made during this batch.

Jeremy confirmed 90 more minutes at approximately 21:17:16 UTC, through
22:47:16 UTC. The two tests ran sequentially from approximately 21:17–21:22 UTC,
inside the 30-minute first-batch limit, using one browser pair and zero retries.
Both browsers in both runs and the public manifest matched build
`9ef3e18ef66ec4f16a96f93accdc4eb920094089`, bundle `assets/index-DLC0FpgQ.js`.

## Cases and identities

| Case | Host wins | Peer wins |
|---|---|---|
| Full result | Pass | Fail: successor peer progress incomplete |
| Namespace | `transition-host-20260909-2117` | `transition-peer-20260909-2119` |
| Fake session | `0a64ed0f-869a-460a-be39-fe07fb9f580f` | `a9c48c21-2da4-49d6-b5bb-6c5a75a801b3` |
| Outgoing dealer game | `c18b69a6-fca6-4cd9-8e19-8fe3e41a2843` | `ecb2ec58-2c6b-4f3a-9659-d18ff485fbc6` |
| Terminal round | `1bb9b38b-fb03-40df-a4ac-f72c910d8859` | `fe39205c-57fd-4442-81e6-ad2a09025f57` |
| Terminal result | `b31c721c-9378-4fee-b8ad-855ff308a263` | `36602bae-2118-406f-8147-56730c814679` |
| Winner player UUID | `ace5d344-6178-45d0-bfeb-f1917aed283d` | `3e9ecdd8-ce37-4d2f-a17d-052ae7b905c6` |
| Other player UUID | `069f420b-172a-482e-8cdb-c76303135d4e` | `9c05fb8e-7799-4b78-bade-01f5b47aae37` |
| Successor dealer game | `9ab2823b-e3ff-45ae-88f6-0ce82b2d0f2f` | `357de5fc-6f95-4993-a54a-f2a721d8708c` |
| Successor configuration | Unchanged Run Back, 3 legs | Changed to 2 legs |

The host used a desktop browser and the peer a 390×844 mobile browser. Source
settings were three $2 legs, $3 ante and $1 rollover. No End Session request,
offline fault or response loss was injected. The intended winners were reached
by legal Drop/Stay decisions through hand/round `(1,1), (1,2), (1,3), (2,1),
(2,2)`. The corrected round driver passed all five rounds in both runs.

## Outgoing presentation and money evidence

Both clients in both cases passed the ordered 3/2/1/DROP/hold reveal, ordinary
leg build-up, final leg, two losing-leg sweep flights, pot flight, displayed
balances and setup gate. Each stage was tied to the exact outgoing round and
transfer identity. No early leg helper, early balance release, duplicate stage,
missing required stage or early setup was detected by these assertions.

Times below are milliseconds after the final Stay click. Host-win click:
21:18:37.921 UTC; peer-win click: 21:21:13.922 UTC. Reveal deadlines are the
client clock-adjusted deadlines bound to the exact server reveal receipt.
Sweep completion here is the two leg flights; the separate sweep overlay was
also required to disappear before the pot flight began.

| Case/browser | Reveal deadline | Final leg completed | Sweep flights completed | Pot completed | Setup first visible |
|---|---:|---:|---:|---:|---:|
| Host wins / host | 5559 | 7452 | 10944 | 17736 | 20269 |
| Host wins / peer | 5603.5 | 7452 | 10946 | 17624 | 20121 |
| Peer wins / host | 5575.5 | 7437 | 10917 | 17723 | 20194 |
| Peer wins / peer | 5576.5 | 7438 | 10912 | 17707 | 20254 |

Recorded authoritative frames and immutable batches showed the same accounting
in both cases: immediately before the deciding leg each player held -8 chips
and two legs, with an 8-chip pot. The winner bought the last 2-chip leg, then
received the 10-chip leg reserve and 8-chip pot. The final winner balance was
8, the other player -8, all legs reset to zero and the pot became zero. Each
terminal result recorded the correct winner and total award of 18. The initial
6-chip pot plus the 2-chip hand rollover accounts for the final pot of 8.
Chips plus purchased-leg reserve plus pot were conserved for every tested action.

The host-win successor retained the source configuration and both first legal
successor actions had actor and peer progress evidence. Its continuous observer
recorded 17 actions, no violations or progress problems, maximum actor progress
1224 ms and maximum peer progress 1362 ms.

## Peer-case failure boundary

The peer-win successor correctly committed `legs_to_win: 2`. Both first
successor decisions returned successful exact-round RPC responses, but the
test sealed its continuous observer at 21:21:42.436 UTC:

| Successor action | Click | RPC finished | Observation time after click | Observation time after RPC |
|---|---|---|---:|---:|
| Host Drop | 21:21:41.587 | 21:21:41.936 | 849 ms | 500 ms |
| Peer Stay | 21:21:41.998 | 21:21:42.358 | 438 ms | 78 ms |

Both actions use successor round `aa25ac9c-b743-47dd-9ea8-b684f4f47e29`.
At sealing, the host's last snapshot contained its own decision lock; the
peer's last snapshot contained the completed round but no captured host lock.
The host had not yet been captured at that completed round state. Thus the
observer correctly returned `peer-incomplete` for both exact mutation targets.
This is incomplete evidence, not a measured client timeout. It does not prove
that either missing peer projection would or would not arrive afterward.

The exact test owner is `playSuccessorDecisionPair` in
`e2e/humanChaos/support/threeFiveSevenPresentationDriver.ts`: after each click it
waits only for the actor's HTTP response. It then reads a server frame and
returns. `transitions.humanChaos.spec.ts` immediately calls
`finalizeScenarioObserver`, whose synchronous `finish()` seals incoming events.
There is no wait for the peer's committed action projection before the next
click or final sealing. A later action can also supersede a transient decision
lock before that lock is captured. The first 15 peer-progress receipts were
complete within 1483 ms; only these final two were incomplete.

The existing continuous observer default budget is 15000 ms, whereas the
approved healthy-action contract is six seconds. All completed observations
in this batch were below six seconds. The next healthy run should explicitly
use the existing `PTOWN_E2E_MAX_ACTION_TO_PEER_MS=6000` override, and the new
wait must use six seconds from the original click, not from RPC completion.

## Recommended harness-only correction

After each successor decision, wait for both existing continuous-observer
snapshots to show the exact committed mutation under the same session,
dealer-game and round UUID. For the first Drop, require the acting player's
decision lock on both clients before clicking Stay. After Stay, require the
same round's completed state on both clients before sealing evidence. Keep
the original click-relative six-second limit and fail on missing, late or
wrong-identity evidence. Use the existing read-only capture API; no arbitrary
sleep and no product polling or state changes are needed.

Add focused controls for delayed valid peer capture, absent capture, stale
identity, and evidence after the deadline. Preserve the original peer failure,
strict mutation attribution, full terminal observer, fake-money guards,
unchanged/changed configurations and all financial assertions. Do not turn a
completed RPC or a later round into proof of the missing earlier mutation.
Then run a separately named healthy batch inside the confirmed no-play window.

No product fix is recommended from this incomplete capture. Fault ordering,
terminal rejoin, explicit End Session, instant sweep and cross-game tests remain
unqualified. Jeremy's production smoke remains the acceptance gate.

## Capture correction validation — 21:55 run

Jeremy approved the capture wait. A separately recorded host-win validation
run used namespace `transition-host-20260909-2155`, the unchanged published
`9ef3e18ef` application, and the corrected local successor driver with the
six-second observer override. The source hashes and original trace are retained.

Both successor capture waits passed, closing the original 78 ms sealing gap.
However, the full run failed the same missing-wait assumption at a build-up
decision, so the live batch stopped before starting a peer case. In terminal
round `067de0ac-101c-4d44-8b14-61fc6cbfd64a`, peer Drop action
`peer-1788990980713-6` was followed by host Stay 380 ms later. The host observer
captured the completed round 836 ms after Drop, without ever capturing the
intermediate peer lock. The peer captured the completed round 943 ms after
Drop. The strict observer correctly refused to count the later completed state
as the missing earlier lock. This does not establish a stalled client.

The same approved capture requirement was therefore applied to every scripted
build-up and successor decision pair through one helper, `decisionCapture.ts`.
Each Drop waits for the exact player lock on both clients before Stay; each
Stay waits for the exact completed round on both clients. No progress assertion
was weakened and no product code changed. All capture times are retained with
their exact action identity. These healthy rows now pace actions for individual
attribution; rapid overlapping actions remain a separate coverage gap.

All 106 harness tests pass, including eleven capture controls. The separate
E2E typecheck retains only the ten existing probe/cleanup errors. Application
typecheck, 1,529 application tests and production build also passed during this
correction. No dependencies were installed. The unchanged application checks
were not repeated solely for applying the already-tested helper to build-up.

Fake session `a7a7829f-1df3-4a9d-a5cc-39d2531a4388` was deleted by guarded
cleanup and independently verified absent across the same six session tables.
Its failed trace and per-client observations remain under
`artifacts/transition-acceptance/live-host-20260909-2155/`; derived summary,
hashes and independent cleanup use that run prefix outside the original folder.
The later reruns have separate output directories.

## Cleanup and artifact retention

Both guarded cleanup calls returned `deleted` and verified absence. Independent
read-only SQL returned zero rows for each exact fake session in games, players,
rounds, dealer_games, game_results and gameplay_transfer_batches. No test
session remains active. Independent evidence is saved in
`artifacts/transition-acceptance/live-batch-20260909-2117-independent-cleanup.json`.

Original trace, observer JSON, transition JSON and both inspected pre-cleanup
screenshots are retained in each run's separate output directory beneath
`artifacts/transition-acceptance/live-host-20260909-2117/` and
`artifacts/transition-acceptance/live-peer-20260909-2119/`. Derived summary,
timing and SHA-256 manifests use the matching run prefix outside those original
directories. The earlier round-progression failure artifacts also remain intact.

- Host-win trace SHA-256: `982E51D60FFDE3635F289CF1FB499A1B541AC6F5DCDA9DDDE407387E3F9BD1E4`.
- Peer-win trace SHA-256: `EAA389E5D8D6D0BD1EA53BB881EA55FC80B274876C0733496778D7819EB6A8CF`.
