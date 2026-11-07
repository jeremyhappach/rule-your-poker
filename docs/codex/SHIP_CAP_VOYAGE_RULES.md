# Ship Cap Voyage — game rules v1.0

**Target:** P-Town Poker Arcade game, mobile-first; **name:** `Ship Cap Voyage`.
**Mode in this release:** single-player Arcade only. Three rounds; the final game score is the sum of the three round scores.

## Summary for players

> Qualify your Ship (6), Captain (5), and Crew (4), in that order. Then bank three cargo scores using the two remaining dice. You have 12 rolls per round. Each cargo score is worth its nonlinear base points plus 30 points for every roll still unused when you bank it. Cargo must total at least 3. Bank all three cargo scores or the entire round is worth zero.

## Dice and roll sequence

- Every round begins with **five fair, six-sided dice**, **12 available rolls**, zero qualifying dice locked, and three empty cargo-bank slots.
- **No automatic opening roll.** A fresh round shows an empty/unrolled tray and an enabled `Roll (1)` button. The user must tap it.
- Roll consumes **one** roll immediately, then plays the existing cup-shake/landing dice treatment; the remaining-roll display reflects the consumed roll once the animation settles.
- During qualification, lock **exactly one** `6` (Ship), then **exactly one** `5` (Captain), then **exactly one** `4` (Crew). A die cannot fill more than one role.
- Multiple roles may lock from the **same** physical roll, provided the 6→5→4 dependency is satisfied in sequence. Example: initial roll `[6,5,4,2,3]` qualifies all three and produces cargo total 5. An initial roll containing a 5 and 4 but no 6 does not lock either.
- Locked qualifying dice stay visible and never reroll during that round. Reroll only the dice that are not yet locked. Thus: 5 dice before any lock, 4 after Ship, 3 after Captain, and 2 after Crew.
- On the roll that completes qualification, the other two dice on that same roll become the **first cargo candidate**. The user may bank it immediately (if >=3), or reroll both cargo dice (if rolls remain). Qualification remains locked through all three cargo banks for the round.
- Only two cargo dice exist. Cargo rerolls always reroll **both** cargo dice together; holding only one is not allowed. Each cargo reroll consumes one available roll.
- Banking a cargo score **does not consume** an additional roll. One roll result can be banked into **one** manifest slot only. After a bank, the current candidate is cleared; the next cargo candidate requires an **explicit** next tap of `Roll`, even if more rolls remain. Never auto-roll between banks.

## Banking and failure

- A cargo candidate must total **3 through 12** to be bankable. **2 (snake eyes)** is unbankable. Disabled Bank button in that state.
- The user chooses between `Bank Cargo` (if eligible) and `Roll Again` (if rolls remain). Never auto-bank a valid cargo outcome.
- Once banked, that cargo score and its unused-roll bonus are locked for the current round; the player cannot undo or replace it.
- The round succeeds **only** when three cargo scores have been banked. If the budget expires while fewer than three banks are complete, the **entire round scores 0**, even if earlier cargo banks showed strong provisional values.
- If **zero** rolls remain but the **third** cargo candidate is bankable, the player can still tap `Bank Cargo` and complete the round. A third candidate of 2 on roll 12 is a bust; so is any state in which fewer than three banks can be completed.
- If qualification is never completed, the round is a zero.
- Round success is determined by all three banks, not by the value of the final cargo only; no separate minimum total for the completed manifest.

## Nonlinear cargo base-point schedule

| Two-dice cargo total | Base points | Bankable |
|---:|---:|:---:|
| 2 | — | No |
| 3 | 30 | Yes |
| 4 | 45 | Yes |
| 5 | 65 | Yes |
| 6 | 90 | Yes |
| 7 | 125 | Yes |
| 8 | 175 | Yes |
| 9 | 250 | Yes |
| 10 | 365 | Yes |
| 11 | 530 | Yes |
| 12 | 800 | Yes |

### Exact scoring formulas

For cargo bank *i*:

`bank_points_i = base_points[cargo_total_i] + (30 * rolls_remaining_at_bank_i)`

`round_score = sum(bank_points_1, bank_points_2, bank_points_3)` **only when all three banks exist**, otherwise `round_score = 0`.

`game_score = round_1_score + round_2_score + round_3_score`.

**No additional timer-based score bonus** and no other scoring multipliers in v1.0. Rolls remaining are evaluated at **the moment of banking**, *after* the roll that generated the cargo result was consumed. Banking itself does not consume a roll.

### Verified arithmetic example

A valid first-bank 11 with 8 rolls remaining earns `530 + 8*30 = 770`. A second-bank 8 with 5 remaining earns `175 + 5*30 = 325`. A third-bank 9 with 2 remaining earns `250 + 2*30 = 310`. Completed round score = **1,405**. If the third bank never happens, round score = **0** instead, not 1,095.

## Round lifecycle

1. `round_intro`: show **Round 1 / Round 2 / Round 3** with the **shared P-Town round-opening bell treatment on every round**. The first roll remains manual, and no roll occurs during the intro.
2. `await_first_roll`: empty tray; `Roll (1)` active; Bank disabled.
3. `rolling`: animate the appropriate number of unlocked dice, with synchronized cup-shake sound and haptic/rumble when supported. Block duplicate taps and prevent speculative state changes while rolling.
4. `qualifying`: visually lock 6, 5, 4 as earned. If all are locked, transition to the first two-dice cargo decision.
5. `cargo_decision`: show the two cargo dice, clear cargo total, clearly legible bank base/unused-roll bonus/combined value; choose Bank or Roll Again.
6. `await_next_cargo_roll`: after bank #1 or #2, show empty/currently unrolled cargo dice positions with a **manual** Roll button. Already-locked qualifying dice remain visible.
7. `round_result`: after bank #3, execute the shared **score count-up**, highlight each bank contribution, then land on a stable full-round score. If the round busts, clearly present **0** and communicate that provisional banks were forfeited.
8. `between_rounds`: show an explicit `Continue` action to start the next round, then play the **standard opening bell**. Do not jump to next round during a count-up and never roll automatically.
9. `game_result`: after Round 3, execute the game-total **count-up** and keep the **full final scoreboard** on screen (Rounds 1/2/3 plus GRAND TOTAL) until `Play Again` or `Back to Arcade` is tapped. **Never auto-return to the Arcade lobby.**

## UI display rules

- The label is always **Ship Cap Voyage**. The lobby tile has **no P-Town Original visual treatment** because that section is managed by the Arcade lobby.
- Keep legible and prominent: active round (single indicator, not duplicated), rolls remaining, qualification 6/5/4, current cargo dice and their combined total, the three banked totals and their points, the actionable Bank/Roll controls, and score result.
- Compress vertical padding. Do **not** add large instructional paragraphs, secondary duplicate timers, verbose tutorial text, or banners that push the tray/buttons off-screen. Game rules belong in the tile's info/rules affordance.
- Show a consistent top-right **`Abandon`** affordance, not `Abandon Run`; match existing confirmation behavior.
- Render correct dice pips and ensure qualification and cargo dice match the authoritative rolled values. The provided older AI concept images contain illustrative inaccuracies: use the *technical reference mockups* and this spec for exact behavior.
- Use the Arcade's shared rules modal / info affordance for this game. The latest approved art contains a **gold circular i** at bottom-right; make that visual affordance an **accessible, functional tap target**, not inert decoration. Don't add a duplicate second `i`. Target >=44px on mobile and align with tile scaling/crop. If the Arcade architecture renders a separate button, hide/rework the baked-in icon as needed to avoid doubles.
- Honor global Sounds and Haptics settings; particularly account for iPhone PWA gesture requirements when enabling the AudioContext. Do not play sound on resumes/historical displays.
- Leaderboards: reuse existing Arcade 30-day and all-time top-score flows, including achieved timestamps, without inventing a separate persistence schema unless required.

## Art direction

- Ship captain, ship wheel, sunset horizon, dice and nautical cartography; saturated polished navy/gold/purple visual identity.
- Primary production tile: `assets/lobby/ship_cap_voyage_tile_16x9.png` (1920×1080 composition). The original master art is also included (1536×1024). Dice visibly read **6, 5, 4** and an info icon is present.
- Gameplay references: `assets/gameplay_reference/*.png` are deterministic *functional wireframes*, not mandatory pixel-for-pixel styling. `assets/gameplay_moodboards/*.png` convey only atmosphere, embellishment and basic motion ideas; ignore their inaccurate text/round numbers/scoring/dice faces.
