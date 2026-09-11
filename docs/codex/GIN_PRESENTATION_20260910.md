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

## First published run and harness correction

Build 57904bf5338d7a0ccecbdb03799af0c90d9a4c2d was Vercel READY and served by
holm357.com on both browsers. The first run used session
dbc1af2e-2f1d-4cca-97b9-ff8ab0b9e6e9, source dealer game
11b7f9af-c636-43f0-a7e0-acf59a6bf265 and successor
562909f2-a1ff-4c22-9382-71979f602ea5. Both configs matched exactly: ante 10,
target 50, per-point value 1, gin/undercut bonuses 25. The 96–0 match settled
once for +106/−106. Host payout lasted 2,411 ms and setup followed 2,411 ms
later; peer payout lasted 2,420 ms and setup followed 2,229 ms later.

The test then failed while expecting another draw after both successor
players passed the first upcard. The committed action already drew from stock
for the nondealer; the peer exposed the legal select/discard surface with
eleven cards. Source `passFirstDraw` and retained action-count-2 snapshots agree.
The harness now asserts that automatic stock draw, completes its discard,
then drives the other player's ordinary stock draw and discard. This is a
test-driver correction, not a gameplay change. Partial successor actions are
now retained even if a later assertion fails. All 140 harness tests pass;
the separate typecheck still reports only the ten inherited helper errors.

The first trace also exposes a real banner-only discrepancy: both match-win
announcements say `96 — 0 · +10` while the immutable result, transfer batch and
final balances show the correct 106 payment. The Gin announcement currently
receives `anteAmount`, so it omits the per-point component. This is queued for
a separately approved product correction. A strict banner check now records
both displayed and expected amounts; it runs after independent successor
checks so correct balances cannot conceal the discrepancy.

Preserve `live/gin-presentation-20260910-first/` as failed. Independent SQL
confirmed all session/gameplay rows deleted. The existing cancel RPC leaves
a disarmed, consumed/cancelled exact-session request tombstone. Final guarded
cleanup removed only the two test-owned request entries and verified absence.

## Fresh successor qualification — banner discrepancy reproduced

The corrected harness used the same published app 57904bf5338d7a0ccecbdb03799af0c90d9a4c2d.
Session 2928b2f0-d876-45a3-9978-4cc94c507e3b; source dealer game
45d3a2f6-22f0-4e9e-ab8c-d62c7cbfb9da; successor
a3fe4c12-d99b-4faa-b22e-d8f5445e69f2. Both configurations again match all five
settings. The source settled 96–0 for exactly +106/−106. Host full payout
lasted 2,417 ms with setup 2,405 ms later; peer payout lasted 2,414 ms with setup
2,080 ms later. Both passed exact winner, full flight and final-balance checks.

The fresh successor passed zero scores, ten-card opening hands, no old winner
or knock display, the automatic stock draw after both opening passes, and
legal discards from each player with the second player's ordinary stock draw.
Twelve observed actions have zero synchronization, coverage or progress
violations; maximum peer projection was 1,388 ms. Desktop/mobile screenshots
were inspected. Full evidence and trace are retained under
`live/gin-presentation-20260910-successor/`.

The overall scenario remains **failed**: both exact winner banners display
`96 — 0 · +10` instead of the authoritative 106 payment. The new banner oracle
has positive, observed-failure and missing/unreadable controls, all passing.
The failure is preserved after successful independent successor checks; it is
not waived because settlement or animation succeeded. No product correction
for the banner is included in this task.

Independent final SQL confirmed zero remaining games, players, rounds, dealer
games, results, transfer batches, session snapshots, and fixture requests for
both sessions. Harness source hashes, first/fresh summaries, build log, 23
browser controls, 140 final harness tests and cleanup receipts are retained.
Jeremy production smoke remains separate acceptance. Holm and the remaining
Gin rule/reconnect/adverse-delivery branches have not been run in this task.
