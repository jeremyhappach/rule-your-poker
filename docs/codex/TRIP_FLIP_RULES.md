# Trip Flip — frozen trip-flip/1

Approved by Jeremy on 2026-10-19 for Arcade and head-to-head multiplayer.
This specification precedes the adapters. `supabase/trip-flip/rules.sql` owns
deals, legal actions, classification, points and active time in both modes.

## Cards and movement

Each round uses an unbiased shuffled 54-card pack: IDs 0–51 are suit-major
standard cards (spades, hearts, diamonds, clubs; Ace through King); 52 and 53
are distinct Jokers. Four columns hold at most three cards each; three reusable
Flip cells hold one each. Columns/cells start empty; the fan starts with three
cards. Only its front card, a cell card, or the last card in a column moves.
After a front-fan move, remaining fan cards shift and one stock card replenishes
the rear. Stock exhaustion alone never finishes the round.

A move names source, destination and exact card ID. Locations 0–3 are columns,
4–6 are cells, and 7 is the fan (source only). Move one exposed card to a different
nonfull column or empty cell. No buried extraction, stack moves, cell swaps,
same-column reorder, skip, discard, redeal or overflow. Nonmatching full columns
remain until rearranged. Server projections enumerate legal moves.

## Classification and awards

Resolve a column immediately upon receiving its third card. Trips have equal
ranks regardless of suits and award 3,000. Runs have three physically ascending
or descending consecutive ranks and award 600. Ace is low only: A23 and 32A
qualify; QKA, KA2 and 3A2 do not. Clear qualifying columns atomically with points.

Up to two Jokers substitute for ranks. Highest valid base award wins (thus two
Jokers plus a natural card is a Trip). Run ambiguities resolve by lowest starting
rank, then ascending before descending. Jokers never earn suited/Special bonuses.
A natural suited Run adds 5,000. One exact ordered natural rank-and-suit Special
Run target is generated independently at round start and remains fixed. Matching
it adds 10,000 once per round; a qualifying suited bonus independently stacks.
Each next round generates its target anew; coincidentally equal targets are valid.

## Clock and completion

Two rounds per player; cumulative score; no bonus round or full-clear bonus.
Get Ready lasts 2,500 ms and result presentation 6,000 ms, outside active time.
Each active round receives exactly 180,000 ms. No action changes that deadline.
Multiplayer authorized pause shifts time anchors together; Arcade has no pause.

The later historical reference displays 30 dots (three rows of ten). Freeze 30
dots, 6,000 ms each, and 125 points per remaining illuminated dot. At banking:
`dots = clamp(ceil(max(0, deadline - serverNow) / 6000), 0, 30)`.
Thus 180,000 or 174,001 ms remaining gives 30; exactly 174,000 gives 29;
1–6,000 gives one; zero gives zero. Client projection may display this frozen
formula but the SQL reducer exclusively awards points. Exactly at or after the
deadline timeout takes precedence over a move or Take Score and earns zero.

Take Score is available throughout active play, even with zero combinations or
remaining stock. Take Score and complete exhaustion of stock, fan, columns and
cells bank earned points plus the same remaining-dot award. No speculative
dead-end solver ends play. Timeout automatically tallies. Round two finalizes.

## Mode orchestration and release

Arcade uses durable solo ownership, receipts, immutable results and recovery,
with no multiplayer/session/financial writes. Multiplayer alternates complete
rounds P1R1, P2R1, P1R2, P2R2 on independent shuffled boards. No future stock is
public. Highest cumulative authoritative score wins; canonical tie/settlement,
consent, pause, terminal and continuation owners remain authoritative.

Historical references: [XL Gold](https://www.flipperfrance.com/ArticleFF2/Tactiles/Megajeux/Wd_FF23.JPG),
[MAXX Ruby](https://www.youtube.com/watch?v=aRChKeAnwuE&t=1878s),
[later gameplay](https://www.youtube.com/watch?v=-gcvmxT1HjU&t=40s).
Joker edge cases, Special 10,000, exact target/order/stacking, 180 seconds and
dot boundary rounding are approved P-Town decisions, not claims about Merit code.
Admission remains closed until full financial, recovery, client and visual
qualification passes. This document alone is not release qualification.
