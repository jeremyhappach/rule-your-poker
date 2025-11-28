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

  // Calculate pot based on active players and ante for round 1
  const activePlayers = players.filter(p => p.status === 'active');
  let initialPot = 0;
  
  // Ante: Each player pays 10 chips into the pot at the start of round 1
  if (roundNumber === 1) {
    for (const player of activePlayers) {
      const anteAmount = betAmount; // Allow negative chips
      initialPot += anteAmount;
      
      await supabase
        .from('players')
        .update({ chips: player.chips - anteAmount })
        .eq('id', player.id);
    }
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
      pot: initialPot,
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

  // Get current pot value to preserve it
  const { data: currentGame } = await supabase
    .from('games')
    .select('pot')
    .eq('id', gameId)
    .single();

  const currentPot = currentGame?.pot || 0;

  // Update game state for new round with accumulated pot and clear last result
  await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      all_decisions_in: false,
      pot: currentPot + initialPot,  // Add antes to existing pot
      last_round_result: null
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
    
    // Check if player already has 3 legs (game should have ended)
    if (soloStayer.legs >= 3) {
      console.log('Player already has 3+ legs, game should have ended');
      return;
    }
    
    // Winning a leg costs 10 chips (can go negative)
    const newLegCount = soloStayer.legs + 1;
    await supabase
      .from('players')
      .update({ 
        legs: newLegCount,
        chips: soloStayer.chips - betAmount
      })
      .eq('id', soloStayer.id);
    
    // Add leg payment to pot
    await supabase
      .from('games')
      .update({ 
        pot: (game.pot || 0) + betAmount
      })
      .eq('id', gameId);
      
    resultMessage = `${username} won a leg (paid $${betAmount})`;
    
    // If this is their 3rd leg, they win the game immediately
    if (newLegCount >= 3) {
      // Calculate total value: each leg is worth 10 chips
      const legValue = newLegCount * 10;
      
      // Award the winner
      await supabase
        .from('players')
        .update({ 
          chips: soloStayer.chips - betAmount + legValue // Subtract leg payment, add prize
        })
        .eq('id', soloStayer.id);
      
      const gameWinMessage = `🏆 ${username} won ${newLegCount} legs and won the game! (+$${legValue})`;
      
      // Update game status and set winner message
      await supabase
        .from('games')
        .update({ 
          status: 'completed',
          last_round_result: gameWinMessage
        })
        .eq('id', gameId);
        
      // Mark round as completed
      await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .eq('id', round.id);
        
      return; // Exit early, game is over
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
              const amountToCharge = betAmount; // Allow negative chips
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
          
          // Add winnings to game pot
          await supabase
            .from('games')
            .update({ 
              pot: (game.pot || 0) + totalPot
            })
            .eq('id', gameId);
            
          resultMessage = `${winnerUsername} won $${totalPot} with ${handName}`;
        }
      }
    }
  } else {
    // Everyone folded - apply pussy tax
    const { data: gameData } = await supabase
      .from('games')
      .select('pussy_tax')
      .eq('id', gameId)
      .single();
    
    const pussyTax = gameData?.pussy_tax || 10;
    let taxCollected = 0;
    
    // Charge each player the pussy tax
    for (const player of allPlayers) {
      const taxAmount = pussyTax; // Allow negative chips
      taxCollected += taxAmount;
      
      await supabase
        .from('players')
        .update({ 
          chips: player.chips - taxAmount
        })
        .eq('id', player.id);
    }
    
    // Add pussy tax to pot
    await supabase
      .from('games')
      .update({ 
        pot: (game.pot || 0) + taxCollected
      })
      .eq('id', gameId);
    
    resultMessage = `PUSSY TAX INCURRED! ($${pussyTax})`;
  }

  // Store result message and keep pot (don't reset to 0 if pussy tax was collected)
  await supabase
    .from('games')
    .update({ 
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
