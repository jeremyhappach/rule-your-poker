import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank } from "./cardUtils";

/**
 * Rotate buck to next player after a decision in Holm game
 * Also check if all players have decided
 */
export async function rotateBuck(gameId: string) {
  console.log('[HOLM BUCK] Starting buck rotation for game:', gameId);
  
  const { data: game } = await supabase
    .from('games')
    .select('buck_position')
    .eq('id', gameId)
    .single();
    
  if (!game) {
    console.log('[HOLM BUCK] Game not found');
    return;
  }
  
  console.log('[HOLM BUCK] Current buck position:', game.buck_position);
  
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');
    
  if (!players || players.length === 0) {
    console.log('[HOLM BUCK] No active players found');
    return;
  }
  
  console.log('[HOLM BUCK] Players:', players.map(p => ({
    position: p.position,
    decided: p.decision_locked,
    decision: p.current_decision
  })));
  
  // Check if all players have decided (must have both decision_locked AND a current_decision)
  const allDecided = players.every(p => p.decision_locked && p.current_decision !== null);
  
  console.log('[HOLM BUCK] All players decided?', allDecided);
  
  if (allDecided) {
    console.log('[HOLM BUCK] All players decided, setting all_decisions_in flag and calling endHolmRound');
    await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId);
    
    // End the round
    await endHolmRound(gameId);
    return;
  }
  
  // Find next player who hasn't decided yet
  const positions = players.map(p => p.position).sort((a, b) => a - b);
  const currentBuckIndex = positions.indexOf(game.buck_position);
  
  console.log('[HOLM BUCK] Finding next undecided player. Current index:', currentBuckIndex, 'Positions:', positions);
  
  // Find next undecided player (wrap around)
  let nextBuckIndex = (currentBuckIndex + 1) % positions.length;
  let attempts = 0;
  
  while (attempts < positions.length) {
    const nextPosition = positions[nextBuckIndex];
    const nextPlayer = players.find(p => p.position === nextPosition);
    
    console.log('[HOLM BUCK] Checking position', nextPosition, 'decided?', nextPlayer?.decision_locked, 'decision:', nextPlayer?.current_decision);
    
    if (nextPlayer && (!nextPlayer.decision_locked || nextPlayer.current_decision === null)) {
      // Found next undecided player
      console.log('[HOLM BUCK] Found next undecided player at position:', nextPosition);
      
      // Update buck position and reset decision deadline for new player
      const newDeadline = new Date(Date.now() + 15000).toISOString();
      
      // Get current round to update deadline
      const { data: currentGame } = await supabase
        .from('games')
        .select('current_round')
        .eq('id', gameId)
        .single();
      
      if (currentGame?.current_round) {
        await supabase
          .from('rounds')
          .update({ decision_deadline: newDeadline })
          .eq('game_id', gameId)
          .eq('round_number', currentGame.current_round);
      }
      
      await supabase
        .from('games')
        .update({ buck_position: nextPosition })
        .eq('id', gameId);
        
      console.log('[HOLM BUCK] Buck rotated from', game.buck_position, 'to', nextPosition, 'with new deadline');
      return;
    }
    
    // Try next position
    nextBuckIndex = (nextBuckIndex + 1) % positions.length;
    attempts++;
  }
  
  // If we get here, all players have decided (shouldn't happen but just in case)
  console.log('[HOLM BUCK] No undecided players found during rotation, ending round');
  await supabase
    .from('games')
    .update({ all_decisions_in: true })
    .eq('id', gameId);
  await endHolmRound(gameId);
}


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
  const dealerPosition = gameConfig.dealer_position || 1;
  
  // Buck starts one position to the left of dealer
  // If we have 7 seats and dealer is at position 1, buck starts at position 7
  const { data: allPlayers } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position');
  
  const maxPosition = allPlayers && allPlayers.length > 0 
    ? Math.max(...allPlayers.map(p => p.position))
    : 7;
  
  const buckPosition = dealerPosition === 1 ? maxPosition : dealerPosition - 1;
  
  console.log('[HOLM] Buck position calculation:', {
    dealerPosition,
    maxPosition,
    playerPositions: allPlayers?.map(p => p.position),
    calculatedBuckPosition: buckPosition
  });

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

  // Calculate pot from antes (only for round 1)
  let initialPot = gameConfig.pot || 0;
  
  if (roundNumber === 1) {
    for (const player of players) {
      initialPot += anteAmount;
    }
  }

  // Check if round already exists to prevent duplicates
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .single();

  if (existingRound) {
    console.log('[HOLM] Round', roundNumber, 'already exists. Resetting round state...');
    
    // Reset player decisions first
    await supabase
      .from('players')
      .update({ 
        current_decision: null,
        decision_locked: false
      })
      .eq('game_id', gameId);
    
    // Reset the existing round state for the new hand
    const deadline = new Date(Date.now() + 15000);
    await supabase
      .from('rounds')
      .update({
        status: 'betting',
        pot: initialPot,
        decision_deadline: deadline.toISOString(),
        community_cards_revealed: 2,
        chucky_active: false,
        chucky_cards: null
      })
      .eq('id', existingRound.id);
    
    // Update game state
    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: roundNumber,
        pot: initialPot,
        buck_position: buckPosition,
        all_decisions_in: false
      })
      .eq('id', gameId);
    
    console.log('[HOLM] Round and game state reset for new hand:', {
      pot: initialPot,
      buck_position: buckPosition,
      current_round: roundNumber
    });
    return;
  }

  // Reset player decisions
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false
    })
    .eq('game_id', gameId);

  // Deduct antes from player chips (only for round 1)
  if (roundNumber === 1) {
    for (const player of players) {
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
    console.error('[HOLM] Failed to create round:', roundError);
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

  // Update game status and set buck position
  await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: roundNumber,
      pot: initialPot,
      buck_position: buckPosition,
      all_decisions_in: false
    })
    .eq('id', gameId);

  console.log('[HOLM] Round started successfully');
}

/**
 * Handle end of Holm round
 * - Reveal all 4 community cards immediately
 * - Deal Chucky if only one player stayed
 * - Wait before evaluation
 */
export async function endHolmRound(gameId: string) {
  console.log('[HOLM END] ========== Starting endHolmRound for game:', gameId, '==========');

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.log('[HOLM END] ERROR: Game not found');
    return;
  }

  console.log('[HOLM END] Game data:', {
    current_round: game.current_round,
    pot: game.pot,
    status: game.status
  });

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', game.current_round)
    .single();

  if (!round) {
    console.log('[HOLM END] ERROR: Round not found for round_number:', game.current_round);
    return;
  }

  console.log('[HOLM END] Round data:', {
    id: round.id,
    status: round.status,
    community_cards_revealed: round.community_cards_revealed,
    chucky_active: round.chucky_active
  });

  // Extract community cards for later use
  const communityCards = (round.community_cards as unknown as Card[]) || [];
  console.log('[HOLM END] Community cards:', communityCards);

  // Get all players and their decisions
  const { data: players } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId)
    .order('position');

  if (!players) {
    console.log('[HOLM END] ERROR: No players found');
    return;
  }

  const stayedPlayers = players.filter(p => p.current_decision === 'stay');
  const activePlayers = players.filter(p => p.status === 'active' && !p.sitting_out);

  console.log('[HOLM END] Player decisions:', {
    total: players.length,
    stayed: stayedPlayers.length,
    folded: players.length - stayedPlayers.length,
    stayedPositions: stayedPlayers.map(p => p.position)
  });

  // Case 1: Everyone folded - pussy tax
  if (stayedPlayers.length === 0) {
    console.log('[HOLM END] Case 1: Everyone folded, applying pussy tax');
    const pussyTaxEnabled = game.pussy_tax_enabled ?? true;
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

    console.log('[HOLM END] Updating game with pussy tax result:', resultMessage);

    await supabase
      .from('games')
      .update({
        last_round_result: resultMessage,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);

    await supabase
      .from('rounds')
      .update({ status: 'completed' })
      .eq('id', round.id);

    console.log('[HOLM END] Pussy tax case completed');
    return;
  }

  // Reveal all 4 community cards first
  console.log('[HOLM END] Revealing all 4 community cards...', {
    roundId: round.id,
    currentlyRevealed: round.community_cards_revealed,
    targetRevealed: 4
  });
  
  const { data: revealResult, error: revealError } = await supabase
    .from('rounds')
    .update({ community_cards_revealed: 4 })
    .eq('id', round.id)
    .select();

  console.log('[HOLM END] Community cards reveal result:', { 
    success: !revealError, 
    error: revealError,
    updatedRows: revealResult?.length,
    revealedData: revealResult?.[0]
  });
  
  if (revealError) {
    console.error('[HOLM END] ERROR revealing community cards:', revealError);
  }
  
  // Wait 5 seconds to ensure UI receives realtime update and displays all community cards
  console.log('[HOLM END] Waiting 5 seconds for community cards to be displayed...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('[HOLM END] Community cards should now be visible to players');

  // Case 2: Only one player stayed - play against Chucky
  if (stayedPlayers.length === 1) {
    console.log('[HOLM END] Case 2: Single player vs Chucky - evaluating player hand...');
    
    const player = stayedPlayers[0];
    
    // Get player's cards
    const { data: playerCardsData } = await supabase
      .from('player_cards')
      .select('*')
      .eq('player_id', player.id)
      .eq('round_id', round.id)
      .single();

    if (playerCardsData) {
      const playerCards = playerCardsData.cards as unknown as Card[];
      const playerAllCards = [...playerCards, ...communityCards];
      const playerEval = evaluateHand(playerAllCards);
      const playerUsername = player.profiles?.username || player.user_id;
      
      console.log('[HOLM END] Player has:', formatHandRank(playerEval.rank));
      
      // Store player's hand ranking in game for display
      await supabase
        .from('games')
        .update({ 
          last_round_result: `${playerUsername} has ${formatHandRank(playerEval.rank)}. Dealing Chucky...`
        })
        .eq('id', gameId);
    }
    
    // Wait 3 seconds to show player's hand
    console.log('[HOLM END] Waiting 3 seconds to display player hand...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Deal Chucky's cards and store them
    console.log('[HOLM END] Now dealing Chucky cards...');
    const deck = shuffleDeck(createDeck());
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards = deck.slice(0, chuckyCardCount);

    console.log('[HOLM END] Chucky dealt', chuckyCardCount, 'cards:', chuckyCards);

    // Store all Chucky's cards but don't reveal any yet
    await supabase
      .from('rounds')
      .update({ 
        chucky_cards: chuckyCards as any,
        chucky_active: true,
        chucky_cards_revealed: 0
      })
      .eq('id', round.id);

    console.log('[HOLM END] Chucky cards stored, revealing one at a time...');
    
    // Reveal Chucky's cards one at a time
    for (let i = 1; i <= chuckyCardCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between each card
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: i })
        .eq('id', round.id);
      console.log('[HOLM END] Revealed Chucky card', i, 'of', chuckyCardCount);
    }
    
    console.log('[HOLM END] All Chucky cards revealed');

    // Brief pause before evaluation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await handleChuckyShowdown(gameId, round.id, player, communityCards, game, chuckyCards);
    return;
  }

  // Case 3: Multiple players stayed - showdown (no Chucky)
  console.log('[HOLM END] Case 3: Multi-player showdown (no Chucky)');
  
  // Brief pause before evaluation
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await handleMultiPlayerShowdown(gameId, round.id, stayedPlayers, communityCards, game);
}

/**
 * Handle showdown against Chucky (ghost player)
 */
async function handleChuckyShowdown(
  gameId: string, 
  roundId: string, 
  player: any, 
  communityCards: Card[],
  game: any,
  chuckyCards: Card[]
) {
  console.log('[HOLM SHOWDOWN] ========== Starting Chucky showdown ==========');
  console.log('[HOLM SHOWDOWN] Player:', player.id, 'position:', player.position);
  console.log('[HOLM SHOWDOWN] Chucky cards:', chuckyCards);
  console.log('[HOLM SHOWDOWN] Community cards:', communityCards);

  // Get player's cards
  const { data: playerCardsData } = await supabase
    .from('player_cards')
    .select('*')
    .eq('player_id', player.id)
    .eq('round_id', roundId)
    .single();

  if (!playerCardsData) {
    console.log('[HOLM SHOWDOWN] ERROR: Player cards not found');
    return;
  }

  const playerCards = playerCardsData.cards as unknown as Card[];
  console.log('[HOLM SHOWDOWN] Player cards:', playerCards);

  // Evaluate hands (best 5 from 4 player + 4 community for player, best 5 from X chucky + 4 community for chucky)
  const playerAllCards = [...playerCards, ...communityCards];
  const chuckyAllCards = [...chuckyCards, ...communityCards];

  console.log('[HOLM SHOWDOWN] Player all cards:', playerAllCards);
  console.log('[HOLM SHOWDOWN] Chucky all cards:', chuckyAllCards);

  const playerEval = evaluateHand(playerAllCards);
  const chuckyEval = evaluateHand(chuckyAllCards);

  console.log('[HOLM SHOWDOWN] Player hand:', formatHandRank(playerEval.rank), 'value:', playerEval.value);
  console.log('[HOLM SHOWDOWN] Chucky hand:', formatHandRank(chuckyEval.rank), 'value:', chuckyEval.value);

  const playerWins = playerEval.value > chuckyEval.value;

  console.log('[HOLM SHOWDOWN] Winner:', playerWins ? 'Player' : 'Chucky');
  
  // Get player username
  const playerUsername = player.profiles?.username || player.user_id;

  if (playerWins) {
    console.log('[HOLM SHOWDOWN] Player wins! Pot:', game.pot);
    // Player beats Chucky - game over, player wins
    await supabase
      .from('players')
      .update({ chips: player.chips + game.pot })
      .eq('id', player.id);

    await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: `${playerUsername} beat Chucky with ${formatHandRank(playerEval.rank)} and wins $${game.pot}!`,
        game_over_at: new Date().toISOString(),
        pot: 0
      })
      .eq('id', gameId);
  } else {
    console.log('[HOLM SHOWDOWN] Chucky wins!');
    // Chucky wins - player matches pot (capped)
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(game.pot, game.pot_max_value) 
      : game.pot;

    console.log('[HOLM SHOWDOWN] Pot match amount:', potMatchAmount);

    await supabase
      .from('players')
      .update({ chips: player.chips - potMatchAmount })
      .eq('id', player.id);

    const newPot = game.pot + potMatchAmount;

    console.log('[HOLM SHOWDOWN] New pot:', newPot);

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
    .update({ status: 'completed' })
    .eq('id', roundId);

  console.log('[HOLM SHOWDOWN] Showdown complete');
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
    const winnerUsername = winner.player.profiles?.username || winner.player.user_id;
    
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
        last_round_result: `${winnerUsername} wins with ${formatHandRank(winner.evaluation.rank)}!`,
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

  // Rotate buck position clockwise to next active player
  const { data: players } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || players.length === 0) return;

  // Get sorted positions of active players
  const positions = players.map(p => p.position).sort((a, b) => a - b);
  const currentBuckIndex = positions.indexOf(game.buck_position);
  
  // Find next position (wrap around if needed)
  const nextBuckIndex = (currentBuckIndex + 1) % positions.length;
  const newBuckPosition = positions[nextBuckIndex];

  console.log('[HOLM NEXT] Rotating buck from', game.buck_position, 'to', newBuckPosition);

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
