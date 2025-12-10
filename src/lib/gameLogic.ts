import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank, has357Hand } from "./cardUtils";

export async function startRound(gameId: string, roundNumber: number) {
  console.log('[START_ROUND] Starting round', roundNumber, 'for game', gameId);
  
  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('ante_amount, leg_value, status, current_round')
    .eq('id', gameId)
    .single();
  
  // Prevent starting if already in progress with this round
  if (gameConfig?.status === 'in_progress' && gameConfig?.current_round === roundNumber) {
    console.log('[START_ROUND] Round', roundNumber, 'already in progress, skipping');
    return;
  }
  
  const anteAmount = gameConfig?.ante_amount || 2;
  const legValue = gameConfig?.leg_value || 1;
  const betAmount = legValue; // Bet amount per round equals leg value
  const cardsToDeal = roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7;

  // If starting round 1, ensure all old rounds are deleted
  if (roundNumber === 1) {
    console.log('[START_ROUND] Cleaning up old rounds for round 1');
    
    // First, mark any active rounds as completed
    await supabase
      .from('rounds')
      .update({ status: 'completed' })
      .eq('game_id', gameId)
      .neq('status', 'completed');
    
    // Delete all rounds for this game to start fresh
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      const { data: oldRounds } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId);

      if (!oldRounds || oldRounds.length === 0) {
        console.log('[START_ROUND] No old rounds to delete');
        break;
      }

      console.log('[START_ROUND] Deleting', oldRounds.length, 'old rounds');

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
        console.error('[START_ROUND] Error deleting rounds:', roundsDeleteError);
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
        console.log('[START_ROUND] Successfully deleted all rounds');
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
  const { error: playerResetError } = await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false,
      status: 'active'
    })
    .eq('game_id', gameId);
  
  if (playerResetError) {
    console.error('[START_ROUND] Failed to reset players:', playerResetError);
    throw new Error(`Failed to reset players: ${playerResetError.message}`);
  }
  
  console.log('[START_ROUND] Players reset for round', roundNumber);

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
  // CRITICAL: Check if any round already exists for this game to prevent double-charging in race conditions
  let skipPotUpdate = false;
  if (roundNumber === 1) {
    const { data: anyExistingRounds } = await supabase
      .from('rounds')
      .select('id, round_number')
      .eq('game_id', gameId)
      .limit(1);
    
    if (anyExistingRounds && anyExistingRounds.length > 0) {
      console.log('[START_ROUND] ⚠️ Round already exists for this game, skipping ante charge AND pot update to prevent double-charge');
      // Don't charge antes again, and DON'T update pot - it's already correct
      skipPotUpdate = true;
    } else {
      console.log('[START_ROUND] Charging antes. Players:', activePlayers.map(p => ({ id: p.id, position: p.position, chips_before: p.chips, is_bot: p.is_bot })));
      
      for (const player of activePlayers) {
        initialPot += anteAmount;
        
        console.log('[START_ROUND] Charging player', player.id, 'position', player.position, 'ante of $', anteAmount, 'chips before:', player.chips);
        
        await supabase
          .from('players')
          .update({ chips: player.chips - anteAmount })
          .eq('id', player.id);
      }
      
      console.log('[START_ROUND] Total ante pot:', initialPot);
    }
  }

  // Safety check: delete any existing round with same game_id and round_number to prevent duplicates
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle();
  
  if (existingRound) {
    console.log('[START_ROUND] Found existing round for game', gameId, 'round', roundNumber, '- deleting it');
    
    // Delete player_cards for this round
    await supabase
      .from('player_cards')
      .delete()
      .eq('round_id', existingRound.id);
    
    // Delete player_actions for this round
    await supabase
      .from('player_actions')
      .delete()
      .eq('round_id', existingRound.id);
    
    // Delete the round
    await supabase
      .from('rounds')
      .delete()
      .eq('id', existingRound.id);
    
    console.log('[START_ROUND] Deleted existing round');
  }

  // Fetch game_defaults for decision timer
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('decision_timer_seconds')
    .eq('game_type', '3-5-7')
    .maybeSingle();
  
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 10;
  console.log('[START_ROUND] Using decision timer:', timerSeconds, 'seconds');

  // CRITICAL: Update game state BEFORE creating round to prevent race conditions
  // This ensures current_round and all_decisions_in are correct before any realtime updates fire
  // But SKIP pot update if we already detected a race condition (existing rounds)
  if (skipPotUpdate) {
    console.log('[START_ROUND] Skipping pot update due to race condition guard');
    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        current_round: roundNumber,
        all_decisions_in: false
        // DON'T update pot - it's already correct from the first call
      })
      .eq('id', gameId);
    
    if (gameUpdateError) {
      console.error('[START_ROUND] Failed to update game state:', gameUpdateError);
      throw new Error(`Failed to update game state: ${gameUpdateError.message}`);
    }
  } else {
    const { data: currentGameForPot } = await supabase
      .from('games')
      .select('pot')
      .eq('id', gameId)
      .single();
    
    const currentPot = currentGameForPot?.pot || 0;
    
    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        current_round: roundNumber,
        all_decisions_in: false,
        pot: currentPot + initialPot  // Add antes to existing pot
      })
      .eq('id', gameId);
    
    if (gameUpdateError) {
      console.error('[START_ROUND] Failed to update game state:', gameUpdateError);
      throw new Error(`Failed to update game state: ${gameUpdateError.message}`);
    }
  }
  
  console.log('[START_ROUND] Game state updated: current_round =', roundNumber, ', all_decisions_in = false');

  // Create round with configured deadline (accounts for ~2s of processing/fetch time)
  const deadline = new Date(Date.now() + (timerSeconds + 2) * 1000);
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

  // Deal cards - create deck and remove already dealt cards
  let deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Get previous round cards if this isn't round 1
  let previousRoundCards: Map<string, Card[]> = new Map();
  let alreadyDealtCards: Card[] = [];
  
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
          const cards = pc.cards as unknown as Card[];
          previousRoundCards.set(pc.player_id, cards);
          // Track all cards already dealt
          alreadyDealtCards.push(...cards);
        });
      }
    }
  }
  
  // Remove already dealt cards from the deck
  if (alreadyDealtCards.length > 0) {
    deck = deck.filter(card => {
      return !alreadyDealtCards.some(dealt => 
        dealt.suit === card.suit && dealt.rank === card.rank
      );
    });
    console.log('[START_ROUND] Removed', alreadyDealtCards.length, 'already dealt cards, deck now has', deck.length, 'cards');
  }

  const newCardsToDeal = roundNumber === 1 ? 3 : 2; // Round 1 gets 3, rounds 2 & 3 get 2 new cards

  for (const player of activePlayers) {
    // Get existing cards from previous round (if any)
    const existingCards = previousRoundCards.get(player.id) || [];
    
    // TEMPORARY TEST: Force deal 3-5-7 to Happach in round 1
    let playerCards: Card[];
    if (roundNumber === 1) {
      // Check if this player is Happach
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', player.user_id)
        .single();
      
      if (profile?.username?.toLowerCase() === 'happach') {
        // Force deal 3-5-7 (different suits for visibility)
        playerCards = [
          { rank: '3', suit: '♥' },
          { rank: '5', suit: '♠' },
          { rank: '7', suit: '♦' }
        ];
        console.log('[TEST] Forcing 3-5-7 hand for Happach!');
      } else {
        // Normal dealing for other players
        const newCards = deck.slice(cardIndex, cardIndex + newCardsToDeal);
        cardIndex += newCardsToDeal;
        playerCards = [...existingCards, ...newCards];
      }
    } else {
      // Normal dealing for rounds 2 and 3
      const newCards = deck.slice(cardIndex, cardIndex + newCardsToDeal);
      cardIndex += newCardsToDeal;
      playerCards = [...existingCards, ...newCards];
    }

    await supabase
      .from('player_cards')
      .insert({
        player_id: player.id,
        round_id: round.id,
        cards: playerCards as any
      });
  }

  return round;
}

export async function makeDecision(gameId: string, playerId: string, decision: 'stay' | 'fold') {
  console.log('[MAKE DECISION] Starting:', { gameId, playerId, decision });
  
  // Get current game and round
  const { data: game } = await supabase
    .from('games')
    .select('*, rounds(*)')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.log('[MAKE DECISION] Game not found');
    throw new Error('Game not found');
  }

  console.log('[MAKE DECISION] Game status:', game.status, 'Type:', game.game_type);

  const currentRound = (game.rounds as any[]).find((r: any) => r.round_number === game.current_round);
  if (!currentRound) {
    console.log('[MAKE DECISION] Round not found');
    throw new Error('Round not found');
  }

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  if (!player) {
    console.log('[MAKE DECISION] Player not found');
    throw new Error('Player not found');
  }

  console.log('[MAKE DECISION] Player found:', { position: player.position, currentDecision: player.current_decision, decisionLocked: player.decision_locked });

  // Prevent double-clicking - if player has already locked in a decision, don't allow changes
  if (player.decision_locked) {
    console.log('[MAKE DECISION] Player has already locked in a decision, ignoring new decision');
    return;
  }

  // Lock in decision - no chips deducted yet
  const isHolmGame = game.game_type === 'holm-game';
  
  if (decision === 'stay') {
    await supabase
      .from('players')
      .update({ 
        current_decision: 'stay',
        decision_locked: true
      })
      .eq('id', playerId);
    console.log('[MAKE DECISION] Stay decision locked in database');
  } else {
    // In Holm game, folding only affects current hand - keep status 'active'
    // In 3-5-7 game, folding eliminates player from entire session - set status 'folded'
    await supabase
      .from('players')
      .update({ 
        current_decision: 'fold',
        decision_locked: true,
        ...(isHolmGame ? {} : { status: 'folded' })
      })
      .eq('id', playerId);
    console.log('[MAKE DECISION] Fold decision locked in database');
  }

  console.log('[MAKE DECISION] Is Holm game?', isHolmGame);
  
  if (!isHolmGame) {
    // Check if all players have decided (only for non-Holm games)
    await checkAllDecisionsIn(gameId);
  }
  
  console.log('[MAKE DECISION] Complete');
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
      try {
        await endRound(gameId);
        console.log('[CHECK_DECISIONS] endRound completed successfully');
      } catch (endRoundError) {
        console.error('[CHECK_DECISIONS] Error in endRound:', endRoundError);
      }
    } else {
      console.log('all_decisions_in already set by another call, skipping endRound');
    }
  }
}

export async function autoFoldUndecided(gameId: string) {
  console.log('[AUTO-FOLD] Starting autoFoldUndecided for game:', gameId);
  
  // Get game type first
  const { data: game } = await supabase
    .from('games')
    .select('game_type')
    .eq('id', gameId)
    .single();
  
  const isHolmGame = game?.game_type === 'holm-game';
  
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
  // In Holm game, keep status 'active' so they can play next hand
  for (const player of undecidedPlayers) {
    const { error: foldError } = await supabase
      .from('players')
      .update({ 
        current_decision: 'fold',
        decision_locked: true,
        ...(isHolmGame ? {} : { status: 'folded' })
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


// Centralized game-over handler to ensure consistency
async function handleGameOver(
  gameId: string,
  winnerId: string,
  winnerUsername: string,
  winnerLegs: number,
  allPlayers: any[],
  currentPot: number,
  legValue: number,
  legsToWin: number,
  currentDealerPosition: number
) {
  console.log('[HANDLE GAME OVER] Starting game over handler', { winnerId, winnerUsername, winnerLegs });
  
  // Get current total_hands to increment it
  const { data: currentGameData } = await supabase
    .from('games')
    .select('total_hands')
    .eq('id', gameId)
    .single();
  
  const newTotalHands = (currentGameData?.total_hands || 0) + 1;
  
  // Calculate total leg value from all players
  const totalLegValue = allPlayers.reduce((sum, p) => {
    const playerLegs = p.id === winnerId ? winnerLegs : p.legs;
    return sum + (playerLegs * legValue);
  }, 0);
  
  // Winner gets pot + total leg value
  const totalPrize = currentPot + totalLegValue;
  
  console.log('[HANDLE GAME OVER] Awarding prize:', { currentPot, totalLegValue, totalPrize });
  
  // Award the winner
  await supabase
    .from('players')
    .update({ chips: allPlayers.find(p => p.id === winnerId)!.chips + totalPrize })
    .eq('id', winnerId);
  
  const gameWinMessage = `🏆 ${winnerUsername} won the game with ${winnerLegs} legs! (+$${totalPrize}: $${currentPot} pot + $${totalLegValue} legs)`;
  
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
  
  // NOTE: Dealer rotation is NOT done here anymore - it's done in handleGameOverComplete
  // after evaluating player states (sit_out_next_hand, stand_up_next_hand, etc.)
  // This prevents double-rotation and ensures player state is considered before selecting next dealer
  
  console.log('[HANDLE GAME OVER] Keeping current dealer position:', currentDealerPosition, '(rotation happens in handleGameOverComplete)');
  
  // Check if session should end AFTER awarding prizes
  const { data: sessionData } = await supabase
    .from('games')
    .select('pending_session_end, current_round')
    .eq('id', gameId)
    .single();
  
  if (sessionData?.pending_session_end) {
    console.log('[HANDLE GAME OVER] Session ending - marking as session_ended');
    await supabase
      .from('games')
      .update({
        status: 'session_ended',
        session_ended_at: new Date().toISOString(),
        game_over_at: new Date().toISOString(),
        total_hands: newTotalHands,
        pending_session_end: false,
        last_round_result: gameWinMessage,
        pot: 0
      })
      .eq('id', gameId);
    
    console.log('[HANDLE GAME OVER] Session ended successfully');
    return;
  }
  
  console.log('[HANDLE GAME OVER] Setting game_over status');
  
  // Update game to game_over status - SINGLE atomic update with ALL required fields
  // NOTE: dealer_position stays the same here - rotation happens in handleGameOverComplete
  const { data: gameOverUpdate, error: gameOverError } = await supabase
    .from('games')
    .update({ 
      status: 'game_over',
      // dealer_position is NOT updated here - rotation happens after player state evaluation
      current_round: null,
      awaiting_next_round: false,
      all_decisions_in: false,
      last_round_result: gameWinMessage,
      game_over_at: new Date().toISOString(),
      pot: 0,  // Critical: always reset pot
      total_hands: newTotalHands
    })
    .eq('id', gameId)
    .select();
  
  if (gameOverError) {
    console.error('[HANDLE GAME OVER] ERROR updating game:', gameOverError);
    throw gameOverError;
  }
  
  console.log('[HANDLE GAME OVER] Game over setup complete', { 
    updateSuccess: !!gameOverUpdate,
    rowsUpdated: gameOverUpdate?.length,
    gameStatus: gameOverUpdate?.[0]?.status,
    gameOverAt: gameOverUpdate?.[0]?.game_over_at,
    pot: gameOverUpdate?.[0]?.pot
  });
}

export async function endRound(gameId: string) {
  console.log('[endRound] Starting endRound for game:', gameId);
  
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  console.log('[endRound] Game data:', { 
    hasGame: !!game, 
    currentRound: game?.current_round,
    status: game?.status,
    error: gameError 
  });

  if (!game || !game.current_round) {
    console.log('[endRound] Early return: no game or no current_round');
    return;
  }

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
  const { data: allPlayers, error: playersError } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId);

  console.log('[endRound] Players fetched:', { 
    count: allPlayers?.length, 
    error: playersError,
    players: allPlayers?.map(p => ({
      position: p.position,
      status: p.status,
      decision: p.current_decision,
      locked: p.decision_locked
    }))
  });

  if (!allPlayers) {
    console.log('[endRound] ERROR: No players found, exiting');
    return;
  }

  // Find players who stayed (didn't fold)
  const playersWhoStayed = allPlayers.filter(p => p.current_decision === 'stay');
  
  console.log('[endRound] Players who stayed:', {
    count: playersWhoStayed.length,
    positions: playersWhoStayed.map(p => p.position)
  });
  
  let resultMessage = '';

  // ============ 357 SWEEP CHECK (Round 1 only) ============
  // If any player who stayed has 3, 5, 7 in round 1, they sweep the pot and win all legs instantly
  if (currentRound === 1) {
    const { data: playerCardsFor357 } = await supabase
      .from('player_cards')
      .select('*')
      .eq('round_id', round.id);
    
    if (playerCardsFor357 && playerCardsFor357.length > 0) {
      for (const pc of playerCardsFor357) {
        const player = playersWhoStayed.find(p => p.id === pc.player_id);
        if (player) {
          const cards = pc.cards as unknown as Card[];
          if (has357Hand(cards)) {
            const username = player.profiles?.username || `Player ${player.position}`;
            console.log('[endRound] 🎉 357 SWEEP DETECTED!', { playerId: player.id, username, cards });
            
            // Award all legs needed to win
            const currentPot = game.pot || 0;
            
            // Give winner all the legs
            await supabase
              .from('players')
              .update({ legs: legsToWin })
              .eq('id', player.id);
            
            // Set the special result message for 357 sweep
            const sweepMessage = `357_SWEEP:${username}`;
            
            // Set awaiting_next_round with special sweep message
            await supabase
              .from('games')
              .update({ 
                last_round_result: sweepMessage,
                awaiting_next_round: true,
                next_round_number: 1
              })
              .eq('id', gameId);
            
            // After 5 seconds (animation duration), trigger game over
            setTimeout(async () => {
              // Fetch fresh player data
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*, profiles(username)')
                .eq('game_id', gameId);
              
              await handleGameOver(
                gameId,
                player.id,
                username,
                legsToWin,
                freshPlayers || allPlayers,
                currentPot,
                legValue,
                legsToWin,
                game.dealer_position || 1
              );
            }, 5000);
            
            return; // Exit - 357 sweep handled
          }
        }
      }
    }
  }
  // ============ END 357 SWEEP CHECK ============

  // Award leg only if exactly one player stayed
  if (playersWhoStayed.length === 1) {
    console.log('[endRound] SOLO STAY detected - awarding leg');
    const soloStayer = playersWhoStayed[0];
    const username = soloStayer.profiles?.username || `Player ${soloStayer.position}`;
    
    // Check if player already has enough legs (game should have ended)
    if (soloStayer.legs >= legsToWin) {
      console.log(`[endRound] Player already has ${legsToWin}+ legs, game should have ended`);
      return;
    }
    
    console.log('[endRound] Awarding leg to solo stayer:', {
      playerId: soloStayer.id,
      currentLegs: soloStayer.legs,
      currentChips: soloStayer.chips,
      betAmount
    });
    
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
    
    console.log('[endRound] Leg awarded:', {
      newLegCount,
      newChips,
      legsToWin,
      isFinalLeg: newLegCount >= legsToWin
    });
    
    // If this is their final leg, they win the game immediately
    if (newLegCount >= legsToWin) {
      console.log('[SOLO WIN] Player won the game!', { username, newLegCount, legsToWin, playerId: soloStayer.id });
      
      // Set result message and awaiting state so user sees the leg win
      const nextRound = currentRound < 3 ? currentRound + 1 : 1;
      await supabase
        .from('games')
        .update({ 
          last_round_result: resultMessage,
          awaiting_next_round: true,
          next_round_number: nextRound
        })
        .eq('id', gameId);
      
      // Fetch fresh player data after the leg/chips update above
      const { data: freshPlayers } = await supabase
        .from('players')
        .select('*, profiles(username)')
        .eq('game_id', gameId);
      
      // Wait 4 seconds to show "won a leg" message, then transition to game over
      setTimeout(async () => {
        // Use centralized game-over handler with fresh data
        await handleGameOver(
          gameId,
          soloStayer.id,
          username,
          newLegCount,
          freshPlayers || allPlayers,
          game.pot || 0,
          legValue,
          legsToWin,
          game.dealer_position || 1
        );
      }, 4000);
      
      return; // Exit early, game over will be handled after delay
    }
    
    console.log('[endRound] Not final leg, continuing to set awaiting_next_round');
    // If not final leg, just continue - result message will be set at end of function
  } else if (playersWhoStayed.length > 1) {
    console.log('[endRound] SHOWDOWN: Multiple players stayed, evaluating hands');
    // Multiple players stayed - evaluate hands for showdown
    const { data: playerCards, error: cardsError } = await supabase
      .from('player_cards')
      .select('*')
      .eq('round_id', round.id);

    console.log('[endRound] SHOWDOWN: Player cards fetch result:', {
      roundId: round.id,
      cardsCount: playerCards?.length,
      error: cardsError,
      hasCards: !!playerCards
    });

    if (playerCards && playerCards.length > 0) {
      console.log('[endRound] SHOWDOWN: Processing cards for evaluation');
      // Only evaluate hands of players who stayed
      // 3-5-7 game uses wildcards based on round
      const hands = playerCards
        .filter(pc => playersWhoStayed.some(p => p.id === pc.player_id))
        .map(pc => ({
          playerId: pc.player_id,
          cards: pc.cards as unknown as Card[],
          evaluation: evaluateHand(pc.cards as unknown as Card[], true) // 3-5-7 uses wildcards
        }));

      console.log('[endRound] SHOWDOWN: Hands evaluated:', {
        handsCount: hands.length,
        hands: hands.map(h => ({
          playerId: h.playerId,
          rank: h.evaluation.rank,
          value: h.evaluation.value
        }))
      });

      if (hands.length > 0) {
        // Find winner
        const winner = hands.reduce((best, current) => 
          current.evaluation.value > best.evaluation.value ? current : best
        );

        console.log('[endRound] SHOWDOWN: Winner determined:', {
          winnerId: winner.playerId,
          winnerRank: winner.evaluation.rank,
          winnerValue: winner.evaluation.value
        });

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
          
          console.log('[endRound] SHOWDOWN: Result determined:', {
            winner: winnerUsername,
            winnings: totalWinnings,
            handName,
            resultMessage: showdownResult
          });
          
          resultMessage = showdownResult;
        } else {
          console.log('[endRound] SHOWDOWN: ERROR - No winning player found');
        }
      } else {
        console.log('[endRound] SHOWDOWN: ERROR - No hands to evaluate');
      }
    } else {
      console.log('[endRound] SHOWDOWN: ERROR - No player cards found or empty array');
    }

    // Showdowns never end the game - continue to next round
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    
    console.log('[endRound] SHOWDOWN: Preparing to set awaiting_next_round', {
      gameId,
      currentRound,
      nextRound,
      resultMessage,
      hasResultMessage: resultMessage.length > 0
    });
    
    // Set game to await next round with result visible
    // Frontend will handle the 4-second delay before starting next round
    const { data: updateResult, error: updateError } = await supabase
      .from('games')
      .update({ 
        awaiting_next_round: true,
        next_round_number: nextRound,
        last_round_result: resultMessage  // Set result message here atomically
        // proceedToNextRound will clear it after 4 seconds
      })
      .eq('id', gameId)
      .select();
    
    console.log('[endRound] SHOWDOWN: awaiting_next_round update result:', {
      error: updateError,
      rowsUpdated: updateResult?.length,
      awaiting: updateResult?.[0]?.awaiting_next_round
    });
    
    return; // Exit after showdown handling
  } else {
    // Everyone folded - apply pussy tax if enabled
    if (pussyTaxEnabled) {
      // Reset player statuses so chip animations are visible
      await supabase
        .from('players')
        .update({ 
          status: 'active',
          current_decision: null
        })
        .eq('game_id', gameId);
      
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
      
      resultMessage = `PUSSY TAX!`;
    } else {
      resultMessage = 'Everyone folded - no winner';
    }
  }

  // Only set awaiting_next_round if we're not ending the game
  // Check if game is over by re-fetching to see if status was set to game_over
  const { data: finalGameState } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single();
  
  console.log('[endRound] Final check before setting awaiting_next_round:', {
    finalGameStatus: finalGameState?.status,
    resultMessage,
    currentRound,
    willSetAwaiting: finalGameState?.status !== 'game_over'
  });
  
  if (finalGameState?.status !== 'game_over') {
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    
    console.log('[endRound] Setting awaiting_next_round:', { nextRound, resultMessage });
    
    await supabase
      .from('games')
      .update({ 
        last_round_result: resultMessage,
        awaiting_next_round: true,
        next_round_number: nextRound
      })
      .eq('id', gameId);
      
    console.log('[endRound] awaiting_next_round set successfully');
  } else {
    console.log('[endRound] Game is over, not setting awaiting_next_round');
  }
  
  console.log('[endRound] ========== endRound COMPLETE ==========');
}

export async function proceedToNextRound(gameId: string) {
  console.log('[PROCEED_NEXT_ROUND] Starting for game', gameId);
  
  // Get the next round number
  const { data: game } = await supabase
    .from('games')
    .select('next_round_number, status, awaiting_next_round')
    .eq('id', gameId)
    .single();

  if (!game?.next_round_number) {
    console.log('[PROCEED_NEXT_ROUND] No next round configured');
    return;
  }
  
  // Guard against multiple calls
  if (!game.awaiting_next_round) {
    console.log('[PROCEED_NEXT_ROUND] Not awaiting next round, skipping');
    return;
  }

  console.log('[PROCEED_NEXT_ROUND] Proceeding to round', game.next_round_number);

  // Clear result and reset awaiting flag atomically
  const { data: updateResult } = await supabase
    .from('games')
    .update({ 
      awaiting_next_round: false,
      next_round_number: null,
      last_round_result: null  // Clear result now that we're transitioning
    })
    .eq('id', gameId)
    .eq('awaiting_next_round', true)  // Only update if still awaiting
    .select();
  
  // Only proceed if we successfully updated (prevents race conditions)
  if (!updateResult || updateResult.length === 0) {
    console.log('[PROCEED_NEXT_ROUND] Another process already proceeding, skipping');
    return;
  }

  // Start the next round
  await startRound(gameId, game.next_round_number);
  console.log('[PROCEED_NEXT_ROUND] Successfully started round', game.next_round_number);
}
