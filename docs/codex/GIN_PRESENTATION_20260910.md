# Gin winner, payout and Run Back qualification — September 10, 2026

Jeremy approved Gin as the next bounded full-ending qualification after the
Cribbage payout-observer correction. This applies the existing healthy
winner/payout observer; it does not change gameplay timing, settlement, or
database definitions. The only app change is a passive Gin presentation
identity attribute containing session, dealer game, round and hand.

The healthy `gin-presentation-win-run-back` scenario uses the already-deployed
exact-session, expiring, one-shot `gin` fixture. The deployed arm/get/cancel
definitions were inspected: the fixture rejects real-money games, requires
the authenticated participating admin and two active players, and cannot arm
an already-started first hand. Existing guarded teardown owns session cleanup.

The source game uses a 50-point target, $10 stake and $1 per-point value. Human
browser actions take the offered card and declare Gin. The observer requires
the exact winner announcement, one complete player-to-player payout on each
client before setup, and displayed final balances matching the immutable
transfer batch. The payment must equal the stake plus the authoritative score
difference times the per-point value. No End Session request or network fault
is injected into this healthy row.

Run Back must create a new dealer-game identity with exactly the saved config.
The fixture must be consumed and cancelled, successor scores must be zero,
hands must contain ten cards, and both players must complete a stock draw and
ordinary discard. Every mutation retains both exact projections within the
existing six-second budget measured from the click attempt. No production
client waits for another player's animation receipt.

All 23 browser controls, 1,564 app tests, 137 harness tests, app typecheck and
production build pass. The separate harness typecheck retains only the ten
previously recorded `abortSignal` errors in inherited helpers. Evidence is under
`artifacts/gin-presentation-20260910/`. The source and successor test are not
yet live-qualified at this publication checkpoint. Normal knock/layoff, undercut, stock-two
void, reconnect, adverse delivery and End Session remain separate coverage.
