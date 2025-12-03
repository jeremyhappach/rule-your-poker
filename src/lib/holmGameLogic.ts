import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank } from "./cardUtils";

/**
 * Check if all players have decided in a Holm game round
 * In Holm, decisions are TURN-BASED starting from buck and rotating clockwise
 */
export async function checkHolmRoundComplete(gameId: string) {
  console.log('[HOLM CHECK] Checking if round is complete for game:', gameId);
  
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
    
  if (!game) {
    console.log('[HOLM CHECK] Game not found');
    return;
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', game.current_round)
    .single();
    
  if (!round) {
    console.log('[HOLM CHECK] Round not found');
    return;
  }
  
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');
    
  if (!players || players.length === 0) {
    console.log('[HOLM CHECK] No active players found');
    return;
  }
  
  console.log('[HOLM CHECK] Players:', players.map(p => ({
    position: p.position,
    decided: p.decision_locked,
    decision: p.current_decision,
    is_bot: p.is_bot
  })));
  
  // Check if all players have decided (must have both decision_locked AND a current_decision)
  const allDecided = players.every(p => p.decision_locked && p.current_decision !== null);
  
  console.log('[HOLM CHECK] All players decided?', allDecided);
  
  if (allDecided) {
    console.log('[HOLM CHECK] All players decided, setting all_decisions_in flag and calling endHolmRound');
    await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId);
    
    // Clear the timer and turn position since all decisions are in
    await supabase
      .from('rounds')
      .update({ 
        current_turn_position: null,
        decision_deadline: null
      })
      .eq('id', round.id);
    
    // End the round
    try {
      await endHolmRound(gameId);
    } catch (error) {
      console.error('[HOLM CHECK] ERROR calling endHolmRound:', error);
      throw error;
    }
  } else {
    // Check if current player has decided - if so, move to next player's turn
    const currentPlayer = players.find(p => p.position === round.current_turn_position);
    if (currentPlayer?.decision_locked && currentPlayer.current_decision !== null) {
      console.log('[HOLM CHECK] Current player decided, moving to next turn');
      await moveToNextHolmPlayerTurn(gameId);
    } else {
      console.log('[HOLM CHECK] Waiting for player at position', round.current_turn_position, 'to decide');
    }
  }
}

/**
 * Move to the next player's turn in Holm game (clockwise from buck)
 */
async function moveToNextHolmPlayerTurn(gameId: string) {
  console.log('[HOLM TURN] ========== Starting moveToNextHolmPlayerTurn ==========');
  
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
  
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');
    
  if (!players || players.length === 0) return;
  
  const positions = players.map(p => p.position).sort((a, b) => a - b);
  const currentIndex = positions.indexOf(round.current_turn_position);
  const nextIndex = (currentIndex + 1) % positions.length;
  const nextPosition = positions[nextIndex];
  
  console.log('[HOLM TURN] *** MOVING TURN from position', round.current_turn_position, 'to', nextPosition, '***');
  
  // Update turn position and reset timer (10 seconds per turn)
  const deadline = new Date(Date.now() + 10000);
  await supabase
    .from('rounds')
    .update({ 
      current_turn_position: nextPosition,
      decision_deadline: deadline.toISOString()
    })
    .eq('id', round.id);
    
  console.log('[HOLM TURN] *** TURN UPDATE COMPLETE - DB updated to position', nextPosition, '***');
  
  console.log('[HOLM TURN] ========== moveToNextHolmPlayerTurn COMPLETE ==========');
}


/**
 * Start a Holm game round
 * - Each player gets 4 cards
 * - 4 community cards (2 visible, 2 hidden initially)
 * - Decision starts with buck position and rotates clockwise
 * - Uses firstHand flag: true = collect antes; false = preserve pot from showdown
 */
export async function startHolmRound(gameId: string, isFirstHand: boolean = false) {
  console.log('[HOLM] ========== Starting Holm hand for game', gameId, '==========');
  console.log('[HOLM] isFirstHand parameter:', isFirstHand);
  
  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  
  if (!gameConfig) {
    throw new Error('Game not found');
  }

  console.log('[HOLM] Game config - pot:', gameConfig.pot, 'buck_position:', gameConfig.buck_position);

  const anteAmount = gameConfig.ante_amount || 2;
  const dealerPosition = gameConfig.dealer_position || 1;
  
  // Use existing buck position or calculate for first hand
  let buckPosition = gameConfig.buck_position;
  
  if (!buckPosition || isFirstHand) {
    // First hand - buck starts one position to the left of dealer
    const { data: allPlayers } = await supabase
      .from('players')
      .select('position')
      .eq('game_id', gameId)
      .order('position');
    
    const maxPosition = allPlayers && allPlayers.length > 0 
      ? Math.max(...allPlayers.map(p => p.position))
      : 7;
    
    buckPosition = dealerPosition === 1 ? maxPosition : dealerPosition - 1;
    console.log('[HOLM] Calculated buck position:', buckPosition);
  }

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

  // FIRST HAND: Collect antes and set initial pot
  // SUBSEQUENT HANDS: Use pot value preserved from showdown (DO NOT re-ante)
  let potForRound: number;
  
  if (isFirstHand) {
    console.log('[HOLM] FIRST HAND - Collecting antes');
    
    let antePot = 0;
    for (const player of players) {
      antePot += anteAmount;
      const newChips = player.chips - anteAmount;
      console.log('[HOLM] Ante from player', player.position, ':', anteAmount, '- chips:', player.chips, '->', newChips);
      
      await supabase
        .from('players')
        .update({ chips: newChips })
        .eq('id', player.id);
    }
    
    potForRound = antePot;
    console.log('[HOLM] Total antes collected:', potForRound);
    
    // Update game with ante pot
    await supabase
      .from('games')
      .update({
        pot: potForRound,
        buck_position: buckPosition,
        total_hands: 1
      })
      .eq('id', gameId);
  } else {
    // SUBSEQUENT HAND: Use the pot value from the database (set during showdown)
    potForRound = gameConfig.pot || 0;
    console.log('[HOLM] SUBSEQUENT HAND - Using preserved pot:', potForRound);
  }

  // Handle round 2 (gameplay round)
  const { data: round2 } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', 2)
    .maybeSingle();

  // Deal fresh cards
  const deadline = new Date(Date.now() + 10000);
  const deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Deal 4 community cards
  const communityCards = [
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++]
  ];

  let roundId: string;

  if (round2) {
    console.log('[HOLM] Resetting round 2 for new hand...');
    
    // Delete old player cards
    await supabase
      .from('player_cards')
      .delete()
      .eq('round_id', round2.id);
    
    // Reset round 2 with fresh cards
    await supabase
      .from('rounds')
      .update({
        status: 'betting',
        pot: potForRound,
        decision_deadline: deadline.toISOString(),
        community_cards_revealed: 2,
        chucky_active: false,
        chucky_cards: null,
        chucky_cards_revealed: 0,
        community_cards: communityCards as any,
        current_turn_position: buckPosition
      })
      .eq('id', round2.id);
    
    roundId = round2.id;
  } else {
    console.log('[HOLM] Creating round 2 for gameplay');
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        round_number: 2,
        cards_dealt: 4,
        status: 'betting',
        pot: potForRound,
        decision_deadline: deadline.toISOString(),
        community_cards_revealed: 2,
        community_cards: communityCards as any,
        chucky_active: false,
        current_turn_position: buckPosition
      })
      .select()
      .single();

    if (roundError || !round) {
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }
    
    roundId = round.id;
  }

  // Reset player decisions
  await supabase
    .from('players')
    .update({ 
      current_decision: null,
      decision_locked: false
    })
    .eq('game_id', gameId);

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
        round_id: roundId,
        cards: playerCards as any
      });
  }

  // Update game status (DO NOT touch pot - it's already set correctly above)
  await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: 2,
      buck_position: buckPosition,
      all_decisions_in: false,
      last_round_result: null
    })
    .eq('id', gameId);

  console.log('[HOLM] Hand started. Buck:', buckPosition, 'Pot:', potForRound, 'FirstHand:', isFirstHand);
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

  // Guard: Prevent multiple simultaneous calls - if round is completed or Chucky is already dealing, exit
  if (round.status === 'completed' || (round.chucky_active && round.chucky_cards_revealed && round.chucky_cards_revealed > 0)) {
    console.log('[HOLM END] Round already being processed or completed, skipping');
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
      ? `Pussy Tax!`
      : 'Everyone folded! No penalty.';

    console.log('[HOLM END] Pussy tax - old pot:', game.pot, 'tax collected:', totalTaxCollected, 'new pot:', newPot);

    // Update both games and rounds with the new pot
    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        last_round_result: resultMessage,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
    
    console.log('[HOLM END] Games pot update:', gameUpdateError ? `ERROR: ${gameUpdateError.message}` : 'SUCCESS');

    const { error: roundUpdateError } = await supabase
      .from('rounds')
      .update({ 
        status: 'completed',
        pot: newPot  // Also update round pot
      })
      .eq('id', round.id);
    
    console.log('[HOLM END] Rounds pot update:', roundUpdateError ? `ERROR: ${roundUpdateError.message}` : 'SUCCESS');

    console.log('[HOLM END] Pussy tax case completed with new pot:', newPot);
    return;
  }

  // For single player vs Chucky, reveal all 4 community cards now
  // For multi-player showdown, we'll reveal the hidden cards AFTER exposing player cards
  if (stayedPlayers.length === 1) {
    // Single player - reveal all 4 community cards first
    console.log('[HOLM END] Single player - revealing all 4 community cards...', {
      roundId: round.id,
      currentlyRevealed: round.community_cards_revealed,
      targetRevealed: 4
    });
    
    const { error: revealError } = await supabase
      .from('rounds')
      .update({ community_cards_revealed: 4 })
      .eq('id', round.id);
    
    if (revealError) {
      console.error('[HOLM END] ERROR revealing community cards:', revealError);
    }
    
    // Brief pause to allow UI to update with community cards
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  // For multi-player, keep community_cards_revealed at 2 for now

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
      const playerEval = evaluateHand(playerAllCards, false); // No wild cards in Holm
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
    
    // Brief pause to show player's hand
    console.log('[HOLM END] Brief pause to display player hand...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Deal Chucky's cards from remaining deck (exclude community cards and player cards)
    console.log('[HOLM END] Now dealing Chucky cards...');
    
    // Get all player cards for this round to exclude from Chucky's deck
    const { data: allPlayerCards } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('round_id', round.id);
    
    // Collect all used cards
    const usedCards = new Set<string>();
    
    // Add community cards
    communityCards.forEach(card => {
      usedCards.add(`${card.suit}-${card.rank}`);
    });
    
    // Add all player cards
    if (allPlayerCards) {
      allPlayerCards.forEach(pc => {
        const cards = pc.cards as unknown as Card[];
        cards.forEach(card => {
          usedCards.add(`${card.suit}-${card.rank}`);
        });
      });
    }
    
    console.log('[HOLM END] Used cards to exclude:', usedCards.size);
    
    // Create deck excluding used cards
    const fullDeck = createDeck();
    const availableCards = fullDeck.filter(card => !usedCards.has(`${card.suit}-${card.rank}`));
    const shuffledAvailable = shuffleDeck(availableCards);
    
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);

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

    console.log('[HOLM END] Chucky cards stored, revealing one at a time with suspense...');
    
    // Reveal Chucky's cards one at a time with suspenseful delays
    for (let i = 1; i <= chuckyCardCount; i++) {
      // Determine delay based on card position
      let delay: number;
      if (i === chuckyCardCount) {
        // Final card - 3 second delay for maximum suspense
        delay = 3000;
        console.log('[HOLM END] Building suspense for FINAL card...');
      } else if (i === chuckyCardCount - 1) {
        // Next-to-last card - 1.5 second delay
        delay = 1500;
        console.log('[HOLM END] Building suspense for next-to-last card...');
      } else {
        // Earlier cards - quick 300ms reveal
        delay = 300;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: i })
        .eq('id', round.id);
      console.log('[HOLM END] Revealed Chucky card', i, 'of', chuckyCardCount);
    }
    
    console.log('[HOLM END] All Chucky cards revealed');

    // 3-second delay so players can read the results before evaluation
    console.log('[HOLM END] Pausing 3 seconds for players to see results...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Use round.pot as the authoritative pot value (game.pot may be stale)
    const roundPot = round.pot || game.pot || 0;
    await handleChuckyShowdown(gameId, round.id, player, communityCards, game, chuckyCards, roundPot);
    return;
  }

  // Case 3: Multiple players stayed - showdown (no Chucky)
  console.log('[HOLM END] Case 3: Multi-player showdown (no Chucky)');
  
  // Player cards are already visible to their owners, but now expose them to everyone
  // by marking the round as "showdown" phase - the UI will handle showing all cards
  console.log('[HOLM END] Exposing player cards for showdown - setting status to showdown...');
  
  // SET STATUS TO SHOWDOWN FIRST so UI reveals player cards
  await supabase
    .from('rounds')
    .update({ status: 'showdown' })
    .eq('id', round.id);
  
  // 3 second delay for players to read exposed cards before revealing hidden community cards
  console.log('[HOLM END] Waiting 3 seconds for players to read exposed cards...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Now reveal the 2 hidden community cards (cards 3 and 4)
  console.log('[HOLM END] Revealing hidden community cards...');
  
  // Use round.pot as the authoritative pot value (game.pot may be stale)
  const roundPot = round.pot || game.pot || 0;
  await handleMultiPlayerShowdown(gameId, round.id, stayedPlayers, communityCards, game, roundPot);
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
  chuckyCards: Card[],
  roundPot: number
) {
  console.log('[HOLM SHOWDOWN] ========== Starting Chucky showdown ==========');
  console.log('[HOLM SHOWDOWN] Player:', player.id, 'position:', player.position);
  console.log('[HOLM SHOWDOWN] Chucky cards:', chuckyCards);
  console.log('[HOLM SHOWDOWN] Community cards:', communityCards);
  console.log('[HOLM SHOWDOWN] Round pot (authoritative):', roundPot, 'game.pot:', game.pot);

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

  const playerEval = evaluateHand(playerAllCards, false); // No wild cards in Holm
  const chuckyEval = evaluateHand(chuckyAllCards, false); // No wild cards in Holm

  console.log('[HOLM SHOWDOWN] Player hand:', formatHandRank(playerEval.rank), 'value:', playerEval.value);
  console.log('[HOLM SHOWDOWN] Chucky hand:', formatHandRank(chuckyEval.rank), 'value:', chuckyEval.value);

  const playerWins = playerEval.value > chuckyEval.value;

  console.log('[HOLM SHOWDOWN] Winner:', playerWins ? 'Player' : 'Chucky');
  
  // Get player username
  const playerUsername = player.profiles?.username || player.user_id;

  if (playerWins) {
    console.log('[HOLM SHOWDOWN] Player wins! Pot:', roundPot);
    // Player beats Chucky - award pot, GAME OVER (Holm game ends when you beat Chucky)
    // Note: Holm game doesn't use legs system
    await supabase
      .from('players')
      .update({ 
        chips: player.chips + roundPot
      })
      .eq('id', player.id);

    // In Holm game, beating Chucky ends the game immediately
    console.log('[HOLM SHOWDOWN] *** PLAYER BEAT CHUCKY! Game ends. ***');
    const { error: gameOverError } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: `${playerUsername} beat Chucky with ${formatHandRank(playerEval.rank)} and wins $${roundPot}!`,
        game_over_at: new Date().toISOString(),
        pot: 0,
        awaiting_next_round: false
      })
      .eq('id', gameId);
    
    if (gameOverError) {
      console.error('[HOLM SHOWDOWN] ERROR setting game_over status:', gameOverError);
    } else {
      console.log('[HOLM SHOWDOWN] Successfully set game_over status');
    }
  } else {
    console.log('[HOLM SHOWDOWN] Chucky wins!');
    // Chucky wins - player matches pot (capped)
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;

    console.log('[HOLM SHOWDOWN] Pot match calculation:', {
      pot_max_enabled: game.pot_max_enabled,
      pot_max_value: game.pot_max_value,
      roundPot,
      potMatchAmount
    });

    await supabase
      .from('players')
      .update({ chips: player.chips - potMatchAmount })
      .eq('id', player.id);
    
    console.log('[HOLM SHOWDOWN] Player chips deducted by:', potMatchAmount);

    const newPot = roundPot + potMatchAmount;

    console.log('[HOLM SHOWDOWN] Pot update - old:', roundPot, 'adding:', potMatchAmount, 'new:', newPot);

    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        last_round_result: `Chucky wins with ${formatHandRank(chuckyEval.rank)} vs ${formatHandRank(playerEval.rank)}. $${potMatchAmount} added to pot.`,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
    
    console.log('[HOLM SHOWDOWN] Games pot update:', gameUpdateError ? `ERROR: ${gameUpdateError.message}` : 'SUCCESS - pot set to ' + newPot);
  }

  // Mark round complete and hide Chucky
  await supabase
    .from('rounds')
    .update({ 
      status: 'completed',
      chucky_active: false // Hide Chucky when round ends
    })
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
  game: any,
  roundPot: number
) {
  console.log('[HOLM] Multi-player showdown, roundPot:', roundPot, 'game.pot:', game.pot);

  // Status already set to 'showdown' and 3-second delay already completed in endHolmRound
  // Now reveal the 2 hidden community cards (cards 3 and 4)
  console.log('[HOLM MULTI] Revealing hidden community cards (3 and 4)...');
  await supabase
    .from('rounds')
    .update({ community_cards_revealed: 4 })
    .eq('id', roundId);

  // Step 4: Wait 3 more seconds for players to see final hands
  console.log('[HOLM MULTI] Waiting 3 seconds for players to see final hands...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('[HOLM MULTI] Evaluating hands...');

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
      const evaluation = evaluateHand(allCards, false); // No wild cards in Holm

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
    
    // Winner takes ONLY the pot
    console.log('[HOLM MULTI] Winner', winnerUsername, 'takes pot:', roundPot);
    await supabase
      .from('players')
      .update({ 
        chips: winner.player.chips + roundPot
      })
      .eq('id', winner.player.id);

    // Losers match the pot (capped) - this becomes the NEW pot for next hand
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;
    
    console.log('[HOLM MULTI] Losers pay potMatchAmount:', potMatchAmount, '(becomes new pot)');

    let newPot = 0;
    for (const loser of losers) {
      await supabase
        .from('players')
        .update({ chips: loser.player.chips - potMatchAmount })
        .eq('id', loser.player.id);
      newPot += potMatchAmount;
    }

    // Set pot to losers' matched amount (no re-anting in Holm)
    console.log('[HOLM MULTI] New pot from losers match:', newPot);
    const { error: updateError } = await supabase
      .from('games')
      .update({
        last_round_result: `${winnerUsername} wins with ${formatHandRank(winner.evaluation.rank)} and takes $${roundPot}!`,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
    
    if (updateError) {
      console.error('[HOLM MULTI] ERROR updating game:', updateError);
    } else {
      console.log('[HOLM MULTI] Successfully set awaiting_next_round=true, pot=', newPot);
    }
  
    // Mark round as completed to hide timer
    await supabase
      .from('rounds')
      .update({ status: 'completed' })
      .eq('id', roundId);
  } else {
    // Tie - both/all tied players must face Chucky
    console.log('[HOLM TIE] Tie detected. Tied players must face Chucky.');
    
    // Deal Chucky cards (4 cards for Holm game)
    const deck = shuffleDeck(createDeck());
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards: Card[] = [];
    for (let i = 0; i < chuckyCardCount; i++) {
      chuckyCards.push(deck[i]);
    }
    
    console.log('[HOLM TIE] Dealt Chucky:', chuckyCards);
    
    // Reveal Chucky cards gradually with 3 second delay
    await supabase
      .from('rounds')
      .update({ 
        chucky_cards: chuckyCards as any,
        chucky_cards_revealed: 0,
        chucky_active: true
      })
      .eq('id', roundId);
    
    // Reveal Chucky cards one by one
    for (let revealed = 1; revealed <= chuckyCardCount; revealed++) {
      await new Promise(resolve => setTimeout(resolve, 600));
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: revealed })
        .eq('id', roundId);
    }
    
    // Wait 3 seconds for players to see all cards
    console.log('[HOLM TIE] Waiting 3 seconds for players to view cards...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Evaluate each tied player against Chucky
    const chuckyAllCards = [...chuckyCards, ...communityCards];
    const chuckyEval = evaluateHand(chuckyAllCards, false);
    
    console.log('[HOLM TIE] Chucky hand:', formatHandRank(chuckyEval.rank), 'value:', chuckyEval.value);
    
    const playersBeatChucky = winners.filter(w => w.evaluation.value > chuckyEval.value);
    const playersLoseToChucky = winners.filter(w => w.evaluation.value <= chuckyEval.value);
    
    console.log('[HOLM TIE] Players beat Chucky:', playersBeatChucky.length, 'Players lose:', playersLoseToChucky.length);
    
    if (playersBeatChucky.length === 0) {
      // All tied players lost to Chucky - they all match pot (capped)
      console.log('[HOLM TIE] Chucky beats all tied players');
      
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(game.pot, game.pot_max_value) 
        : game.pot;
      
      let totalMatched = 0;
      let loserNames: string[] = [];
      
      for (const loser of playersLoseToChucky) {
        const loserUsername = loser.player.profiles?.username || loser.player.user_id;
        loserNames.push(loserUsername);
        
        await supabase
          .from('players')
          .update({ chips: loser.player.chips - potMatchAmount })
          .eq('id', loser.player.id);
        
        totalMatched += potMatchAmount;
      }
      
      const newPot = game.pot + totalMatched;
      
      await supabase
        .from('games')
        .update({
          last_round_result: `Tie broken by Chucky! ${loserNames.join(' and ')} lose to Chucky's ${formatHandRank(chuckyEval.rank)}. $${totalMatched} added to pot.`,
          awaiting_next_round: true,
          pot: newPot
        })
        .eq('id', gameId);
      
      // Also update round1.pot so next hand has correct pot
      await supabase
        .from('rounds')
        .update({ pot: newPot })
        .eq('game_id', gameId)
        .eq('round_number', 1);
    } else {
      // Some players beat Chucky - they split the pot, losers match it for next pot
      console.log('[HOLM TIE] Some tied players beat Chucky');
      
      // Winners split ONLY the pot
      const splitAmount = Math.floor(game.pot / playersBeatChucky.length);
      let winnerNames: string[] = [];
      
      for (const winner of playersBeatChucky) {
        const winnerUsername = winner.player.profiles?.username || winner.player.user_id;
        winnerNames.push(winnerUsername);
        
        await supabase
          .from('players')
          .update({ 
            chips: winner.player.chips + splitAmount
          })
          .eq('id', winner.player.id);
      }
      
      // Losers match the pot (capped) - becomes the NEW pot
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(game.pot, game.pot_max_value) 
        : game.pot;
      
      let newPot = 0;
      for (const loser of playersLoseToChucky) {
        await supabase
          .from('players')
          .update({ chips: loser.player.chips - potMatchAmount })
          .eq('id', loser.player.id);
        newPot += potMatchAmount;
      }
      
      // Set pot to losers' matched amount (no re-anting in Holm)
      await supabase
        .from('games')
        .update({
          last_round_result: `Tie broken! ${winnerNames.join(' and ')} beat Chucky and take $${game.pot}!`,
          awaiting_next_round: true,
          pot: newPot
        })
        .eq('id', gameId);
    }
  }

  // Mark round complete to hide timer during showdown
  await supabase
    .from('rounds')
    .update({ 
      status: 'completed',
      chucky_active: false // Ensure Chucky is hidden
    })
    .eq('id', roundId);
}

/**
 * Proceed to next Holm hand (always uses round 1, just resets state)
 */
export async function proceedToNextHolmRound(gameId: string) {
  console.log('[HOLM NEXT] ========== Proceeding to next hand ==========');

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.error('[HOLM NEXT] ERROR: Game not found');
    return;
  }

  console.log('[HOLM NEXT] Current game state - pot:', game.pot, 'awaiting:', game.awaiting_next_round, 'total_hands:', game.total_hands);

  // Increment total_hands counter (this prevents re-anting on subsequent hands)
  const newTotalHands = (game.total_hands || 0) + 1;
  
  // Rotate buck position clockwise to next active player
  const { data: players } = await supabase
    .from('players')
    .select('position, is_bot')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || players.length === 0) {
    console.error('[HOLM NEXT] ERROR: No active players found');
    return;
  }

  // Get sorted positions of active players
  const positions = players.map(p => p.position).sort((a, b) => a - b);
  const currentBuckIndex = positions.indexOf(game.buck_position);
  const nextBuckIndex = (currentBuckIndex + 1) % positions.length;
  const newBuckPosition = positions[nextBuckIndex];

  console.log('[HOLM NEXT] Buck rotating from', game.buck_position, 'to', newBuckPosition);

  // Update buck position and increment total_hands (DO NOT touch pot here)
  await supabase
    .from('games')
    .update({
      buck_position: newBuckPosition,
      last_round_result: null,
      total_hands: newTotalHands
    })
    .eq('id', gameId);
  
  console.log('[HOLM NEXT] Updated total_hands to', newTotalHands);

  // Start new hand - NOT first hand, so preserve pot from showdown
  await startHolmRound(gameId, false);
  
  // Clear awaiting flag
  await supabase
    .from('games')
    .update({ awaiting_next_round: false })
    .eq('id', gameId);

  console.log('[HOLM NEXT] Next hand ready');
}
