import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand } from "./cardUtils";

export async function startRound(gameId: string, roundNumber: number) {
  const cardsToDeal = roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7;

  // Get all active players
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .order('position');

  if (playersError || !players || players.length === 0) {
    throw new Error('Failed to fetch players');
  }

  // Create round
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: roundNumber,
      cards_dealt: cardsToDeal,
      status: 'betting',
      pot: 0
    })
    .select()
    .single();

  if (roundError || !round) {
    throw new Error('Failed to create round');
  }

  // Deal cards
  const deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  for (const player of players) {
    const playerCards = deck.slice(cardIndex, cardIndex + cardsToDeal);
    cardIndex += cardsToDeal;

    await supabase
      .from('player_cards')
      .insert({
        player_id: player.id,
        round_id: round.id,
        cards: playerCards as any
      });
  }

  // Update game state
  await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      current_player_position: 1,
      current_bet: 0
    })
    .eq('id', gameId);

  return round;
}

export async function placeBet(gameId: string, playerId: string, amount: number) {
  // Get current game state
  const { data: game } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  if (!game) throw new Error('Game not found');

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();

  if (!player || player.chips < amount) {
    throw new Error('Insufficient chips');
  }

  // Update player chips and pot
  await supabase
    .from('players')
    .update({ chips: player.chips - amount })
    .eq('id', playerId);

  await supabase
    .from('games')
    .update({ 
      pot: (game.pot || 0) + amount,
      current_bet: Math.max(game.current_bet || 0, amount)
    })
    .eq('id', gameId);

  // Move to next player
  await nextPlayer(gameId);
}

export async function foldPlayer(gameId: string, playerId: string) {
  await supabase
    .from('players')
    .update({ status: 'folded' })
    .eq('id', playerId);

  await nextPlayer(gameId);
  await checkRoundEnd(gameId);
}

async function nextPlayer(gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('current_player_position, players(*)')
    .eq('id', gameId)
    .single();

  if (!game) return;

  const activePlayers = (game.players as any[])
    .filter((p: any) => p.status === 'active')
    .sort((a: any, b: any) => a.position - b.position);

  const currentIndex = activePlayers.findIndex(
    (p: any) => p.position === game.current_player_position
  );

  const nextIndex = (currentIndex + 1) % activePlayers.length;
  const nextPosition = activePlayers[nextIndex]?.position || 1;

  await supabase
    .from('games')
    .update({ current_player_position: nextPosition })
    .eq('id', gameId);
}

async function checkRoundEnd(gameId: string) {
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active');

  if (!players || players.length <= 1) {
    await endGame(gameId);
  }
}

export async function endRound(gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  if (!game || !game.current_round) return;

  const currentRound = game.current_round;

  // Get all player hands
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', currentRound)
    .single();

  if (!round) return;

  const { data: playerCards } = await supabase
    .from('player_cards')
    .select('*, players(*)')
    .eq('round_id', round.id);

  if (!playerCards) return;

  // Evaluate hands
  const hands = playerCards.map(pc => ({
    playerId: pc.player_id,
    cards: pc.cards as unknown as Card[],
    evaluation: evaluateHand(pc.cards as unknown as Card[])
  }));

  // Find winner
  const winner = hands.reduce((best, current) => 
    current.evaluation.value > best.evaluation.value ? current : best
  );

  // Award pot to winner
  const { data: winningPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('id', winner.playerId)
    .single();

  if (winningPlayer) {
    await supabase
      .from('players')
      .update({ chips: winningPlayer.chips + (game.pot || 0) })
      .eq('id', winner.playerId);
  }

  // Mark round as completed
  await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('id', round.id);

  // Start next round or end game
  if (currentRound < 3) {
    await startRound(gameId, currentRound + 1);
  } else {
    await endGame(gameId);
  }
}

async function endGame(gameId: string) {
  await supabase
    .from('games')
    .update({ status: 'completed' })
    .eq('id', gameId);
}
