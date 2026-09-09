# Holm/Yahtzee repeatability check — September 8, 2026

## Outcome

Qualification stopped at the first failure. Both isolated scenarios passed;
the paired attempt exposed a trace-confirmed setup reset before
Yahtzee could start. Holm completed during that setup attempt. This does not
qualify simultaneous Holm/Yahtzee gameplay or establish a server-latency cause.

No product code, schema, billing, hardware or production configuration changed.
All runs used published build `d47417cf715f6b33f7a1511bcba01c1fa318a8b0`.

## Approved scope and execution

Jeremy approved a capped 30-minute fake-money-only repeatability check,
individual runs followed by a paired run, stopping qualification on an
unexplained failure. The reserved no-play window covered execution. Test
launches ran 23:51:39–23:59:46 UTC, September 8; no retries or subsequent
launches followed the failure. The already-running Holm test finished its
existing scenario and guarded cleanup.

The unchanged selected scenarios were `holm-all-fold-carry` and
`yahtzee-scorecard`. Individual and paired runs used the same respective
dedicated identity slots, one worker per scenario, a ten-minute global test
timeout, six-second ordinary progress limit, and retained success/failure
traces. Cards and dice were not seeded, so workloads are not exact replays.

The peer's existing long-haul profile deliberately adds 180–800 ms to HTTP
requests and 260–1,510 ms per WebSocket frame, preserving frame order. The
host transport uses the healthy profile. Session entry deliberately disconnects
the peer for 1,750 ms; ante submission deliberately loses one committed
response. Explicit fault-labeled actions are excluded from ordinary timing
statistics. These are impaired-network observations, not a healthy-only
responsiveness benchmark or a causal load comparison.

## Results

| Run | Outcome | Completion | Timed ordinary actions | Actor maximum | Peer maximum | RPC maximum |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Holm isolated | Pass | Two hands, terminal proof, both terminal panels | 5 | 2,269 ms | 1,266 ms | 863 ms |
| Yahtzee isolated | Pass | Full scorecard, terminal proof, both terminal panels | 27 | 1,038 ms | 2,053 ms | 914 ms |
| Holm paired attempt | Pass | Two hands, terminal proof, both terminal panels | 5 | 2,882 ms | 2,418 ms | 971 ms |
| Yahtzee paired attempt | Fail | Setup tab reset; no dealer game configured | 0 | N/A | N/A | N/A |

The three completed scenarios contain 37 timed ordinary receipts, no observer
violations, timing problems or coverage errors. Zero such receipts in the
failed Yahtzee attempt is not a pass. Yahtzee's existing live driver exercises
first rolls and category selection, not held-dice/reroll coverage; local Roll
2/3 controls do not replace that missing live coverage.

Terminal proof checks the exact persisted result identity, winner identity,
two distinct human snapshots, consistent ended-session flags, both connected
terminal panels and fresh-ended-session lobby admission. It is not a complete
balance-conservation or real-money-only-path audit.

## Preserved failure and owner boundary

Synthetic session: `320e2269-3c87-40a0-9a6e-b98b2617ffb5`.
Peer client was the dealer/setup owner. The same game remained in
`game_selection`; no dealer-game or round identity existed yet.

1. At 23:58:40.587 UTC, the peer displayed game selection.
2. Playwright click `call@1082` successfully selected **Dice Games**. Its
   after-snapshot has `radix-:r8:-trigger-dice`, `aria-selected=true` and
   `data-state=active`. This was not simply a missed click.
3. At 23:58:41.366 UTC, the continuous observer shows setup absent and two
   high-card dealer-draw cards visible, while the game remains `game_selection`.
4. The high-card presentation clears at 23:58:43.549 UTC; setup returns at
   23:58:43.649 UTC. The later trace has a new tabs instance (`radix-:rb:`)
   with **Card Games** selected. Before-cleanup screenshots agree.
5. The harness waits 15 seconds for the now-hidden Yahtzee option. Its
   dependent defaults-response waiter also times out. Retained network evidence
   contains no Yahtzee-specific defaults request or `configure_dealer_game`
   request: the 15 seconds is not a measured backend configuration call.

`DealerGameSetup.tsx` owns uncontrolled tab state via `defaultValue`, defaulting
to cards for a new session. `Game.tsx` owns both setup mount sites, each gated
by `!sessionDealerDrawPresentationPending`. That pending flag follows the
dealer-draw receipt hold, adopted from layout-effect and Realtime paths. The
observed boundary is late dealer-draw presentation interrupting already-admitted
setup and resetting local selection. The exact initial read/Realtime ordering
that admitted setup early still needs a focused diagnosis; do not infer a
specific patch, add a timer, or hide it by retrying the tab click.

This evidence does not establish the cause of Jeremy's original "could not
start game" report. The defect is queued for canonical setup-admission and
presentation-continuity investigation, followed by a scoped correction and
regression proof before rerunning the blocked paired scenario.

## Cleanup and health

The harness deleted only these four synthetic sessions:

- Holm isolated: `98fbc9d5-547b-4754-8818-82f24f1b8279`.
- Yahtzee isolated: `66e820d0-b34e-4828-a505-85ce4a0f1cc6`.
- Holm paired: `43dc337a-0800-4a16-ac69-f3b7e210f42c`.
- Yahtzee paired: `320e2269-3c87-40a0-9a6e-b98b2617ffb5`.

Independent read-only SQL at 23:59:54 UTC confirmed zero remaining game or
round rows for all four IDs, zero real-money game rows updated since
22:15:24 UTC, healthy/fresh recovery, zero recovery unit failures
and zero lock waiters. All test processes exited. Cleanup removed playable
synthetic sessions; their evidence remains locally available.

Artifacts, including traces, observer JSON, summaries and failure screenshots,
are retained under `C:/Users/jerem/Desktop/poker/safety-check-2026-09-08/` in
`repeat-holm-isolated/`, `repeat-yahtzee-isolated/` and `repeat-paired/`.
