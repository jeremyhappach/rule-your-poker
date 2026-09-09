# September 9 healthy 3-5-7 transitions — both cases pass

Both final healthy cases passed end to end on published product build
`9ef3e18ef66ec4f16a96f93accdc4eb920094089`, bundle `assets/index-DLC0FpgQ.js`.
They used the approved local harness correction committed with this report,
tagged `transition-decision-capture-20260909`. This correction changes test
capture sequencing only; it does not change product behavior or settlement.

Runs were sequential, approximately 21:59–22:05 UTC, inside Jeremy's confirmed
21:17:16–22:47:16 UTC no-play window. Each used one desktop host and one
390×844 peer browser, dedicated human test accounts, zero retries and a
six-second action-to-peer budget. No End Session request or fault injection
was made. Earlier failures remain preserved in
`TRANSITION_ACCEPTANCE_LIVE_20260909.md` and
`TRANSITION_ACCEPTANCE_BATCH_20260909.md`; these are separately named runs.

## Exact identities and settings

| Field | Host wins | Peer wins |
|---|---|---|
| Full result | Pass, 2.6 minutes | Pass, 2.2 minutes |
| Namespace | `transition-host-20260909-2159` | `transition-peer-20260909-2202` |
| Fake session | `9c1e0dbb-6eb8-4515-8d7c-985811e6567b` | `dfcc2740-3d2a-49a0-9af0-7faf35d68515` |
| Outgoing dealer game | `97a00486-3ab3-4c8d-ae43-3bf88201d251` | `48702ab9-2cbe-4ee6-9475-94ae6188321b` |
| Terminal round | `47fd8ea7-35f1-4866-af5d-2d3bc0208ac1` | `daa48bd4-aa89-488b-813b-f1e943ed7835` |
| Result | `23ec9413-834f-4313-89f4-9ce36f7a98ce` | `7d076bd8-9f40-44b1-9610-f64d0a35536c` |
| Winner player | `910b82e1-574d-4b6f-b5e3-8aedefa12ca9` | `ff95eca6-555b-45cd-bdfc-b7ad81c5e0b6` |
| Other player | `3d80e5a6-c65c-411e-a0ce-9aea02a728e0` | `5eeb20fb-cef2-4d8b-8efd-1989bc52d6dc` |
| Successor dealer game | `ffd500b3-0439-47fc-83fb-9bf669faf4af` | `543978a5-88a5-42fc-aa28-f9041cf2c761` |
| Successor round | `91fef328-1b54-46b7-9a62-264573d127d1` | `35856adc-5afa-41dc-98c6-1fe635f33a33` |
| Successor configuration | Unchanged Run Back, 3 legs | Changed to 2 legs |

Source configuration was three $2 legs, $3 ante and $1 rollover, with reveal,
$15 pot maximum and $1 pussy tax enabled. Both cases legally progressed through
five distinct rounds: h1r1, h1r2, h1r3, h2r1 and the deciding h2r2. Both clients
passed all four ordinary leg presentations before the terminal presentation.

## Terminal presentation and accounting

Times below are milliseconds after the final Stay click. Host-win click:
22:00:48.308 UTC; peer-win click: 22:03:58.908 UTC. Reveal deadlines remain bound
to RPC request/receipt clocks recorded before the harness capture wait.

| Case / browser | Reveal deadline | Final leg end | Sweep flights end | Pot end | Setup |
|---|---:|---:|---:|---:|---:|
| Host wins / host | 5,635.5 | 7,471 | 10,939 | 17,844 | 20,438 |
| Host wins / peer | 5,605.5 | 7,490 | 10,939 | 17,925 | 20,399 |
| Peer wins / host | 5,585.5 | 7,412 | 10,924 | 17,747 | 20,256 |
| Peer wins / peer | 5,578.5 | 7,442 | 10,934 | 17,809 | 20,352 |

Both clients passed the visible 3/2/1/DROP/hold sequence, final-leg award,
two losing-leg flights, sweep overlay, exact pot transfer and setup admission
after their own pot completion. No early charge helper, balance release or
setup was detected. Both players' closing balances were checked on each browser.

Immediately before the deciding leg, both players had a -$8 balance and two
legs, with $8 in the pot. The winner paid the final $2 leg charge and received
the $10 leg reserve plus $8 pot, an $18 award tied to the exact winner UUID.
Closing balances were winner +$8 / other -$8, zero legs and zero pot.
Authoritative checks proved conservation after each action.

Each case captured 17 action receipts with zero observer violations, progress
failures, coverage gaps or exempt actions. Maximum RPC / actor / peer latency
was 196 / 893 / 1,359 ms for host wins and 245 / 1,267 / 1,525 ms for peer wins.
All ten source decision captures and both successor captures observed the
required projection on both clients. The unchanged and changed successors each
accepted a legal Drop/Stay pair. Both pre-cleanup screenshots were visually
inspected in each case and showed the correct successor configuration without
outgoing terminal artifacts.

## Harness correction, validation and cleanup

`decisionCapture.ts` waits for both continuous observers to capture the exact
session/dealer-game/round projection before the next scripted decision. Drop
requires the acting UUID's decision lock; Stay requires the completed round.
The existing six-second budget begins before the click attempt and includes RPC
time. A later completed round cannot replace evidence of a missing Drop lock.
The observer is not sealed until both successor captures complete.

Validation: application typecheck, 1,529 application tests and production build
passed. All 106 final harness tests pass, including eleven capture regressions
for both clients, identity, exact target, stale/late evidence and RPC budget.
The separate E2E typecheck still has ten pre-existing `abortSignal` typing errors
in inherited helpers, with no new errors from this change. No tools were installed.

Guarded cleanup removed each exact synthetic session. Independent read-only SQL
confirmed zero remaining rows in games, players, rounds, dealer_games,
game_results and gameplay_transfer_batches for each session. The earlier failed
21:55 synthetic session was also independently verified deleted.

Evidence is retained locally under `artifacts/transition-acceptance/`:

- `live-host-20260909-2159/` and `live-peer-20260909-2202/`: original JSON,
  screenshots, traces and cleanup receipts; corresponding `.log` files.
- Corresponding `-summary.json`, `-timings.json` and `-hashes.json` files.
- Host trace SHA256: `88D3C42D7DC0FE188ED78ACB0441439E897C32F7DDB571CEFD7E5C43D6346F33`.
- Peer trace SHA256: `D7EEDB46D3D3718B0DE1EC72DD3F0DD1D2C318773E2410A148E81A8DCECEB560`.
- `decision-capture-final-source-hashes.json`,
  `decision-capture-final-cleanup.json`, `decision-capture-harness-tests.log`,
  `decision-capture-e2e-typecheck.log` and `successor-capture-build.log`.

These healthy tests pace decisions to preserve individual action attribution.
Rapid overlapping decisions, targeted batch-first/frame-first delivery,
terminal rejoin, explicit End Session, instant sweep and cross-game expansion
remain unqualified. Jeremy's normal production smoke remains acceptance truth.
