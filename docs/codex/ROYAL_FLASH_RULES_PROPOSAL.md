# Royal Flash — approved P-Town rules

Subsequent October 18 smoke: Jeremy requested automatic completion when all 25
squares are occupied. New admissions use `royal-flash/2`, inheriting the v1
points, bonuses, deck and Ready/play clocks below; existing v1 games stay frozen.
Both versions retain one leaderboard and all existing records. New results have
a 21-second presentation with synchronized 1.6-second line steps. This supersedes
the 15-second presentation note below. See [qualification](ROYAL_FLASH_AUTO_FINISH.md).

October 18 production-smoke correction: Jeremy explicitly requested sufficient
time for readable sequential row/column scoring. Newly completed boards now use
a shared 15-second server presentation window instead of the original five
seconds below. The frozen `royal-flash/1` rule configuration, point values,
dealing and Ready/play clocks are unchanged. See
[presentation qualification](ROYAL_FLASH_PRESENTATION_SMOKE_FIX.md).

October 18, 2026. Approved version: `royal-flash/1`.
Status: **Jeremy approved these rules; implemented in the shared SQL core**.

Jeremy selected the option to propose explicit P-Town rules for the gaps left
by the original-game research. Approval of this specification resolves those
gameplay choices and permits the already-requested implementation and delivery
workflow to continue. No claim of exact Megatouch reproduction is made.

## Provenance

The 5×5 grid and row/column poker hands come from
[Merit's game descriptions](https://www.meritgames.com/service%20center/GameDescriptions.pdf).
Two standard rounds are documented in the
[Tournament Megatouch manual](https://www.meritgames.com/Support_Center/manuals/TOURNAMENT.pdf).
The normal 200,000 bonus threshold is documented in the
[Maxx Classic manual](https://www.meritgames.com/manuals/Support_Center%7CMegatouch%2520Blue%2520Maxx%7Cmanuals%7CPM0220-08.pdf).

A [Megatouch Maxx cabinet inspection](https://jurisprudencia.pt/acordao/79407/)
records eight hand values and a hint about changing cards. Those values inform
the relative hand awards below. The 100× score scale, one-pair award, exact
replacement mechanism, deck policy, clocks, speed bonus, bonus-round mechanics
and finish rules are explicit P-Town design choices. They are not verified
original rules or copied Poker Squares scoring. Balance has not been playtested.

## Cards and legal actions

- Each player's round gets a fresh, independently shuffled standard 52-card
  deck: four suits, thirteen ranks, no jokers and no repeated cards. The server
  owns the shuffle and hides future cards. Both modes use the same distribution.
- Start with an empty 5×5 grid and one face-up current card.
- Tap an empty square to place the current card, then reveal the next card.
- Tap an occupied square to replace its card with the current card. The replaced
  card is discarded permanently. Replacement is allowed before or after the grid
  fills and consumes one draw, just like placement.
- There is no separate pass, undo, movement of placed cards, or free swap between
  squares. Rejected or duplicate commands consume neither a card nor time credit.
- The opening current card counts as the first of the 52 available placements.
  No reshuffle occurs. The last card is usable before stock exhaustion finishes
  the round.
- Filling all 25 squares does not end play: remaining cards may improve the grid.
  Take Score is enabled after the first valid placement, including on a partial
  grid. It is unavailable during intro/Ready and after a round has ended.

## Hand points

Score the five rows and five columns. Each complete five-card line receives
exactly one award: its highest qualifying hand. No diagonals, partial-line awards,
or stacked categories. A card contributes to both its row and its column.

| Best hand in a complete line | P-Town points |
|---|---:|
| Royal flush | 50,000 |
| Straight flush | 40,000 |
| Four of a kind | 30,000 |
| Full house | 20,000 |
| Flush | 10,000 |
| Straight | 9,000 |
| Three of a kind | 8,000 |
| Two pair | 7,000 |
| One pair | 5,000 |
| High card / no qualifying hand | 0 |

Ace is low in A-2-3-4-5 and high in 10-J-Q-K-A. No wraparound straight, such as
Q-K-A-2-3. Card order within a line does not matter. A royal flush is the suited
10-J-Q-K-A. An incomplete line is worth zero even if its occupied cells contain
a pair or another partial combination.

These are the values of the current grid, not repeated awards on each placement.
Replacing a card recomputes its row and column and can reduce the current hand
subtotal. A player cannot repeatedly earn points by breaking and rebuilding a
hand. The center score shows completed-round points plus the server-confirmed
current hand subtotal; the unbanked speed bonus is shown separately.

## Clock and speed bonus

- A 2.5-second round introduction uses the existing presentation convention.
- Then allow 20 seconds to make the first valid placement. Only this Ready phase
  shows a numeric start countdown/instruction. Its expiry records a zero-point
  round and continues automatically; it does not erase earlier rounds.
- The first valid placement starts a fresh **150-second** playing clock. This
  gives time for 25 initial placements and considered replacements. It is a
  proposed Royal Flash duration, not a claim about the original machine.
- Active play shows the shared dot timer driven by this authoritative deadline.
  Neither animation nor input retries pause, restart or extend it.
- Banking a full grid before expiry awards **250 points per whole second
  remaining**, in addition to its hand points. The same bonus applies if the
  last stock card finishes a full grid before expiry.
- A partial grid gets no speed bonus. A timeout gets no speed bonus, even if full.
- Exact formula: `250 * floor(max(0, deadlineMs - finishMs) / 1000)` when the finish
  reason is Take Score or stock exhaustion and all 25 cells are filled; zero
  otherwise. The server supplies both times.
- At or beyond a deadline, timeout takes precedence over a crossing command.
  Expired placement/replacement/Take Score cannot change the finalized result.
- Reconnect and foreground recovery use the same persisted deadline. Multiplayer
  can use the existing authorized session pause; resuming preserves the exact
  remaining gameplay duration. Arcade offers no pause.

The configured speed ceiling is 37,500 points at 150 seconds remaining. This is
a bound, not a promised practically achievable bonus. There are no separate
full-grid, unused-stock, streak or special-hand bonuses beyond the table above.

## Round and game completion

Take Score, stock exhaustion or playing timeout ends a started round. Score
the current complete rows/columns and add only the eligible speed bonus. Partial
boards retain their complete-line points; empty/untouched boards score zero.

Each round produces one immutable record containing its hand points, speed
bonus, round points and cumulative total. A five-second server-timed result hold
precedes automatic next-player/next-round progression. Celebrations and audio fit
inside that hold and cannot extend it. Reconnect seeks to current authority.

Play two normal rounds. A cumulative score of **at least 200,000 after round two**
earns exactly one bonus round. The bonus uses a fresh deck and exactly the same
placement, scoring, Ready and playing-clock rules. Add its points to the total.
There is no fourth round, repeat qualification, Easy Mode or coin-credit replay.

Arcade ends after round two if unqualified, otherwise after round three, and
returns to Royal Flash's leaderboard after result presentation. An explicitly
abandoned Arcade run is unranked. Normal timeout progression is a completed run,
not an abandonment.

Multiplayer follows existing participant order: everyone plays round one, then
round two, then only qualifying participants play their bonus round. Highest
cumulative score wins. Equal highest scores are tied winners; no extra scoring
round changes the standard game. Existing canonical tie splitting, stake consent,
abandon/disconnect handling and session continuation remain the adapter's job.
Bots receive only the same visible information and legal actions as humans.

## Worked examples

- Hand subtotal 70,000, full grid banked with 80 whole seconds remaining:
  `70,000 + 80 * 250 = 90,000` for this round.
- The same grid at timeout: 70,000; no speed bonus.
- A partial board with one complete flush row and no other scoring complete
  line: 10,000, whether taken early or timed out; no speed bonus.
- A flush row becomes a nonstraight high-card row after replacement: its award
  drops from 10,000 to zero. The affected column is evaluated independently.
- Round scores 110,000 and 90,000 qualify at exactly 200,000. A 75,000 bonus round
  produces 275,000 total, not the sum of the cumulative snapshots.
- Round scores 100,000 and 99,999 end the game at 199,999 without a bonus round.

## Both-mode and release commitments

One frozen version owns all the rules above in both modes. Presentation/help
calls them **P-Town Royal Flash rules**. Existing games' rules, records and
leaderboard compatibility remain unchanged. Royal Flash has its own records;
winner-only top-ten/personal-best announcements use immutable canonical facts.

The discovery plan's financial, recovery, input, layout and audio qualification
gates still apply. No release is permitted without the complete authoritative
proof. Physical iPhone Safari smoke remains separate from automated checks.

Review action: approve this proposal, or identify the gameplay choices to change.
