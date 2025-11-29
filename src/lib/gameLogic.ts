import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank } from "./cardUtils";

export async function startRound(gameId: string, roundNumber: number) {
  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('ante_amount, leg_value')
    .eq('id', gameId)
    .single();
  
  const anteAmount = gameConfig?.ante_amount || 2;
  const legValue = gameConfig?.leg_value || 1;
  const betAmount = legValue; // Bet amount per round equals leg value
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

  // Calculate pot based on active players who are not sitting out, and ante for round 1
  const activePlayers = players.filter(p => p.status === 'active' && !p.sitting_out);
  let initialPot = 0;
  
  // Ante: Each active (non-sitting-out) player pays ante amount into the pot at the start of round 1
  if (roundNumber === 1) {
    for (const player of activePlayers) {
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

  for (const player of activePlayers) {
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

  // Update game state for new round - don't set last_round_result here since it's cleared before this
  await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      all_decisions_in: false,
      pot: currentPot + initialPot  // Add antes to existing pot
    })
    .eq('id', gameId);

  return round;
}

export async function makeDecision(gameId: string, playerId: string, decision: 'stay' | 'fold') {
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
  // First check if decisions are already marked as in
  const { data: game } = await supabase
    .from('games')
    .select('all_decisions_in')
    .eq('id', gameId)
    .single();
  
  if (game?.all_decisions_in) {
    // Already processing, don't check again
    return;
  }

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false);

  if (!players) return;

  const allDecided = players.every(p => p.decision_locked);

  if (allDecided) {
    console.log('All players decided, attempting to set all_decisions_in flag');
    // Try to atomically set all_decisions_in flag
    const { data: updateResult, error } = await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId)
      .eq('all_decisions_in', false) // Only update if not already set
      .select();

    console.log('all_decisions_in update result:', { updateResult, error, resultLength: updateResult?.length });

    // Only the first call that successfully sets the flag should proceed
    if (!error && updateResult && updateResult.length > 0) {
      console.log('Successfully set all_decisions_in, calling endRound');
      // End round immediately without delay
      await endRound(gameId);
    } else {
      console.log('all_decisions_in already set by another call, skipping endRound');
    }
  }
}

export async function autoFoldUndecided(gameId: string) {
  console.log('[AUTO-FOLD] Starting autoFoldUndecided for game:', gameId);
  
  // Get players who haven't decided yet (active and not sitting out)
  const { data: undecidedPlayers, error: fetchError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .is('decision_locked', false);

  if (fetchError) {
    console.error('[AUTO-FOLD] Error fetching undecided players:', fetchError);
    return;
  }

  if (!undecidedPlayers || undecidedPlayers.length === 0) {
    console.log('[AUTO-FOLD] No undecided players found, checking if round should end');
    await checkAllDecisionsIn(gameId);
    return;
  }

  console.log('[AUTO-FOLD] Auto-folding', undecidedPlayers.length, 'undecided players');

  // Auto-fold all undecided players
  for (const player of undecidedPlayers) {
    const { error: foldError } = await supabase
      .from('players')
      .update({ 
        current_decision: 'fold',
        decision_locked: true,
        status: 'folded'
      })
      .eq('id', player.id);
    
    if (foldError) {
      console.error('[AUTO-FOLD] Error folding player:', player.id, foldError);
    }
  }

  console.log('[AUTO-FOLD] Checking all decisions after auto-fold');
  // Check if all decisions are in and end round if needed
  await checkAllDecisionsIn(gameId);
}


export async function endRound(gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  if (!game || !game.current_round) return;

  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('leg_value, legs_to_win, pot_max_enabled, pot_max_value, pussy_tax_enabled, pussy_tax_value')
    .eq('id', gameId)
    .single();
  
  const legValue = gameConfig?.leg_value || 1;
  const legsToWin = gameConfig?.legs_to_win || 3;
  const potMaxEnabled = gameConfig?.pot_max_enabled ?? true;
  const potMaxValue = gameConfig?.pot_max_value || 10;
  const pussyTaxEnabled = gameConfig?.pussy_tax_enabled ?? true;
  const pussyTaxValue = gameConfig?.pussy_tax_value || 1;
  const betAmount = legValue;

  const currentRound = game.current_round;

  // Get all player hands for this round
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', currentRound)
    .single();

  if (!round) return;
  
  // Prevent duplicate calls - if round is already completed, don't process again
  if (round.status === 'completed') {
    console.log('[endRound] Round already completed, skipping endRound');
    return;
  }

  // Immediately mark round as completed to prevent race conditions
  console.log('[endRound] Attempting to lock round:', round.id, 'current status:', round.status);
  const { data: lockResult, error: lockError } = await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('id', round.id)
    .eq('status', 'betting') // Only update if still in betting status
    .select();

  console.log('[endRound] Lock result:', { lockError, resultLength: lockResult?.length });

  // If no rows were updated, another call is already processing
  if (lockError || !lockResult || lockResult.length === 0) {
    console.log('[endRound] Round already being processed or completed, skipping endRound');
    return;
  }

  console.log('[endRound] Successfully locked round for processing');

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
    
    // Check if player already has enough legs (game should have ended)
    if (soloStayer.legs >= legsToWin) {
      console.log(`Player already has ${legsToWin}+ legs, game should have ended`);
      return;
    }
    
    // Winning a leg costs the leg value (can go negative)
    const newLegCount = soloStayer.legs + 1;
    const newChips = soloStayer.chips - betAmount;
    
    await supabase
      .from('players')
      .update({ 
        legs: newLegCount,
        chips: newChips
      })
      .eq('id', soloStayer.id);
      
    resultMessage = `${username} won a leg`;
    
    // If this is their final leg, they win the game immediately
    if (newLegCount >= legsToWin) {
      console.log('Player won the game!', { username, newLegCount, legsToWin, playerId: soloStayer.id });
      
      // Calculate total leg value across all players BEFORE resetting
      const totalLegValue = allPlayers.reduce((sum, p) => {
        // Use newLegCount for the winner, current legs for others
        const playerLegs = p.id === soloStayer.id ? newLegCount : p.legs;
        return sum + (playerLegs * legValue);
      }, 0);
      
      console.log('Total leg value calculated:', { totalLegValue });
      
      // Winner gets the pot PLUS total leg value from all players
      const potValue = game.pot || 0;
      const totalPrize = potValue + totalLegValue;
      
      console.log('Awarding prize:', { potValue, totalLegValue, totalPrize });
      
      // Award the winner
      await supabase
        .from('players')
        .update({ 
          chips: newChips + totalPrize
        })
        .eq('id', soloStayer.id);
      
      const gameWinMessage = `🏆 ${username} won the game with ${newLegCount} legs! (+$${totalPrize}: $${potValue} pot + $${totalLegValue} legs)`;
      
      // Calculate next dealer (clockwise from current dealer) - skip bots
      const humanPlayers = allPlayers.filter(p => !p.is_bot);
      const currentDealerPosition = game.dealer_position || 1;
      
      // Find next human player after current dealer
      let nextDealerPosition = currentDealerPosition;
      for (let i = 0; i < allPlayers.length; i++) {
        nextDealerPosition = nextDealerPosition >= allPlayers.length ? 1 : nextDealerPosition + 1;
        const nextPlayer = allPlayers.find(p => p.position === nextDealerPosition);
        if (nextPlayer && !nextPlayer.is_bot) {
          break;
        }
      }
      
      // Reset all players' legs for new game and keep chips
      await supabase
        .from('players')
        .update({ 
          legs: 0,
          status: 'active',
          current_decision: null,
          decision_locked: false,
          sitting_out: false,
          ante_decision: null
        })
        .eq('game_id', gameId);
      
      // Check if session should end AFTER awarding prizes
      const { data: gameData } = await supabase
        .from('games')
        .select('pending_session_end, current_round')
        .eq('id', gameId)
        .single();
      
      if (gameData?.pending_session_end) {
        console.log('Session ending after game win - marking as session_ended');
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString(),
            total_hands: gameData.current_round || 0,
            pending_session_end: false,
            last_round_result: gameWinMessage,
            pot: 0
          })
          .eq('id', gameId);
        
        console.log('Session ended successfully after prizes awarded');
        return; // Exit early, session is ended
      }
      
      console.log('Updating game to game_over status', { nextDealerPosition, gameWinMessage });
      
      // Update game to game_over status with 5 second delay before moving to configuration
      const { error: gameOverError } = await supabase
        .from('games')
        .update({ 
          status: 'game_over',
          dealer_position: nextDealerPosition,
          current_round: null,
          awaiting_next_round: false,
          all_decisions_in: false,
          last_round_result: gameWinMessage,
          pot: 0  // Clear pot here too
        })
        .eq('id', gameId);
        
      if (gameOverError) {
        console.error('Error updating game to game_over:', gameOverError);
      } else {
        console.log('Successfully updated game to game_over');
      }
        
      console.log('Game over setup complete');
      return; // Exit early, starting new game
    }
  } else if (playersWhoStayed.length > 1) {
    // Multiple players stayed - wait briefly to show decisions, then evaluate hands
    setTimeout(async () => {
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
            
            const currentPot = game.pot || 0;
            let totalWinnings = 0;
            
            // Charge each loser and accumulate (pot stays for game winner)
            for (const player of playersWhoStayed) {
              if (player.id !== winner.playerId) {
                let amountToCharge;
                if (potMaxEnabled) {
                  // With pot max: charge current pot value, capped at pot max
                  amountToCharge = Math.min(currentPot, potMaxValue);
                } else {
                  // No pot max: charge entire current pot value
                  amountToCharge = currentPot;
                }
                totalWinnings += amountToCharge;
                
                await supabase
                  .from('players')
                  .update({ 
                    chips: player.chips - amountToCharge
                  })
                  .eq('id', player.id);
              }
            }
            
            // Award showdown winnings to winner (pot remains for game winner)
            await supabase
              .from('players')
              .update({ 
                chips: winningPlayer.chips + totalWinnings
              })
              .eq('id', winner.playerId);
            
            // Don't clear the pot - it stays for the game winner
            const showdownResult = `${winnerUsername} won $${totalWinnings} with ${handName}`;
            
            // Store result message
            await supabase
              .from('games')
              .update({ 
                last_round_result: showdownResult
              })
              .eq('id', gameId);
          }
        }
      }

      // Check if anyone has won the required number of legs
      const { data: updatedPlayers } = await supabase
        .from('players')
        .select('*, profiles(username)')
        .eq('game_id', gameId);

      const gameWinner = updatedPlayers?.find(p => p.legs >= legsToWin);

      if (gameWinner) {
        // Someone won the game - calculate total leg value across all players
        const winnerUsername = gameWinner.profiles?.username || `Player ${gameWinner.position}`;
        
        // Get current pot
        const { data: currentGameData } = await supabase
          .from('games')
          .select('pot, dealer_position')
          .eq('id', gameId)
          .single();
        
        const currentPot = currentGameData?.pot || 0;
        const currentDealerPosition = currentGameData?.dealer_position || 1;
        
        // Calculate total leg value from all players
        const totalLegValue = updatedPlayers.reduce((sum, p) => sum + (p.legs * legValue), 0);
        
        // Winner gets pot + total leg value
        const totalPrize = currentPot + totalLegValue;
        
        // Award the winner
        await supabase
          .from('players')
          .update({ 
            chips: gameWinner.chips + totalPrize
          })
          .eq('id', gameWinner.id);
        
        // Clear the pot
        await supabase
          .from('games')
          .update({ pot: 0 })
          .eq('id', gameId);
        
        const gameWinMessage = `🏆 ${winnerUsername} won the game with ${gameWinner.legs} legs! (+$${totalPrize}: $${currentPot} pot + $${totalLegValue} legs)`;
        
        // Reset all players' legs for new game and keep chips
        await supabase
          .from('players')
          .update({ 
            legs: 0,
            status: 'active',
            current_decision: null,
            decision_locked: false,
            sitting_out: false,
            ante_decision: null
          })
          .eq('game_id', gameId);
        
        // Calculate next dealer (clockwise from current dealer) - skip bots
        const humanPlayers = updatedPlayers?.filter(p => !p.is_bot) || [];
        
        // Find next human player after current dealer
        let nextDealerPosition = currentDealerPosition;
        for (let i = 0; i < (updatedPlayers?.length || 0); i++) {
          nextDealerPosition = nextDealerPosition >= (updatedPlayers?.length || 0) ? 1 : nextDealerPosition + 1;
          const nextPlayer = updatedPlayers?.find(p => p.position === nextDealerPosition);
          if (nextPlayer && !nextPlayer.is_bot) {
            break;
          }
        }
        
        // Check if session should end AFTER awarding prizes
        const { data: sessionData } = await supabase
          .from('games')
          .select('pending_session_end, current_round')
          .eq('id', gameId)
          .single();
        
        if (sessionData?.pending_session_end) {
          console.log('Session ending after showdown win - marking as session_ended');
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              session_ended_at: new Date().toISOString(),
              total_hands: sessionData.current_round || 0,
              pending_session_end: false,
              last_round_result: gameWinMessage
            })
            .eq('id', gameId);
          
          console.log('Session ended successfully after prizes awarded');
          return; // Exit early, session is ended
        }
        
        // Update game to game_over status with countdown before moving to configuration
        await supabase
          .from('games')
          .update({ 
            status: 'game_over',
            dealer_position: nextDealerPosition,
            current_round: null,
            awaiting_next_round: false,
            all_decisions_in: false,
            last_round_result: gameWinMessage
          })
          .eq('id', gameId);
      } else {
        // Continue to next round - cycle back to round 1 after round 3
        const nextRound = currentRound < 3 ? currentRound + 1 : 1;
        
        // Set game to await next round
        await supabase
          .from('games')
          .update({ 
            awaiting_next_round: true,
            next_round_number: nextRound
          })
          .eq('id', gameId);
      }
    }, 1000); // 1 second to show showdown results
    return; // Exit early since we're using setTimeout
  } else {
    // Everyone folded - apply pussy tax if enabled
    if (pussyTaxEnabled) {
      let taxCollected = 0;
      
      // Charge each player the pussy tax
      for (const player of allPlayers) {
        const taxAmount = pussyTaxValue;
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
      
      resultMessage = `PUSSY TAX INCURRED! ($${pussyTaxValue})`;
    } else {
      resultMessage = 'Everyone folded - no winner';
    }
  }

  // Store result message and keep pot (don't reset to 0 if pussy tax was collected)
  await supabase
    .from('games')
    .update({ 
      last_round_result: resultMessage
    })
    .eq('id', gameId);

  // Continue to next round - cycle back to round 1 after round 3
  const nextRound = currentRound < 3 ? currentRound + 1 : 1;
  
  // Set game to await next round
  await supabase
    .from('games')
    .update({ 
      awaiting_next_round: true,
      next_round_number: nextRound
    })
    .eq('id', gameId);
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

  // Clear the result message FIRST before starting new round
  await supabase
    .from('games')
    .update({ 
      awaiting_next_round: false,
      next_round_number: null,
      last_round_result: null
    })
    .eq('id', gameId);

  // Start the next round
  await startRound(gameId, game.next_round_number);
}
