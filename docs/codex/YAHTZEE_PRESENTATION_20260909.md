# Yahtzee presentation qualification — September 9

Status: Harness implemented after the successful Cribbage healthy case;
published live qualification is pending.

Local validation passed: 1,538 application tests, 126 harness unit tests, 11
browser observation controls and the complete production build. The separate
E2E typecheck retains only the ten previously documented `abortSignal` typing
errors in inherited helpers; no new type errors remain. Logs are retained under
`artifacts/yahtzee-presentation/`.

The healthy row `yahtzee-presentation-final-score` reuses the existing exact-game
`yahtzee:terminal:unique` fixture. Deployed read-only preflight confirms it is a
valid Yahtzee profile and supplies exactly 12 filled categories per player.
It is armed only for the newly created fake-money session. Both participants
roll normally and score Chance through their browser; no turn-preparation RPC,
reload, synthetic live score or End Session request is used.

The source winner must have the unique highest complete scorecard. The exact
winner announcement and full $10 payout must appear on each browser before
setup, with the correct payer/payee changes. Yahtzee intentionally co-starts
announcement and chip transfer; Cribbage's separate announcement window is
preserved in the shared assertion through its original wrapper and tests.

The fixture must be consumed once and cleared before Run Back. The successor
retains the exact configuration, starts with empty scorecards and no outgoing
win artifacts, then accepts one roll and Chance score from each player. Every
action checks the authoritative request/response identity and waits for both
DOM projections of its exact action sequence within six seconds of the click.

The only app change is a passive Yahtzee root identity/action-sequence marker.
Gameplay, timers, animation, settlement, database definitions and infrastructure
are unchanged. Fake fixture cleanup also runs on failure. One browser pair,
one worker, zero retries, stop at the first unexplained failure, retained
artifacts and independent exact-session cleanup remain required.

Coverage excludes other categories, upper/Yahtzee bonus celebrations, ties,
rejoin, deliberate delivery faults, End Session and the opposite winner role.
Existing rule harness rows remain separate evidence for those paths.
