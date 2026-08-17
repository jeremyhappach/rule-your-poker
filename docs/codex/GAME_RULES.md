# Game rules and rule-source map

Status: extracted from the checked-out source and migration history during the
first Codex ingestion on 2026-08-01. Runtime behavior and deployed RPC
definitions still outrank this document.

This file records what the current implementation does. It does not normalize
similar games, endorse client-owned financial authority, or silently resolve
contradictions.

## Shared session model

- `games.id` is the session identity. A session contains multiple dealer
  games.
- `dealer_games.id`, mirrored by `games.current_game_uuid`, is the immutable
  dealer-game identity. Hand numbering restarts inside a dealer game.
- A round/hand identity is therefore never just `game_id + hand_number`.
  Canonical snapshots use
  `(game_id, dealer_game_id, hand_number, player_id)`.
- `DealerGameSetup.tsx` exposes seven enabled games: Holm, 3-5-7, Cribbage,
  Gin Rummy, Horses, Ship Captain Crew, and Yahtzee. It creates the
  `dealer_games` row and moves the session into the appropriate ante/dealer
  selection flow.
- Eligible gameplay participants exclude `left`, `observer`, and
  `sitting_out` rows. Waiting participants remain visible but join only at a
  canonical boundary. Bots and humans are keyed by UUID, not display aliases.
- `src/pages/Game.tsx:handleGameOverComplete` owns shared continuation after terminal
  presentation: pending session-end consumption, participant-state evaluation,
  next dealer selection/rotation, and return to dealer/game selection.
- Connected clients retain `PersistentTableShell` through terminal
  presentation, then enter the local Session Ended table phase. Fresh
  mount/reconnect of an already-ended session goes to the lobby.
- The source does not yet satisfy the doctrine that every financial settlement
  is one database-owned, replay-safe transaction. The exact seams are listed
  below.

## Holm

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx`: ante, Chucky card count (2-7), optional Pussy Tax/value, optional pot cap/value, and Rabbit Hunt. |
| Start/lifecycle | `public.start_holm_initial_hand` owns hand one; `public.proceed_to_next_holm_hand` owns later hands; `src/lib/holmGameLogic.ts:endHolmRound` orchestrates multi-player showdown presentation. |
| Legal action | `src/lib/gameLogic.ts:makeDecision` submits exact `(game, round, player)` identity to `public.holm_submit_decision`; the database guards `rounds.current_turn_position` and atomically advances the next turn/deadline. |
| Hand ranking | `src/lib/cardUtils.ts:evaluateHand`. |
| Bots | `src/lib/botPlayer.ts:makeBotDecisions`; fold probability in `src/lib/botHandStrength.ts:getBotFoldProbability`; scheduler/recovery in `src/pages/Game.tsx`. |
| State acceptance | `src/lib/gameStateSync/holmProgress.ts:getHolmProgress`. |
| Settlement | `src/lib/holmSettleHand.ts:settleHolmHand` -> `public.holm_settle_hand` in `supabase/migrations/20260801011431_c899bfad-30e4-4d26-9201-57755fb9c896.sql`. |
| Presentation | `MobileGameTable.tsx`, `HolmDealOrchestrator.tsx`, `HolmAnchoredSlot.tsx`, `HolmCanonicalCommunityRow.tsx`, `ChuckyHand.tsx`, and `HolmWinPotAnimation.tsx`. |

### Implemented rules

- Each eligible player receives four private cards. Four shared community cards
  are dealt; two begin visible and two are revealed for the showdown/Chucky
  branch.
- There is no round wild rank. A player's hand is the best five-card poker hand
  from the player's four cards plus the four community cards.
- The first buck is the occupied seat immediately left/clockwise of the dealer.
  The buck passes through occupied eligible seats using
  `src/lib/canonicalShell/seatRing.ts:nextClockwise`. Only the current buck may Fold
  or Stay. The dealer remains fixed for the dealer game; the buck rotates one
  eligible seat clockwise when the next Holm hand starts.
- On the first hand, each eligible player pays the configured ante into the
  pot. Later Holm hands preserve the replacement pot and do not re-ante.
- If everyone folds, no one wins the pot. When Pussy Tax is enabled, each
  eligible player pays the configured tax into the carry-forward pot. Rabbit
  Hunt may reveal the hidden community cards for presentation. A new hand
  begins.
- If exactly one player stays, hidden community cards are revealed and Chucky
  receives the configured number of private cards from the undealt deck. The
  player and Chucky are evaluated against the same community cards. A tie goes
  to Chucky.
- A lone player who beats Chucky receives the pot and ends the dealer game.
  If Chucky wins or ties, the stayer matches the current pot, capped by the
  configured pot maximum when enabled; that match becomes part of the
  carry-forward pot.
- If multiple players stay, all stayed hands are exposed. With one best player,
  that player receives the old pot and every losing stayer matches the old pot,
  subject to the pot cap; the loser matches form the next pot.
- With a partial top tie, the tied winners split the old pot using integer
  division and losing stayers match the pot for the next hand.
- If every stayer ties, the tied group faces Chucky. Chucky wins ties. A Chucky
  win/tie makes each tied player match the pot and play continues; if the tied
  players beat Chucky, they split the pot and the dealer game ends.
- `holm_settle_hand` owns the terminal event claim, chip deltas,
  `game_results`, post-payout snapshots, pot/round updates, and final
  disposition in one transaction. Its stable identity is
  `(dealer_game_id, hand_number)` plus a terminal `event_kind`; only
  `chucky_final_award` ends the dealer game.
- If `pending_session_end` is true on a final award, the RPC writes
  `session_ended`; otherwise it writes `game_over` and shared lifecycle
  continuation follows.
- Bots use the same Fold/Stay action. Their configured aggression/hand strength
  determines fold probability; the current-turn bot is scheduled by the
  mounted client, while database decision locks reject duplicate actions.

### Contradictions and risk

- Partial-tie payout uses floor division. If the pot is not divisible by the
  number of tied winners, the remainder is not assigned by the client
  calculation, so chip-plus-pot conservation needs a direct proof.
- The terminal RPC is replay-safe, but the bot scheduler remains a connected
  client owner. Source contains authority keys, wake replay, and DB action
  guards; no ingestion-time production smoke proves every recovery edge.

## Cribbage

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx` and `src/lib/cribbageTypes.ts:CRIBBAGE_GAME_MODES`. |
| Pure state/actions | `src/lib/cribbageGameLogic.ts:initializeCribbageGame`, `discardToCrib`, `advanceCribbageToCutting`, `playPeggingCard`, `callGo`, `applyHandCountScores`, `startNewHand`. |
| Scoring | `src/lib/cribbageScoring.ts:evaluateHand`, `evaluatePegging`, `checkHisHeels`; breakdowns in `src/lib/cribbageScoringDetails.ts`. |
| Persistence/lifecycle | `src/lib/cribbageRoundLogic.ts:startCribbageRound`, `startNextCribbageHand`, `updateCribbageState`; mounted controller in `src/components/CribbageMobileGameTable.tsx`. |
| Bots | `src/lib/cribbageBotLogic.ts:getBotDiscardIndices`, `getBotPeggingCardIndex`, and `shouldBotCallGo`. |
| State acceptance | `src/lib/gameStateSync/cribbageProgress.ts:getCribbageProgressFn`. |
| Settlement | `src/lib/cribbageSettleGame.ts:settleCribbageGame` and `public.cribbage_settle_game` in `supabase/migrations/20260802001500_atomic_cribbage_terminal_settlement.sql`. |
| RPC seams | `cribbage_apply_discard` in `supabase/migrations/20260427222814_cc092d72-fc73-4e06-8d21-d9baccc1bebb.sql`; counting resolution/release and the current `cribbage_create_next_hand` wrapper in `supabase/migrations/20260814003750_defer_cribbage_successor_until_release.sql`; `cribbage_settle_game` in `supabase/migrations/20260802001500_atomic_cribbage_terminal_settlement.sql`. |

### Implemented rules

- Supported player counts are two through four. With two players, each gets six
  cards and discards two. With three or four players, each gets five and
  discards one. The dealer owns the crib.
- Phases are dealer selection, dealing, discarding, cutting, pegging, counting,
  and complete. The first dealer is selected by high-card draw; the dealer
  rotates each hand.
- The nondealer/pone begins pegging. Players alternate legal cards while the
  running total may not exceed 31. A player with no legal card calls Go; the
  reducer can also mark blocked players automatically.
- Pegging awards two for 15, two for 31, 2/6/12 for pair/triple/quad, the
  longest trailing run of at least three, and one for Go/last card. The last
  card point is not added after a 31. A new pegging sequence starts after 31 or
  after all remaining players are blocked, beginning with the next player who
  still has cards.
- A Jack cut card awards the dealer two for His Heels immediately; that award
  can itself reach the match target.
- Counting order is each nondealer hand, then the dealer hand, then the dealer's
  crib. Hand scoring covers fifteens, pairs, runs (including multiplicity),
  flushes, and nobs. A normal hand flush scores four or five; a crib flush
  requires all five cards including the cut card.
- Presets are Full 121 (skunk below 91, double skunk below 61), Half 61 (below
  31/below 15), Super Quick 45 (skunk below 30, no double), and Sprint 31 (no
  skunks). Custom accepts a positive target and disables skunks.
- Chips do not move per hand. At match end, every loser pays
  `ante * payoutMultiplier`; the winner receives the sum. Multiplier is one,
  two, or three for ordinary/skunk/double-skunk results.
- `cribbage_apply_discard` row-locks the current round and applies a player's
  discard idempotently. The client still observes all discards and advances to
  cutting. `cribbage_create_next_hand` creates the next hand with predecessor
  identity/deduplication.
- At match end, clients submit only game, round, dealer-game, and hand identity
  to `cribbage_settle_game`. The RPC locks the round and game, derives the
  skunk multiplier from the persisted scoreboard and game configuration, and
  atomically writes the durable result claim, balanced chip movement, round
  completion, final snapshots, and terminal disposition. Duplicate callers
  return the existing claim without financial writes.
- A normal win becomes `game_over`. If LAST HAND has set
  `pending_session_end`, the same transaction snapshots post-payout balances,
  writes `session_ended`, and mints deduplicated real-money `SessionResult`
  rows through the terminal-status trigger.
- Bots choose discards with the crib owner in context and select legal pegging
  cards; they call Go when no legal card exists.

### Contradictions and risk

- A source comment describes the standard three-player dealer contribution of
  an extra crib card, but `initializeCribbageGame`, local discard logic, and
  `cribbage_apply_discard` produce only three crib cards for three players.
  No fourth crib card is dealt by the current implementation.
- The atomic settlement migration and matching client cutover remain a release
  candidate until deployed duplicate-caller, disconnect, and LAST HAND
  real-money smoke proves the database behavior.
- First-hand creation and several phase transitions remain multi-write client
  operations.

## Gin Rummy

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx`: exactly two players, ante, target score, per-point value, gin bonus, and undercut bonus. Presets are in `src/lib/ginRummyTypes.ts:GIN_RUMMY_MATCH_MODES`. |
| Pure state/actions | `src/lib/ginRummyGameLogic.ts:createInitialGinRummyState`, `dealHand`, `takeFirstDrawCard`, `passFirstDraw`, `drawFromStock`, `drawFromDiscard`, `discardCard`, `declareKnock`, `layOffCard`, `finishLayingOff`, and `scoreHand`. |
| Meld/scoring | `src/lib/ginRummyScoring.ts:findAllSets`, `findAllRuns`, `findOptimalMelds`, `scoreKnock`, `canKnock`, and `hasGin`. |
| Persistence/lifecycle | `src/lib/ginRummyRoundLogic.ts:startGinRummyRound`, `startNextGinRummyHand`, `updateGinRummyState`; controller `src/components/GinRummyGameTable.tsx`. |
| Bots | `src/lib/ginRummyBotLogic.ts:shouldBotTakeFirstDraw`, `botChooseDrawSource`, `botChooseDiscard`, `botShouldKnock`, and `botGetLayOffs`. |
| State acceptance | `src/lib/gameStateSync/ginRummyProgress.ts:getGinRummyProgress`. |
| Settlement | Ordinary hand history: `src/lib/ginRummyRoundLogic.ts:recordGinRummyHandResult`; terminal settlement: `src/lib/ginRummySettleGame.ts:settleGinRummyGame` and `public.gin_rummy_settle_game` in `20260804010000_atomic_gin_terminal_settlement.sql`. |

### Implemented rules

- Exactly two active players receive ten cards each. One card starts the discard
  pile and the remainder is stock. Dealer and nondealer roles alternate each
  hand; the nondealer acts first.
- On the first upcard offer, the nondealer may take it or pass, then the dealer
  may take it or pass. If both pass, the nondealer draws from stock.
- A normal turn must draw from stock or the top discard, then discard one card.
  A card just taken from the discard pile cannot be discarded immediately.
  Stock draw is legal only while more than two cards remain.
- Sets are three or four equal ranks. Runs are at least three consecutive cards
  in one suit, with Ace low. The optimal non-overlapping meld grouping minimizes
  deadwood; A is one, number cards are face value, and face cards are ten.
- After a discard, a player may knock at deadwood ten or less; zero deadwood is
  gin. The opponent may lay deadwood onto the knocker's sets/runs unless the
  knocker has gin.
- Gin scores the opponent's deadwood plus 25. A normal knock scores the
  deadwood difference. If the opponent's adjusted deadwood is no greater than
  the knocker's, the opponent undercuts and scores the difference plus 25.
- If stock reaches two cards after a discard, the hand is void and completes
  without a score.
- Hand points accumulate in `matchScores`. A player reaching the configured
  target wins the dealer game; otherwise a new hand starts with the prior
  match scores and the opposite dealer.
- Chips move only at match end. The loser pays and winner receives
  `ante + (winnerScore - loserScore) * per_point_value`.
- `recordGinRummyHandResult` remains the ordinary nonterminal hand-history
  writer. On a terminal match, `gin_rummy_settle_game` writes the final hand
  history and durable terminal claim, moves the derived fixed match payout,
  snapshots post-payout balances at the exact hand identity, and writes
  `game_over` or `session_ended` in one transaction.
- Shared `Game.tsx:handleGameOverComplete` handles run-it-back/next dealer or
  consumes a pending session end.
- Bots evaluate whether to accept the initial upcard, choose the draw source
  and discard that minimize deadwood, always declare gin, normally knock at
  seven or less, and greedily apply legal layoffs.

### Contradictions and risk

- Dealer setup persists configurable `gin_bonus` and `undercut_bonus`, and
  `fetchGinRummyConfig` reads them, but `ginRummyScoring.ts` uses the
  constants 25 for both. The configured bonus values do not control scoring.
- Per-hand history records `player_chip_changes` of plus/minus the ante and
  `pot_won=ante` even though the same function explicitly performs no chip
  transfer. Ledger semantics therefore disagree with balances.
- The terminal partial-write seam is removed by the settlement RPC. Gin still
  relies on persisted client game-state data for score/knock provenance; the
  RPC validates terminal structure and derives payout from persisted state and
  dealer-game configuration.
- Bot driving remains mounted-client work guarded primarily by local processing
  state and fresh reads; terminal settlement no longer relies on that client
  ownership.

## Yahtzee

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx` exposes a positive ante/stake; timer defaults come from `game_defaults`. |
| State/actions | `src/lib/yahtzeeAuthority.ts:applyYahtzeeAction`; `public.yahtzee_apply_action` in `20260816210000_yahtzee_authority_cutover.sql` owns rolls, holds, scoring, action sequence, and atomic turn handoff. `yahtzeeGameLogic.ts` remains pure rule/presentation support only. |
| Scoring | PostgreSQL helpers `private.yahtzee_category_is_legal` and `private.yahtzee_category_score` are authoritative; `src/lib/yahtzeeScoring.ts` supplies previews/presentation. |
| Lifecycle | `src/lib/yahtzeeRoundLogic.ts:startYahtzeeRound` calls atomic `public.start_yahtzee_round`; `public.yahtzee_advance_postgame` owns exact-settlement continuation; `private.advance_due_yahtzee_state` owns recovery. |
| Bots | Browser heuristics may choose holds/categories, but `public.yahtzee_apply_action` validates and commits bot actions; scheduled recovery can advance disconnected bot turns. |
| State acceptance | `src/lib/gameStateSync/yahtzeeProgress.ts:getYahtzeeProgress`. |
| Settlement | `src/lib/yahtzeeSettleGame.ts:settleYahtzeeGame`; `public.yahtzee_settle_game`, introduced by `20260803234111_atomic_yahtzee_terminal_settlement.sql` and latest in `20260804000259_fix_yahtzee_settlement_replay.sql`. |

### Implemented rules

- Each player has five dice, at most three rolls per turn, and a 13-category
  scorecard. Dice may be held/released only after the first roll and while a
  later roll remains. A player must roll before choosing a category.
- Each category may be filled once. Upper categories sum matching pips.
  Three/four of a kind score all dice; full house scores 25; small straight 30;
  large straight 40; Yahtzee 50; Chance sums all dice.
- The upper bonus is 35 at an upper subtotal of at least 63.
- A repeat Yahtzee awards a 100-point bonus only when the Yahtzee box already
  contains 50. Joker forced-category rules are applied by
  `getJokerValidCategories`; lower Joker categories use their fixed scores
  and upper categories sum matching pips.
- Turn state cycles through the configured `turnOrder` after every category
  choice, skipping only players whose full scorecards are complete. One
  `rounds` row stores the full 13-category match; `yahtzee_state.currentRound`
  is initialized to 1 and the current action code does not increment it. The
  game completes when every player has filled all 13 categories.
- The session dealer remains fixed for this Yahtzee dealer game. A tie creates
  another Yahtzee hand under that dealer; after a win, PostgreSQL derives the
  next dealer and setup phase from the exact committed settlement.
- Bootstrap validates admission and completed ante decisions, persists the
  canonical nearest-lower-position clockwise order, creates the round, and
  returns the committed state in one transaction. The caller consumes/refetches
  that result directly; Realtime is not the bootstrap trigger.
- Highest total wins. If multiple players share the high score, no chips move;
  the settlement RPC completes the exact round and atomically publishes the
  rollover flag for a new hand.
- Start logic sets pot to zero and does not collect an ante. On a non-tie
  completion, each loser pays the configured `anteAmount`; the winner receives
  `loserCount * anteAmount`. The payout is fixed stake, not score-difference
  based.
- Every roll, hold, and category action is authenticated, participant/turn
  scoped, and compare-and-set against `actionSequence`. Category scoring and
  the next-turn or terminal transition are one write; the local two-second
  highlight is presentation only.
- For a unique winner, the RPC atomically claims one `yahtzee_terminal`
  result, transfers the fixed configured stake, completes the round, replaces
  final snapshots with post-payout balances, and publishes `game_over` or
  direct `session_ended`. An exact replay performs no financial writes and
  remains valid after ordinary lifecycle progression changes mutable current-
  game fields.
- Connected clients retain the round-scoped participant roster for the win
  plate and loser-to-winner chip animation even if a settled player leaves.
  The route holds the exact live terminal identity through real animation
  completion; a fresh mount of an already-ended session goes to the lobby.
- After terminal presentation, `Game.tsx` submits the exact immutable identity
  to `yahtzee_advance_postgame` and skips shared browser-authored cleanup. The
  server verifies settlement, clears ephemerals/outgoing identities, and
  publishes continuation or session end with durable replay protection.
- Bots hold toward valuable categories, choose the highest heuristic available
  score, and normally use all rolls; they stop early for Yahtzee or a maximum
  category.

### Contradictions and risk

- Dealer setup calls the fixed terminal stake an ante even though no ante is
  collected into a pot.
- `yahtzeeTypes.ts` describes `currentRound` as 1-13, but the action reducer
  never increments it; scorecard category counts, not that field, carry match
  progress.

## 3-5-7

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx`: opening ante, rollover, leg value, legs to win, optional Pussy Tax/value, optional pot cap/value, and reveal-at-showdown. |
| State/actions | Client adapters in `src/lib/gameLogic.ts` submit exact identity and intent to the `three_five_seven_*` RPCs; hand ranking is server-owned with matching presentation helpers in `src/lib/cardUtils.ts:evaluateHand`. |
| Atomic seam | `supabase/migrations/20260816213000_three_five_seven_authority_cutover.sql` owns bootstrap, decision/resolution, continuation, settlement, postgame, and recovery. `20260817131736_fix_357_leg_reserve_and_setup_decline.sql` owns leg-reserve accounting and setup-owner decline. |
| Bots | `src/lib/botPlayer.ts:makeBotDecisions` and `src/lib/botHandStrength.ts:getBotFoldProbability`; scheduling in `src/pages/Game.tsx`. |
| State acceptance | `src/lib/gameStateSync/threeFiveSevenProgress.ts:getThreeFiveSevenProgress`. |
| Terminal | `public.three_five_seven_settle_game` owns exact terminal settlement for normal leg wins and instant sweeps; presentation owner `src/components/ThreeFiveSevenTerminalController.tsx`. |
| Presentation | `src/components/MobileGameTable.tsx`, `src/components/ThreeFiveSevenDealOrchestrator.tsx`, `src/components/ThreeFiveSevenAnchoredSlot.tsx`, and `src/components/ThreeFiveSevenProofCardsAnimation.tsx`. |

### Implemented rules

- A hand has three rounds. Round 1 deals three cards. Round 2 retains those
  three and adds two. Round 3 retains five and adds two. After Round 3, the next
  hand begins at Round 1. The dealer remains fixed while these hands/rounds
  continue; shared lifecycle changes dealer only after the dealer game ends.
- The rank matching the round size is wild: 3s in Round 1, 5s in Round 2, and
  7s in Round 3. Poker hands are evaluated by `cardUtils.ts`.
- An exact Round 1 holding containing ranks 3, 5, and 7 is an immediate sweep
  before Fold/Stay decisions.
- Eligible players decide Stay or Fold independently; there is no sequential
  buck. A fold is round-only and is cleared at the next round. When deadline
  policy applies, undecided eligible players are auto-folded.
- With exactly one stayer, that player buys one leg: chips decrease by the
  configured leg value and the player's leg count increases. Leg money is
  tracked separately from the pot.
- With multiple stayers, the best poker hand wins. If there is one best player,
  each losing stayer pays that winner an amount equal to the current pot,
  capped by the configured pot maximum. The original pot stays on the table.
  A top tie moves no chips.
- If nobody stays, optional Pussy Tax is collected from every active eligible
  player into the carry-forward pot.
- The opening Round 1 collects the configured ante from every eligible player.
  After Round 3, the next hand's Round 1 instead collects the configured
  rollover from every eligible player and adds it to the carry-forward pot.
  Rounds 2 and 3 collect neither.
- A player reaching `legs_to_win` wins the dealer game and receives the
  carry-forward pot plus the value of every purchased leg. All leg counts reset.
  A Round 1 3-5-7 sweep receives the same pot-plus-leg-value prize.
- Later-round/new-hand advancement is one row/game-locked
  `advance_357_round` transaction: roster, carry-forward cards, new deal,
  decision reset, persisted rollover at a new-hand Round 1, and normal R1
  instant sweep. Its seam identity
  is `(game_id, dealer_game_id, next_hand_number, next_round_number)`.
- Initial Round 1 enters through atomic `three_five_seven_begin_game`, and the
  initiating browser consumes the committed returned round directly. Normal
  leg completion and instant sweep settle through exact-identity database
  transitions. `three_five_seven_advance_postgame` owns the terminal handoff;
  `three_five_seven_decline_setup` owns a setup owner's explicit Sit Out.
- `reveal_at_showdown` controls opponent proof-card presentation. An
  identity-guarded `show-cards` broadcast is presentation only.
- Bots use the same Stay/Fold action with hand-strength/aggression probability
  and staggered connected-client scheduling.

### Contradictions and risk

- Normal terminal settlement is not the same authoritative owner as the atomic
  R1 sweep. `handleGameOver` claims status before a separate payout and uses
  fire-and-forget result/snapshot writes; disconnect can strand the sequence.
- `endRound` uses presentation delays before invoking normal terminal work.
  If the claiming client disappears, no database transaction completes it.
- Initial Round 1 remains a multi-write client path while later Round 1 seams
  are database-owned.
- In the RPC's existing-round repair branch, Round 1 ante collection occurs
  after the incomplete row is detected and can run before missing cards are
  repaired. That path needs a direct rollback-safe proof against double ante.
- Admin forced cards are accepted as assignments without removing those cards
  from the randomized deck, so a harness invocation can create duplicate cards.
- `botHandStrength.ts` comments describe a Round 1 Ace-high special fold
  probability, but the three-card evaluator cannot detect that state and
  returns its generic value.

## Horses

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx`: positive ante/stake; global Make It Take It setting from `src/hooks/useMakeItTakeIt.ts`. |
| Rules/actions | `src/lib/horsesGameLogic.ts:createInitialHand`, `rollDice`, `toggleHold`, `lockInHand`, `evaluateHand`, and `determineWinners`. |
| Lifecycle | `src/lib/horsesRoundLogic.ts:startHorsesRound` and `endHorsesRound`. |
| Mounted controller | `src/hooks/useHorsesMobileController.ts` owns actions, timers, bot controller, completion, tie rollover, and terminal writes. |
| Bots | `src/lib/horsesBotLogic.ts:getBotHoldDecision`, `shouldBotStopRolling`, and `applyHoldDecision`. |
| State acceptance | `src/lib/gameStateSync/horsesProgress.ts:getHorsesProgress`. |
| RPCs | `claim_horses_bot_controller`, `horses_set_player_state`, and `horses_advance_turn`; latest files are named in `REPO_MAP.md`. |
| Settlement | Client completion effect in `useHorsesMobileController.ts`; no Horses settlement RPC. |

### Implemented rules

- Each player rolls five dice with at most three rolls. After the first roll,
  individual dice may be held/released; a player may lock early.
- Ones are wild. Aside from the special pure five-ones hand, the evaluator
  chooses the best repeated target from six down to two using ones as wilds.
  Rank is `count * 10 + target`; non-combination high card breaks lower
  comparisons. Five natural/wild ones are the special top rank 100.
- Players act once per hand in `turnOrder`, normally starting at the occupied
  seat left/clockwise of the dealer via `nextClockwise`. Make It Take It can
  make the dealer act first.
- Every active eligible player antes at each hand start. A sole top result wins
  the entire pot and ends the dealer game.
- If the highest hand is tied, One Tie All Tie applies: no payout, the pot
  carries, every eligible player re-antes, and a new hand begins under the same
  dealer game.
- The dealer remains fixed across tie rollovers. A sole winner ends the dealer
  game; shared lifecycle then selects the next dealer/game.
- State is shared JSON in `rounds.horses_state`. Players write only their
  state through `horses_set_player_state`; current-turn advancement uses an
  expected-player compare-and-set RPC. A claimed human controller drives bots.
- A human turn receives the configured deadline. Timeout marks the player
  `auto_fold`/`sit_out_next_hand` and forces remaining rolls to completion; bot
  turns have no human deadline.
- Bots hold ones and dice matching their selected target. They generally use
  all rolls unless they reach five of a kind.
- The mounted completion owner claims `games.status='game_over'`, then
  separately awards the pot, inserts `game_results`, starts a fire-and-forget
  snapshot, and clears the pot. Result identity uses current
  `dealer_game_id + hand_number`.
- Shared `Game.tsx:handleGameOverComplete` handles next dealer/game or pending
  session end.

### Contradictions and risk

- The game-status claim commits before payout/result/snapshot/pot clear. A
  disconnect after the claim can strand settlement, and another client will
  fail the status guard.
- Tie claim, history insert, re-ante, new-round creation, and animation are
  separate client/database operations rather than one replay-safe transition.
- Round creation and ante collection are client-owned multi-write logic. The
  action RPCs protect per-turn JSON but do not settle the hand.

## Ship Captain Crew

### Source owners

| Responsibility | Source |
|---|---|
| Setup/config | `src/components/DealerGameSetup.tsx`: positive ante/stake; Make It Take It is shared. |
| Rules/actions | `src/lib/sccGameLogic.ts:createInitialSCCHand`, `rollSCCDice`, `lockInSCCHand`, `evaluateSCCHand`, and `determineSCCWinners`. |
| Lifecycle | `src/lib/sccRoundLogic.ts:startSCCRound` and `endSCCRound`. |
| Mounted controller/RPCs | `src/hooks/useHorsesMobileController.ts`; state remains in `rounds.horses_state` and reuses all Horses RPCs. |
| Bots | `src/lib/sccBotLogic.ts:getSCCBotDecision` and `shouldSCCBotStopRolling`. |
| State acceptance | Shared `src/lib/gameStateSync/horsesProgress.ts:getHorsesProgress`. |
| Settlement | Shared client completion effect in `src/hooks/useHorsesMobileController.ts`; no SCC settlement RPC. |

### Implemented rules

- Each player has five dice and at most three rolls.
- Qualification must be acquired in order: a six (Ship), then a five
  (Captain), then a four (Crew). Qualified dice are automatically held and
  cannot be released.
- Before qualification, all unheld dice reroll. Once 6-5-4 is complete, the
  remaining two cargo dice reroll together; individual cargo dice cannot be
  held.
- A player may lock early only after qualifying. Cargo of 12 is Midnight and
  auto-locks. An unqualified hand is No Qualify with rank zero; a qualified
  hand scores cargo from two through twelve.
- Highest cargo wins. Equal high cargo is a tie; if every player is
  unqualified, all share the same top No Qualify result and the hand ties.
  One Tie All Tie then carries the pot and re-antes everyone.
- Turn order, ante/pot rollover, timeout auto-completion, bot-controller claim,
  state RPCs, winner payout, and shared session continuation are the same as
  Horses.
- Bots always continue while unqualified. Once qualified, they generally keep
  cargo eight or better when first/leading/tied, and reroll low cargo or cargo
  that trails the current leader.

### Contradictions and risk

- SCC inherits the Horses status-before-payout disconnect seam and the
  non-transactional tie/re-ante seam.
- SCC has distinct game rules but stores them in a field and RPC family named
  `horses_state`/`horses_*`. This is an intentional shared controller
  implementation, not permission to merge rule semantics.
- No focused SCC rule, settlement, or timeout test exists; the only dedicated
  deterministic harness is `force_no_qualify`.

## Cross-source discrepancy register

| Severity | Disagreement |
|---|---|
| Release blocker | Published iOS runtime shows the Session Ended Results panel contains all participants but does not vertically scroll. Source CSS in `SessionEndedTablePhase.tsx` claims a WebKit scroll owner; runtime evidence wins. This is presentation, not a game-rule change. |
| Financial authority | Holm, Cribbage, and Yahtzee terminal settlement plus the 3-5-7 atomic R1 sweep combine their terminal consequences in database functions. Gin, Horses, SCC, and normal 3-5-7 retain claim-to-payout client seams. |
| Cribbage | Three-player source constructs a three-card crib while a source comment expects the dealer's extra fourth card. |
| Gin | Configurable gin/undercut bonuses are stored but scoring hardcodes 25; per-hand result chip deltas describe transfers that do not occur. |
| Yahtzee | The fixed terminal stake does not enter a pot; direct round JSON mutation still cannot prove roll/category provenance; its ascending-position turn order conflicts with canonical lower-position clockwise order. |
| 3-5-7 | Normal terminal and instant-sweep authority differ; forced harness cards are not removed from the random deck; repair-path ante idempotency is not proven. |
| Holm | Partial tie integer division can leave a pot remainder unallocated. |

These discrepancies remain findings for later scoped tasks unless their game
section explicitly records a delivered correction.
