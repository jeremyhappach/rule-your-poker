import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank } from "./cardUtils";

/**
 * Start a Holm game round
 * - Each player gets 4 cards
 * - 4 community cards (2 visible, 2 hidden initially)
 * - Decision starts with buck position and rotates clockwise
 */
export async function startHolmRound(gameId: string, roundNumber: number) {
  console.log('[HOLM] Starting Holm round', roundNumber, 'for game', gameId);
  
  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  
  if (!gameConfig) {
    throw new Error('Game not found');
  }

  const anteAmount = gameConfig.ante_amount || 2;
  const buckPosition = gameConfig.buck_position || 1;

  // Get all active players who aren't sitting out
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || players.length === 0) {
    throw new Error('No active players found');
  }

  // Reset player decisions
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false
    })
    .eq('game_id', gameId);

  // Calculate pot from antes (only for round 1)
  let initialPot = gameConfig.pot || 0;
  
  if (roundNumber === 1) {
    for (const player of players) {
      initialPot += anteAmount;
      await supabase
        .from('players')
        .update({ chips: player.chips - anteAmount })
        .eq('id', player.id);
    }
  }

  // Create the round with 15-second deadline
  const deadline = new Date(Date.now() + 15000);
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: roundNumber,
      cards_dealt: 4, // Each player gets 4 cards
      status: 'betting',
      pot: initialPot,
      decision_deadline: deadline.toISOString(),
      community_cards_revealed: 2, // 2 community cards shown initially
      chucky_active: false
    })
    .select()
    .single();

  if (roundError || !round) {
    throw new Error(`Failed to create round: ${roundError?.message}`);
  }

  // Deal cards
  const deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Deal 4 community cards
  const communityCards = [
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++]
  ];

  // Store community cards in round
  await supabase
    .from('rounds')
    .update({ community_cards: communityCards as any })
    .eq('id', round.id);

  // Deal 4 cards to each player
  for (const player of players) {
    const playerCards = [
      deck[cardIndex++],
      deck[cardIndex++],
      deck[cardIndex++],
      deck[cardIndex++]
    ];

    await supabase
      .from('player_cards')
      .insert({
        player_id: player.id,
        round_id: round.id,
        cards: playerCards as any
      });
  }

  // Update game status
  await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: roundNumber,
      pot: initialPot
    })
    .eq('id', gameId);

  console.log('[HOLM] Round started successfully');
}

/**
 * Handle end of Holm round
 * - Reveal final 2 community cards if anyone stayed
 * - Evaluate hands
 * - Handle Chucky if only one player stayed
 */
export async function endHolmRound(gameId: string) {
  console.log('[HOLM] Ending Holm round for game', gameId);

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) return;

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', game.current_round)
    .single();

  if (!round) return;

  // Get all players and their decisions
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('position');

  if (!players) return;

  const stayedPlayers = players.filter(p => p.current_decision === 'stay');
  const activePlayers = players.filter(p => p.status === 'active' && !p.sitting_out);

  // Case 1: Everyone folded - pussy tax
  if (stayedPlayers.length === 0) {
    const pussyTaxEnabled = game.pussy_tax_enabled ?? true; // Default to enabled
    const pussyTaxAmount = pussyTaxEnabled ? (game.pussy_tax_value || 1) : 0;
    
    let totalTaxCollected = 0;
    if (pussyTaxAmount > 0) {
      for (const player of activePlayers) {
        await supabase
          .from('players')
          .update({ chips: player.chips - pussyTaxAmount })
          .eq('id', player.id);
        totalTaxCollected += pussyTaxAmount;
      }
    }

    const newPot = game.pot + totalTaxCollected;
    const resultMessage = pussyTaxAmount > 0 
      ? `Everyone folded! Pussy tax of $${pussyTaxAmount} per player charged. Pot now $${newPot}.`
      : 'Everyone folded! No penalty.';

    await supabase
      .from('games')
      .update({
        last_round_result: resultMessage,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);

    // Mark round complete
    await supabase
      .from('rounds')
      .update({ status: 'completed' })
      .eq('id', round.id);

    return;
  }

  // Reveal all community cards
  await supabase
    .from('rounds')
    .update({ community_cards_revealed: 4 })
    .eq('id', round.id);

  // Case 2: Only one player stayed - play against Chucky
  if (stayedPlayers.length === 1) {
    await handleChuckyShowdown(gameId, round.id, stayedPlayers[0], round.community_cards as unknown as Card[], game);
    return;
  }

  // Case 3: Multiple players stayed - showdown
  await handleMultiPlayerShowdown(gameId, round.id, stayedPlayers, round.community_cards as unknown as Card[], game);
}

/**
 * Handle showdown against Chucky (ghost player)
 */
async function handleChuckyShowdown(
  gameId: string, 
  roundId: string, 
  player: any, 
  communityCards: Card[],
  game: any
) {
  console.log('[HOLM] Player vs Chucky showdown');

  // Get player's cards
  const { data: playerCardsData } = await supabase
    .from('player_cards')
    .select('*')
    .eq('player_id', player.id)
    .eq('round_id', roundId)
    .single();

  if (!playerCardsData) return;

  const playerCards = playerCardsData.cards as unknown as Card[];

  // Deal Chucky's cards
  const deck = shuffleDeck(createDeck());
  const chuckyCardCount = game.chucky_cards || 4;
  const chuckyCards = deck.slice(0, chuckyCardCount);

  // Evaluate hands (best 5 from 4 player + 4 community for player, best 5 from X chucky + 4 community for chucky)
  const playerAllCards = [...playerCards, ...communityCards];
  const chuckyAllCards = [...chuckyCards, ...communityCards];

  const playerEval = evaluateHand(playerAllCards);
  const chuckyEval = evaluateHand(chuckyAllCards);

  const playerWins = playerEval.value > chuckyEval.value;

  if (playerWins) {
    // Player beats Chucky - game over, player wins
    await supabase
      .from('players')
      .update({ chips: player.chips + game.pot })
      .eq('id', player.id);

    await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: `${player.user_id} beat Chucky with ${formatHandRank(playerEval.rank)} and wins $${game.pot}!`,
        game_over_at: new Date().toISOString(),
        pot: 0
      })
      .eq('id', gameId);
  } else {
    // Chucky wins - player matches pot (capped)
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(game.pot, game.pot_max_value) 
      : game.pot;

    await supabase
      .from('players')
      .update({ chips: player.chips - potMatchAmount })
      .eq('id', player.id);

    const newPot = game.pot + potMatchAmount;

    await supabase
      .from('games')
      .update({
        last_round_result: `Chucky wins with ${formatHandRank(chuckyEval.rank)} vs ${formatHandRank(playerEval.rank)}. $${potMatchAmount} added to pot.`,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
  }

  // Mark round complete
  await supabase
    .from('rounds')
    .update({ 
      status: 'completed',
      chucky_active: true 
    })
    .eq('id', roundId);
}

/**
 * Handle showdown between multiple players
 */
async function handleMultiPlayerShowdown(
  gameId: string,
  roundId: string,
  stayedPlayers: any[],
  communityCards: Card[],
  game: any
) {
  console.log('[HOLM] Multi-player showdown');

  // Evaluate each player's hand
  const evaluations = await Promise.all(
    stayedPlayers.map(async (player) => {
      const { data: playerCardsData } = await supabase
        .from('player_cards')
        .select('*')
        .eq('player_id', player.id)
        .eq('round_id', roundId)
        .single();

      const playerCards = (playerCardsData?.cards as unknown as Card[]) || [];
      const allCards = [...playerCards, ...communityCards];
      const evaluation = evaluateHand(allCards);

      return {
        player,
        evaluation,
        cards: playerCards
      };
    })
  );

  // Find winner(s)
  const maxValue = Math.max(...evaluations.map(e => e.evaluation.value));
  const winners = evaluations.filter(e => e.evaluation.value === maxValue);
  const losers = evaluations.filter(e => e.evaluation.value < maxValue);

  if (winners.length === 1) {
    const winner = winners[0];
    
    // Winner takes the pot
    await supabase
      .from('players')
      .update({ chips: winner.player.chips + game.pot })
      .eq('id', winner.player.id);

    // Losers match the pot (capped)
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(game.pot, game.pot_max_value) 
      : game.pot;

    let totalMatched = 0;
    for (const loser of losers) {
      await supabase
        .from('players')
        .update({ chips: loser.player.chips - potMatchAmount })
        .eq('id', loser.player.id);
      totalMatched += potMatchAmount;
    }

    await supabase
      .from('games')
      .update({
        last_round_result: `${winner.player.user_id} wins with ${formatHandRank(winner.evaluation.rank)}!`,
        awaiting_next_round: true,
        pot: totalMatched
      })
      .eq('id', gameId);
  } else {
    // Tie - split pot
    const splitAmount = Math.floor(game.pot / winners.length);
    
    for (const winner of winners) {
      await supabase
        .from('players')
        .update({ chips: winner.player.chips + splitAmount })
        .eq('id', winner.player.id);
    }

    await supabase
      .from('games')
      .update({
        last_round_result: `Tie! ${winners.length} players split the pot with ${formatHandRank(winners[0].evaluation.rank)}`,
        awaiting_next_round: true,
        pot: 0
      })
      .eq('id', gameId);
  }

  // Mark round complete
  await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('id', roundId);
}

/**
 * Proceed to next Holm round
 */
export async function proceedToNextHolmRound(gameId: string) {
  console.log('[HOLM] Proceeding to next round');

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) return;

  // Rotate buck position clockwise
  const { data: players } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position');

  if (!players || players.length === 0) return;

  const maxPosition = Math.max(...players.map(p => p.position));
  const newBuckPosition = game.buck_position >= maxPosition ? 1 : game.buck_position + 1;

  await supabase
    .from('games')
    .update({
      awaiting_next_round: false,
      buck_position: newBuckPosition
    })
    .eq('id', gameId);

  const nextRound = (game.current_round || 0) + 1;
  await startHolmRound(gameId, nextRound);
}
