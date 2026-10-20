# Boxdrop / 1

Approved 2026-10-20, including the same-round first-32 bonus qualification amendment.
The executable version is `private.boxdrop_rules()` and the single shared reducer
is `private.boxdrop_board_reduce()`. Arcade, multiplayer and bots use that core.

Four independent scales start at 32 with six slots. Exact completion pays 3,200,
clears that stack and raises the scale to 21 with three slots. Exact matches take
precedence over slot exhaustion. Successful 21 closures pay 5,000 / 10,000 /
15,000 / 25,000 by closure order. All four complete orders total 67,800.
There is no separate all-clear award.

Full but short retires the scale and pays 20 per accumulated point once.
Over target breaks the scale without partial credit or subtraction. Earlier
awards survive. Take Score pays partial credit on remaining active scales only.
Timeout retains earned points but pays no additional partial or end bonuses.

The active clock is 100 seconds following Get Ready. Animation never stops it.
An early finish pays 100 per complete remaining 500 ms and 1,000 per unused
recycling slot **only after at least one 32 order in that same round**.
No-action banking and recycling-only banking pay zero. One-box banking pays
only its partial credit. Qualification resets every round.

Recycling is a six-box FIFO. Before capacity, append the current box and draw
a fresh one. At capacity, append current and return the oldest without a draw.
Recycled boxes remain white with their original value through repeated cycles.
The recycling indicator is prospective bonus capacity, never a score deduction.

Two regular rounds; a cumulative score of at least 100,000 after round two
earns exactly one identical bonus round. Multiplayer alternates complete rounds
in participant order, then plays only individually qualified bonus turns.
Fresh values 1–11 are independent uniform server CSPRNG draws with replacement.
Normal red, blue, green and yellow labels are decorative.

Ptown adaptations: the frozen timer, values/distribution, stack capacities,
overload retirement, precise speed rounding, bonus threshold, FIFO payout and
first-32 eligibility use the approved specification. They are not claims that
every historical Megatouch version used these exact choices.

Release remains gated pending gameplay, parity, financial, recovery, concurrency
and rendered mobile qualification. No production activation is implied by this file.
