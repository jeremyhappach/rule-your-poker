import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank } from "./cardUtils";

export async function startRound(gameId: string, roundNumber: number) {
  const betAmount = 10;
  const cardsToDeal = roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7;

  // If starting round 1 again, delete all old rounds and player cards to start fresh cycle
  if (roundNumber === 1) {
    // Keep trying to delete until successful
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      const { data: oldRounds } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId);

      if (!oldRounds || oldRounds.length === 0) {
        // No rounds to delete, we're good
        break;
      }

      // Delete player cards for old rounds
      await supabase
        .from('player_cards')
        .delete()
        .in('round_id', oldRounds.map(r => r.id));

      // Delete old rounds
      const { error: roundsDeleteError } = await supabase
        .from('rounds')
        .delete()
        .eq('game_id', gameId);

      if (roundsDeleteError) {
        console.error('Error deleting rounds:', roundsDeleteError);
        retries++;
        await new Promise(resolve => setTimeout(resolve, 200 * retries));
        continue;
      }

      // Verify deletion succeeded
      const { data: checkRounds } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId);

      if (!checkRounds || checkRounds.length === 0) {
        // Successfully deleted
        break;
      }

      retries++;
      await new Promise(resolve => setTimeout(resolve, 200 * retries));
    }

    if (retries >= maxRetries) {
      throw new Error('Failed to delete old rounds after multiple attempts');
    }
  }

  // Reset all players to active for the new round (folding only applies to current round)
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false,
      status: 'active'
    })
    .eq('game_id', gameId);

  // Get all players
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('position');

  if (playersError) {
    console.error('Error fetching players:', playersError);
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }
  
  if (!players || players.length === 0) {
    throw new Error('No active players found in game');
  }

  // Calculate pot based on active players
  const activePlayers = players.filter(p => p.status === 'active');
  const potentialPot = activePlayers.length * betAmount;

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
    console.error('Round creation error:', roundError);
    throw new Error(`Failed to create round: ${roundError?.message || 'Unknown error'}`);
  }

  // Deal cards
  const deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Get previous round cards if this isn't round 1
  let previousRoundCards: Map<string, Card[]> = new Map();
  if (roundNumber > 1) {
    const previousRoundNumber = roundNumber - 1;
    const { data: previousRound } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId)
      .eq('round_number', previousRoundNumber)
      .single();

    if (previousRound) {
      const { data: previousCards } = await supabase
        .from('player_cards')
        .select('*')
        .eq('round_id', previousRound.id);

      if (previousCards) {
        previousCards.forEach(pc => {
          previousRoundCards.set(pc.player_id, pc.cards as unknown as Card[]);
        });
      }
    }
  }

  const newCardsToDeal = roundNumber === 1 ? 3 : 2; // Round 1 gets 3, rounds 2 & 3 get 2 new cards

  for (const player of players) {
    // Get existing cards from previous round (if any)
    const existingCards = previousRoundCards.get(player.id) || [];
    
    // Deal new cards
    const newCards = deck.slice(cardIndex, cardIndex + newCardsToDeal);
    cardIndex += newCardsToDeal;

    // Combine existing and new cards
    const playerCards = [...existingCards, ...newCards];

    await supabase
      .from('player_cards')
      .insert({
        player_id: player.id,
        round_id: round.id,
        cards: playerCards as any
      });
  }

  // Update game state for new round with potential pot
  await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      all_decisions_in: false,
      pot: potentialPot
    })
    .eq('id', gameId);

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

  // Lock in decision - no chips deducted yet
  if (decision === 'stay') {
    if (player.chips < betAmount) {
      throw new Error('Insufficient chips');
    }

    await supabase
      .from('players')
      .update({ 
        current_decision: 'stay',
        decision_locked: true
      })
      .eq('id', playerId);
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

    // Automatically end the round when all decisions are in
    // This handles both solo win and showdown scenarios
    await endRound(gameId);
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


export async function endRound(gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  if (!game || !game.current_round) return;

  const currentRound = game.current_round;
  const betAmount = 10; // Fixed bet per round

  // Get all player hands for this round
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', currentRound)
    .single();

  if (!round) return;

  // Get all players and their decisions
  const { data: allPlayers } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId);

  if (!allPlayers) return;

  // Find players who stayed (didn't fold)
  const playersWhoStayed = allPlayers.filter(p => p.current_decision === 'stay');
  
  let resultMessage = '';

  // Award leg only if exactly one player stayed
  if (playersWhoStayed.length === 1) {
    const soloStayer = playersWhoStayed[0];
    const username = soloStayer.profiles?.username || `Player ${soloStayer.position}`;
    
    // Winning a leg costs 10 chips
    if (soloStayer.chips < betAmount) {
      resultMessage = `${username} won but doesn't have enough chips to claim the leg`;
    } else {
      await supabase
        .from('players')
        .update({ 
          legs: soloStayer.legs + 1,
          chips: soloStayer.chips - betAmount
        })
        .eq('id', soloStayer.id);
        
      resultMessage = `${username} won a leg (paid ${betAmount} chips)`;
    }
  } else if (playersWhoStayed.length > 1) {
    // Multiple players stayed - evaluate hands and charge losers
    const { data: playerCards } = await supabase
      .from('player_cards')
      .select('*')
      .eq('round_id', round.id);

    if (playerCards) {
      // Only evaluate hands of players who stayed
      const hands = playerCards
        .filter(pc => playersWhoStayed.some(p => p.id === pc.player_id))
        .map(pc => ({
          playerId: pc.player_id,
          cards: pc.cards as unknown as Card[],
          evaluation: evaluateHand(pc.cards as unknown as Card[])
        }));

      if (hands.length > 0) {
        // Find winner
        const winner = hands.reduce((best, current) => 
          current.evaluation.value > best.evaluation.value ? current : best
        );

        const { data: winningPlayer } = await supabase
          .from('players')
          .select('*, profiles(username)')
          .eq('id', winner.playerId)
          .single();

        if (winningPlayer) {
          const winnerUsername = winningPlayer.profiles?.username || `Player ${winningPlayer.position}`;
          const handName = formatHandRank(winner.evaluation.rank);
          
          // Calculate total pot from losers
          let totalPot = 0;
          
          // Charge each loser and accumulate pot
          for (const player of playersWhoStayed) {
            if (player.id !== winner.playerId) {
              const amountToCharge = Math.min(betAmount, player.chips);
              totalPot += amountToCharge;
              
              await supabase
                .from('players')
                .update({ 
                  chips: player.chips - amountToCharge
                })
                .eq('id', player.id);
            }
          }
          
          // Award pot to winner
          await supabase
            .from('players')
            .update({ 
              chips: winningPlayer.chips + totalPot
            })
            .eq('id', winner.playerId);
            
          resultMessage = `${winnerUsername} won ${totalPot} chips with ${handName}`;
        }
      }
    }
  } else {
    resultMessage = 'Everyone folded - no winner';
  }

  // Store result message and reset pot
  await supabase
    .from('games')
    .update({ 
      pot: 0,
      last_round_result: resultMessage
    })
    .eq('id', gameId);

  // Mark round as completed
  await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('id', round.id);

  // Check if anyone has won 3 legs
  const { data: updatedPlayers } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId);

  const gameWinner = updatedPlayers?.find(p => p.legs >= 3);

  if (gameWinner) {
    // Someone won the game - award them all the chips from all legs
    const winnerUsername = gameWinner.profiles?.username || `Player ${gameWinner.position}`;
    
    // Calculate total value: each leg is worth 10 chips
    const legValue = gameWinner.legs * 10;
    
    // Award the winner
    await supabase
      .from('players')
      .update({ 
        chips: gameWinner.chips + legValue
      })
      .eq('id', gameWinner.id);
    
    const gameWinMessage = `🏆 ${winnerUsername} won ${gameWinner.legs} legs and won the game! (+${legValue} chips)`;
    
    // Update game status and set winner message
    await supabase
      .from('games')
      .update({ 
        status: 'completed',
        last_round_result: gameWinMessage
      })
      .eq('id', gameId);
  } else {
    // Continue to next round - cycle back to round 1 after round 3
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    
    // Set game to await next round (for testing purposes)
    await supabase
      .from('games')
      .update({ 
        awaiting_next_round: true,
        next_round_number: nextRound
      })
      .eq('id', gameId);
  }
}

export async function proceedToNextRound(gameId: string) {
  // Get the next round number
  const { data: game } = await supabase
    .from('games')
    .select('next_round_number')
    .eq('id', gameId)
    .single();

  if (!game?.next_round_number) {
    throw new Error('No next round configured');
  }

  // Reset the awaiting flag
  await supabase
    .from('games')
    .update({ 
      awaiting_next_round: false,
      next_round_number: null
    })
    .eq('id', gameId);

  // Start the next round
  await startRound(gameId, game.next_round_number);
}
