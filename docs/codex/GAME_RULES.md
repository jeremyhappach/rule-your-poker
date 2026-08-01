# Game rules and rule-source policy

## Important limitation

This handoff preserves every game-rule fact explicitly established during prior work. It does not invent missing rules.

For complete rule truth, inspect the current source, RPCs, migrations, and configuration. The first Codex repository-ingestion task must expand this file with exact source paths and rule tables before any broad rules refactor.

Never normalize one game merely because another behaves similarly.

## Shared session rules

- Sessions persist across dealer games.
- Dealer rotation and dealer-game identity are distinct from hand/round numbering.
- Hand numbers may restart in later dealer games; identity must include `dealer_game_id`.
- Participants may be active, waiting, sitting out, left, or observing.
- Waiting participants may appear in the seat ring but cannot join the active hand until the canonical boundary admits them.
- Bots use durable UUID identity and persistent display ordinals.
- Removed bot aliases are never reused within one session.
- Settlement/final balances are authoritative database work.

## Holm

Known behavior/invariants:

- Player decisions include Fold and Stay.
- Holm has dealer and buck positions.
- It includes Chucky-specific branches, community cards, lone-player/table cards, pot handling, showdowns/ties, and Pussy tax/carryforward behavior.
- Current action uses authoritative `current_turn_position`, player decision state, and decision locks.
- Bot decisions must recover from missed realtime edges and remain DB exactly-once.
- Waiting/sitting-out bots may render as yellow seats but cannot act in the current hand.
- Terminal settlement is handled by `holm_settle_hand`.
- Known RPC terminal branches include Pussy tax carryforward, Chucky pot-match loss, Chucky final award, multiplayer showdown, partial tie, and tie-break outcomes.
- Session Ended retires winning-player tabled cards, community cards, Chucky cards, rabbit-hunt marker, and deal/transport destinations.
- Holm currently has a separate local-hand path in addition to shared `ActiveHandFan`; this is technical debt, not an endorsed permanent exception.

Required source extraction: exact betting order, Fold/Stay consequences, Chucky rules, Pussy tax calculation, buck/dealer rotation, pot-match rules, tie settlement, and end-of-session conditions.

## Cribbage

Known behavior/invariants:

- Point targets: Full 121; Half 61; Super Quick 45; Sprint 31 with no skunks; Custom.
- His Heels is awarded/revealed from the cut Jack.
- A terminal His Heels reveal remains until the canonical announcement retires; no unrelated fallback timer owns it.
- `endCribbageGame` owns terminal settlement.
- `applyCribbageTerminalDisposition` is the shared Cribbage disposition path.
- LAST HAND can end the session and must reconcile balances even if participants disconnect.
- Ordinary wins remain `game_over` within the session.
- Session results record post-payout snapshots.
- Perpetual Heels selects an available Jack every hand only when the harness master gate is on.

Required source extraction: deal/crib ownership, pegging, Go/31, scoring order, skunk/double-skunk financial rules, dealer rotation, LAST HAND rules, and disconnect handling.

## Gin Rummy

Known behavior/invariants:

- Gin includes hand transitions, stock/discard interaction, scoring, score rail, run-it-back behavior, and terminal settlement.
- Hand transition and stock/discard interaction had accepted stabilization work.
- Near Gin harness exists.
- Gin remains in the terminal-authority migration backlog because claim-to-payout ownership needs proof.

Required source extraction: draw/discard legality, knock/gin/undercut, meld/deadwood calculation, target score, dealer rotation, run-it-back, settlement, disconnect handling.

## Yahtzee

Known behavior/invariants:

- Yahtzee uses canonical table/lifecycle surfaces.
- Near Win harness exists.
- Dice and held-dice behavior are game artifacts inside the canonical shell.
- Financial settlement was identified as potentially replayable per mount and remains in the authoritative migration backlog.

Required source extraction: roll count, hold/release legality, category scoring, bonuses, completion/winner rules, multiplayer/dealer-game flow, settlement.

## 3-5-7

Known behavior/invariants:

- Multiple rounds/groups occur within a hand.
- `advance_357_round` is the authoritative atomic owner for round seams.
- Terminal settlement remains separate work.
- Normal terminal and instant-win paths need separate review.
- Refresh during later rounds can suppress later-round deal transport for the rest of the hand.
- A prior defect involved missing show-cards presentation after `show_cards_decision`.
- Round-3 grouping/presentation remains a geometry/polish backlog item.

Required source extraction: exact 3/5/7 progression, ante/betting, sweep/instant-win, show-cards, pot allocation, dealer/hand/session terminal rules.

## Horses

Known behavior/invariants:

- Horses uses dice and shares controller infrastructure with SCC.
- Identity/progress auditing includes dealerGameId, handNumber, roundId, phase, completed count, turn index, roll progress, and hold sequence.
- Roll/hold/auto-roll/forced-completion and timeout behavior must be action-specific.
- Canonical win celebration remains backlogged.
- Terminal claim-to-payout ownership remains backlogged.

Required source extraction: dice objective, turn/roll flow, horse progression, win condition, settlement, dealer/session flow, timeout behavior.

## Ship Captain Crew (SCC)

Known behavior/invariants:

- SCC shares controller infrastructure with Horses but retains distinct rules.
- Canonical win celebration remains backlogged.
- Terminal claim-to-payout ownership remains backlogged.

Required source extraction: ship/captain/crew qualification order, cargo scoring, roll/hold flow, completion, winner/ties, settlement, dealer/session flow, timeout behavior.

## Rule-document completion task

Before a cross-game rule/settlement refactor, Codex must locate every game’s action controller, state adapter, settlement RPC/helper, configuration, and bot logic; produce exact rule tables with source paths; flag client/database contradictions; and make no product-code changes during that documentation pass.
