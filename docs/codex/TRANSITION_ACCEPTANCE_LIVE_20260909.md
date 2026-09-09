# September 9 transition qualification — first live failure

Status: first batch stopped at a diagnosed harness failure; Jeremy separately
approved its correction. The driver now requires the legal hand/round sequence,
rejects reused round IDs, checks the action request's round number, and records
round number in the evidence. All 95 harness tests pass, including seven new
progression checks. Host-win terminal qualification remains pending; peer-win
and later rows have not run. No product defect is established by the first run.

Correction validation: application typecheck, 1,529 application tests, 95
harness tests and production build passed. The separate E2E typecheck includes
the new driver test and reports the same ten pre-existing `abortSignal` errors,
with no driver errors. No dependencies were installed. Logs use the
`artifacts/transition-acceptance/progression-*` prefix.

The correction approval arrived at approximately 20:55 UTC, near the end of the
previous no-play window (21:02:53 UTC). An extension through 21:35 UTC was
requested so the rerun and cleanup can finish inside the confirmed window.
No new live session has been created while that extension is pending.

## Exact run

- Jeremy renewed a 90-minute no-play window at approximately 19:32:53 UTC.
- Namespace: `transition-host-20260909-1934`; retries 0, one browser pair.
- Scenario: `3-5-7-presentation-host-wins`; three $2 legs, $3 opening ante,
  $1 configured rollover. Host desktop / peer 390×844 mobile.
- Both browser builds and the public manifest matched
  `b4ad49209e054ebbed5d9698235da909bba613ba`.
- Fake session: `4efd8760-6873-407e-af94-8285632f59d8`.
- Dealer game: `dee5e8c4-631e-4728-9e63-00472053e9bf`.
- Completed first round: `db242ecc-5447-47ea-b04c-f314b8e29528`, hand 1,
  round 1. Host player UUID `cea70fa0-b900-45a2-b17e-e9343fe2a9d8`;
  peer player UUID `8349f63a-8b62-4384-a9a5-6ea7457b6f3a`.

## Evidence and failure boundary

The peer legally chose Drop, then the host Stay. The exact action receipt
returned `solo_stay`, host leg 1, and `next_round_number: 2`. The authoritative
frame and immutable leg batch recorded host chips -3 → -5 and legs 0 → 1;
peer chips stayed -3 and legs 0. The pot stayed 6. Chips + leg reserve + pot
were conserved. Batch `eadef543-b56b-401f-96ba-3f4c85777938`, cursor 2,
contained the $2 leg charge and no pot transfer.

Both observers accepted the ordered 3/2/1/DROP/hold reveal, ordinary leg award,
both players' displayed closing balances, and ordinary continuation. No early
leg helper, balance release or setup was detected for this completed round.
Times below are milliseconds after the final Stay click at
2026-09-09T19:34:42.310Z; reveal deadlines are each browser's clock-adjusted
deadline, bound to the same server reveal ending 19:34:48.198Z.

| Browser | 3 | 2 | 1 | DROP | Hold | Reveal deadline | Award first seen | Award completed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Host | 1463 | 2359 | 3256 | 4157 | 5182 | 5761.5 | 5909 | 7335 |
| Peer | 1478 | 2358 | 3273 | 4202 | 5199 | 5776 | 5893 | 7335 |

The next driver iteration failed before submitting either round-2 decision:
`threeFiveSevenPresentationDriver.ts:74` expected round number 1, received 2.
The retained screenshots show five-card hands and legal Drop/Stay controls.
The deployed `private.three_five_seven_resolve_round` definition confirms
`CASE p_round_number WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END`. The checked-in
advance owner and documented rules also increment the hand only after round 3.
The driver incorrectly assumed every purchased leg starts a new hand at round 1.

The separate continuous observer recorded zero violations/progress problems.
Across its five observed actions, maximum actor progress was 1305 ms and peer
progress 1555 ms. These are limited measurements, not terminal acceptance.

## Recommended correction and preserve list

Correct only the harness driver to require the legal five-round build-up:
hand/round `(1,1), (1,2), (1,3), (2,1), (2,2)`. Assert exact hand and round
progress, record round number with each evidence row, and retain authoritative
UUID checks so a skipped or replayed round cannot pass. Add focused regression
coverage for later rounds and the round-3 hand rollover before a separately
recorded live rerun. The existing first-failure files must remain untouched.

Preserve product source, database functions, timers, settlement, transfer and
presentation assertions, both role assignments, three $2 legs, no End Session,
one browser pair, no automatic retries, and all negative controls. Keep normal
round rollover charges distinct from the leg reserve. An unexpected instant
sweep still blocks this deciding-leg scenario rather than triggering retries.

Acceptance requires all five legal actions pairs, both clients' complete
terminal presentation and balances, legal successor actions, then exact cleanup.
After a successful host row, run the peer row separately within the batch limit.
No terminal, successor, peer-winner, fault, rejoin, End Session, instant-sweep or
cross-game behavior is qualified by this interrupted run.

## Cleanup and retained artifacts

The existing guarded fake-money cleanup returned `deleted` and verified that
the session was absent. An independent read-only SQL query also returned zero
rows for this exact session in games, players, rounds, dealer_games,
game_results and gameplay_transfer_batches. The first independent query used
the wrong dealer_games column (`game_id`); it failed without mutation. The
corrected query used the authoritative `session_id` column and passed.

Artifacts remain under
`artifacts/transition-acceptance/live-host-20260909-1934/transition-host-20260909-1934/transitions.humanChaos-two-39669-etains-only-successor-state/`:

- `human-chaos-transition-evidence.json`: exact receipts, batches and both timelines.
- `human-chaos-continuous-observer.json`: continuous action/latency evidence.
- `host-before-cleanup.png` and `peer-before-cleanup.png`: inspected snapshots.
- `trace.zip`: both clients' original run trace, retained without rerun overwrite.

Independent SQL evidence is saved in
`artifacts/transition-acceptance/live-host-20260909-1934-independent-verification.json`.
Trace SHA-256: `152C99BE960EB2039FF573C257AACB1201AE0A2DAFD746107837BEB91F95FAF8`.
Transition evidence SHA-256:
`72F19369680643BF83ACB5E308C3060E1FB254E4932E518DEF22BA4E3F8CA06D`.

The original batch remains stopped and its evidence preserved. Jeremy approved
the harness correction and a separately recorded rerun; no product source or
database behavior was changed. Jeremy's normal smoke remains production
acceptance truth.
