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

  if (playersError) {
    console.error('Error fetching players:', playersError);
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }
  
  if (!players || players.length === 0) {
    throw new Error('No active players found in game');
  }

  // Create round with 10-second deadline
  const deadline = new Date(Date.now() + 10000); // 10 seconds from now
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: roundNumber,
      cards_dealt: cardsToDeal,
      status: 'betting',
      pot: 0,
      decision_deadline: deadline.toISOString()
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

  // Update game state for new round
  await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      all_decisions_in: false
    })
    .eq('id', gameId);

  // Reset all player decisions and status for new round
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false,
      status: 'active'
    })
    .eq('game_id', gameId);

  return round;
}

export async function makeDecision(gameId: string, playerId: string, decision: 'stay' | 'fold', betAmount: number = 10) {
  // Get current game and round
  const { data: game } = await supabase
    .from('games')
    .select('*, rounds(*)')
    .eq('id', gameId)
    .single();

  if (!game) throw new Error('Game not found');

  const currentRound = (game.rounds as any[]).find((r: any) => r.round_number === game.current_round);
  if (!currentRound) throw new Error('Round not found');

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  if (!player) throw new Error('Player not found');

  // Lock in decision
  if (decision === 'stay') {
    if (player.chips < betAmount) {
      throw new Error('Insufficient chips');
    }

    await supabase
      .from('players')
      .update({ 
        current_decision: 'stay',
        decision_locked: true,
        chips: player.chips - betAmount 
      })
      .eq('id', playerId);

    // Add to pot
    await supabase
      .from('games')
      .update({ pot: (game.pot || 0) + betAmount })
      .eq('id', gameId);
  } else {
    await supabase
      .from('players')
      .update({ 
        current_decision: 'fold',
        decision_locked: true,
        status: 'folded'
      })
      .eq('id', playerId);
  }

  // Check if all players have decided
  await checkAllDecisionsIn(gameId);
}

async function checkAllDecisionsIn(gameId: string) {
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active');

  if (!players) return;

  const allDecided = players.every(p => p.decision_locked);

  if (allDecided) {
    await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId);

    // Check if only one player left (all others folded)
    const playersStaying = players.filter(p => p.current_decision === 'stay');
    if (playersStaying.length <= 1) {
      await endRound(gameId);
    }
  }
}

export async function autoFoldUndecided(gameId: string) {
  // Get players who haven't decided yet
  const { data: undecidedPlayers } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .is('decision_locked', false);

  if (!undecidedPlayers) return;

  // Auto-fold all undecided players
  for (const player of undecidedPlayers) {
    await supabase
      .from('players')
      .update({ 
        current_decision: 'fold',
        decision_locked: true,
        status: 'folded'
      })
      .eq('id', player.id);
  }

  // Mark all decisions as in
  await supabase
    .from('games')
    .update({ all_decisions_in: true })
    .eq('id', gameId);

  // End the round
  await endRound(gameId);
}

export async function revealAndContinue(gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) return;

  // Reset decisions for next round
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false 
    })
    .eq('game_id', gameId)
    .eq('status', 'active');

  await supabase
    .from('games')
    .update({ all_decisions_in: false })
    .eq('id', gameId);

  // Check if we should continue or end the round
  const { data: activePlayers } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active');

  if (!activePlayers || activePlayers.length <= 1) {
    await endRound(gameId);
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

  // Get all player hands for this round
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', currentRound)
    .single();

  if (!round) return;

  const { data: playerCards } = await supabase
    .from('player_cards')
    .select('*')
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

  // Reset pot
  await supabase
    .from('games')
    .update({ pot: 0 })
    .eq('id', gameId);

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
