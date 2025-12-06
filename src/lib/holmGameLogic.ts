import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, type Suit, type Rank, evaluateHand, formatHandRank, formatHandRankDetailed } from "./cardUtils";

/**
 * Check if all players have decided in a Holm game round
 * In Holm, decisions are TURN-BASED starting from buck and rotating clockwise
 */
export async function checkHolmRoundComplete(gameId: string) {
  console.log('[HOLM CHECK] Checking if round is complete for game:', gameId);
  
  // Longer delay to ensure DB write has propagated before reading
  // Previous 100ms was causing race conditions where decision_locked wasn't visible yet
  await new Promise(resolve => setTimeout(resolve, 300));
  
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
  
  // Fetch game_defaults for decision timer
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('decision_timer_seconds')
    .eq('game_type', 'holm')
    .maybeSingle();
  
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
  console.log('[HOLM TURN] Using decision timer:', timerSeconds, 'seconds');
  
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
    
  if (!game) {
    console.error('[HOLM TURN] ERROR: Game not found');
    return;
  }
  
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', game.current_round)
    .single();
    
  if (!round) {
    console.error('[HOLM TURN] ERROR: Round not found');
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
    console.error('[HOLM TURN] ERROR: No active players found');
    return;
  }
  
  const positions = players.map(p => p.position).sort((a, b) => a - b);
  const currentIndex = positions.indexOf(round.current_turn_position);
  const nextIndex = (currentIndex + 1) % positions.length;
  const nextPosition = positions[nextIndex];
  
  console.log('[HOLM TURN] *** MOVING TURN from position', round.current_turn_position, 'to', nextPosition, '***');
  console.log('[HOLM TURN] positions:', positions, 'currentIndex:', currentIndex, 'nextIndex:', nextIndex);
  
  // Update turn position and reset timer using game_defaults
  const deadline = new Date(Date.now() + timerSeconds * 1000);
  const { error: updateError } = await supabase
    .from('rounds')
    .update({ 
      current_turn_position: nextPosition,
      decision_deadline: deadline.toISOString()
    })
    .eq('id', round.id);
  
  if (updateError) {
    console.error('[HOLM TURN] ERROR updating turn position:', updateError);
    return;
  }
    
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
export async function startHolmRound(gameId: string, isFirstHand: boolean = false, passedBuckPosition?: number) {
  console.log('[HOLM] ========== Starting Holm hand for game', gameId, '==========');
  console.log('[HOLM] isFirstHand parameter:', isFirstHand, 'passedBuckPosition:', passedBuckPosition);
  
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
  
  // CRITICAL: Use passed buck position if provided, otherwise use existing or calculate
  let buckPosition = passedBuckPosition ?? gameConfig.buck_position;
  
  if (!buckPosition || isFirstHand) {
    // First hand - buck starts one position to the left of dealer (counterclockwise)
    // Must find the actual next occupied seat, not just dealerPosition - 1
    const { data: allPlayers } = await supabase
      .from('players')
      .select('position')
      .eq('game_id', gameId)
      .eq('status', 'active')
      .eq('sitting_out', false)
      .order('position');
    
    if (allPlayers && allPlayers.length > 0) {
      const occupiedPositions = allPlayers.map(p => p.position).sort((a, b) => a - b);
      const dealerIndex = occupiedPositions.indexOf(dealerPosition);
      
      // Get the previous position in the sorted array (wrapping to end if at start)
      const prevIndex = dealerIndex <= 0 ? occupiedPositions.length - 1 : dealerIndex - 1;
      buckPosition = occupiedPositions[prevIndex];
      console.log('[HOLM] Occupied positions:', occupiedPositions, 'Dealer at:', dealerPosition, 'Buck goes to:', buckPosition);
    } else {
      buckPosition = dealerPosition;
    }
  }
  
  console.log('[HOLM] Final buckPosition for round:', buckPosition);

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

  // Fetch game_defaults for decision timer
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('decision_timer_seconds')
    .eq('game_type', 'holm')
    .maybeSingle();
  
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
  console.log('[HOLM] Using decision timer:', timerSeconds, 'seconds');

  // Get next round number (increment for each new hand to avoid stale card issues)
  const { data: maxRoundData } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const nextRoundNumber = (maxRoundData?.round_number || 1) + 1;
  console.log('[HOLM] Creating new round:', nextRoundNumber);

  // Deal fresh cards
  const deadline = new Date(Date.now() + timerSeconds * 1000);
  const deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Deal 4 community cards
  const communityCards = [
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++],
    deck[cardIndex++]
  ];

  // Always create a new round for each hand - unique round_id prevents stale card fetching
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: nextRoundNumber,
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
  
  const roundId = round.id;

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

  // Update game status with the new round number
  await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: nextRoundNumber,
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

  // Guard: Prevent multiple simultaneous calls - if round is completed or Chucky is already active, exit
  // Check chucky_active alone (not revealed count) to prevent race conditions during initial dealing
  if (round.status === 'completed' || round.status === 'showdown' || round.chucky_active) {
    console.log('[HOLM END] Round already being processed or completed, skipping', {
      status: round.status,
      chucky_active: round.chucky_active
    });
    return;
  }

  console.log('[HOLM END] Round data:', {
    id: round.id,
    status: round.status,
    community_cards_revealed: round.community_cards_revealed,
    chucky_active: round.chucky_active
  });

  // Extract community cards for later use - ensure proper parsing from JSON
  let communityCards: Card[] = [];
  try {
    const rawCommunity = round.community_cards;
    if (Array.isArray(rawCommunity)) {
      communityCards = rawCommunity.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank).toUpperCase() as Rank
      }));
    } else if (typeof rawCommunity === 'string') {
      const parsed = JSON.parse(rawCommunity);
      communityCards = parsed.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank).toUpperCase() as Rank
      }));
    }
  } catch (e) {
    console.error('[HOLM END] ERROR parsing community cards:', e);
  }
  console.log('[HOLM END] Community cards:', communityCards.map(c => `${c.rank}${c.suit}`).join(' '));

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
    console.log('[HOLM END] Case 2: Single player vs Chucky');
    
    const player = stayedPlayers[0];
    const playerUsername = player.profiles?.username || player.user_id;
    
    // Step 1: Expose player's cards by setting all_decisions_in
    console.log('[HOLM END] Step 1: Exposing player cards...');
    await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId);
    
    // Step 2: Wait 2 seconds for player to see their exposed cards
    console.log('[HOLM END] Step 2: 2-second delay for card exposure...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Reveal the 2 hidden community cards
    console.log('[HOLM END] Step 3: Revealing hidden community cards...');
    await supabase
      .from('rounds')
      .update({ community_cards_revealed: 4 })
      .eq('id', round.id);
    
    // Brief pause to allow UI to update with community cards
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Show player's hand rank
    const { data: playerCardsData } = await supabase
      .from('player_cards')
      .select('*')
      .eq('player_id', player.id)
      .eq('round_id', round.id)
      .single();

    let playerEval: any = null;
    let playerCards: Card[] = [];
    if (playerCardsData) {
      playerCards = playerCardsData.cards as unknown as Card[];
      const playerAllCards = [...playerCards, ...communityCards];
      playerEval = evaluateHand(playerAllCards, false);
      
      // Get detailed hand description with card values
      const handDescription = formatHandRankDetailed(playerAllCards, false);
      console.log('[HOLM END] Step 4: Player has:', handDescription);
      
      // Show hand rank announcement with player name - explicitly ensure awaiting_next_round is false
      await supabase
        .from('games')
        .update({ 
          last_round_result: `${playerUsername} has ${handDescription}`,
          awaiting_next_round: false
        })
        .eq('id', gameId);
    }
    
    // Step 5: Wait 2 seconds for player to see their hand rank
    console.log('[HOLM END] Step 5: 2-second delay for hand rank display...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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

    // Keep hand description visible - it will be replaced by result announcement after comparison
    // 2-second delay so players can compare hands before result
    console.log('[HOLM END] Pausing 2 seconds for players to compare hands...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Use round.pot as the authoritative pot value (game.pot may be stale)
    const roundPot = round.pot || game.pot || 0;
    try {
      await handleChuckyShowdown(gameId, round.id, player, communityCards, game, chuckyCards, roundPot);
    } catch (error) {
      console.error('[HOLM END] ERROR in handleChuckyShowdown:', error);
      // Attempt to at least mark round as completed to prevent stuck state
      await supabase
        .from('rounds')
        .update({ status: 'completed', chucky_active: false })
        .eq('id', round.id);
    }
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

  // Get player's cards (use limit(1) to handle potential duplicates gracefully)
  const { data: playerCardsArray, error: cardsError } = await supabase
    .from('player_cards')
    .select('*')
    .eq('player_id', player.id)
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (cardsError || !playerCardsArray || playerCardsArray.length === 0) {
    console.log('[HOLM SHOWDOWN] ERROR: Player cards not found or error:', cardsError);
    return;
  }
  
  const playerCardsData = playerCardsArray[0];

  // CRITICAL: Ensure cards are properly parsed from JSON
  let playerCards: Card[] = [];
  try {
    const rawCards = playerCardsData.cards;
    if (Array.isArray(rawCards)) {
      playerCards = rawCards.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank) as Rank
      }));
    } else if (typeof rawCards === 'string') {
      const parsed = JSON.parse(rawCards);
      playerCards = parsed.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank) as Rank
      }));
    }
  } catch (e) {
    console.error('[HOLM SHOWDOWN] ERROR parsing player cards:', e, playerCardsData.cards);
    return;
  }
  
  // CRITICAL DEBUG: Log raw card data to diagnose evaluation issues
  console.log('[HOLM SHOWDOWN] ========== RAW CARD DATA ==========');
  console.log('[HOLM SHOWDOWN] Player cards RAW:', JSON.stringify(playerCards));
  console.log('[HOLM SHOWDOWN] Player cards type:', typeof playerCardsData.cards, Array.isArray(playerCardsData.cards));
  console.log('[HOLM SHOWDOWN] Chucky cards RAW:', JSON.stringify(chuckyCards));
  console.log('[HOLM SHOWDOWN] Community cards RAW:', JSON.stringify(communityCards));
  
  // Log card strings for human readability
  const playerCardStr = playerCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const chuckyCardStr = chuckyCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const communityCardStr = communityCards.map(c => `${c.rank}${c.suit}`).join(' ');
  console.log('[HOLM SHOWDOWN] Player cards:', playerCardStr);
  console.log('[HOLM SHOWDOWN] Chucky cards:', chuckyCardStr);
  console.log('[HOLM SHOWDOWN] Community cards:', communityCardStr);

  // Evaluate hands (best 5 from 4 player + 4 community for player, best 5 from X chucky + 4 community for chucky)
  const playerAllCards = [...playerCards, ...communityCards];
  const chuckyAllCards = [...chuckyCards, ...communityCards];

  const playerAllStr = playerAllCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const chuckyAllStr = chuckyAllCards.map(c => `${c.rank}${c.suit}`).join(' ');
  console.log('[HOLM SHOWDOWN] Player ALL cards (hand + community):', playerAllStr);
  console.log('[HOLM SHOWDOWN] Chucky ALL cards (chucky + community):', chuckyAllStr);

  console.log('[HOLM SHOWDOWN] ========== EVALUATING PLAYER ==========');
  const playerEval = evaluateHand(playerAllCards, false); // No wild cards in Holm
  console.log('[HOLM SHOWDOWN] ========== EVALUATING CHUCKY ==========');
  const chuckyEval = evaluateHand(chuckyAllCards, false); // No wild cards in Holm

  // Get detailed hand descriptions
  const playerHandDesc = formatHandRankDetailed(playerAllCards, false);
  const chuckyHandDesc = formatHandRankDetailed(chuckyAllCards, false);

  console.log('[HOLM SHOWDOWN] ========== COMPARISON ==========');
  console.log('[HOLM SHOWDOWN] Player:', playerHandDesc, '| rank:', playerEval.rank, '| value:', playerEval.value);
  console.log('[HOLM SHOWDOWN] Chucky:', chuckyHandDesc, '| rank:', chuckyEval.rank, '| value:', chuckyEval.value);
  console.log('[HOLM SHOWDOWN] Player value > Chucky value?', playerEval.value, '>', chuckyEval.value, '=', playerEval.value > chuckyEval.value);

  const playerWins = playerEval.value > chuckyEval.value;

  console.log('[HOLM SHOWDOWN] *** WINNER:', playerWins ? 'PLAYER' : 'CHUCKY', '***');
  
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

    // Reset all players for new game (keep chips, clear ante decisions)
    // Do NOT reset sitting_out - players who joined mid-game stay sitting_out until they ante up
    console.log('[HOLM SHOWDOWN] Resetting player states for new game');
    await supabase
      .from('players')
      .update({ 
        status: 'active',
        current_decision: null,
        decision_locked: false,
        ante_decision: null
      })
      .eq('game_id', gameId);

    // In Holm game, beating Chucky ends the game - show result announcement first
    console.log('[HOLM SHOWDOWN] *** PLAYER BEAT CHUCKY! Showing announcement. ***');
    
    // First show the result announcement (round stays completed, game stays in_progress)
    await supabase
      .from('games')
      .update({
        last_round_result: `${playerUsername} beat Chucky with ${playerHandDesc}!`
      })
      .eq('id', gameId);
    
    // 2-second delay for players to see the winning announcement
    console.log('[HOLM SHOWDOWN] Pausing 2 seconds for announcement...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Calculate next dealer position (rotate clockwise to next HUMAN, non-sitting-out player)
    // Dealer cannot pass to a bot or a sitting_out player
    const { data: eligibleDealers } = await supabase
      .from('players')
      .select('position, is_bot, sitting_out')
      .eq('game_id', gameId)
      .eq('sitting_out', false)
      .eq('is_bot', false)
      .order('position', { ascending: true });
    
    const currentDealerPosition = game.dealer_position || 1;
    let nextDealerPosition = currentDealerPosition; // Default: keep current dealer
    
    if (eligibleDealers && eligibleDealers.length > 0) {
      const eligiblePositions = eligibleDealers.map(p => p.position);
      const currentDealerIndex = eligiblePositions.indexOf(currentDealerPosition);
      
      if (currentDealerIndex === -1) {
        // Current dealer not in eligible list, pick first eligible
        nextDealerPosition = eligiblePositions[0];
      } else if (eligiblePositions.length > 1) {
        // Rotate to next eligible position
        const nextDealerIndex = (currentDealerIndex + 1) % eligiblePositions.length;
        nextDealerPosition = eligiblePositions[nextDealerIndex];
      }
      // If only 1 eligible dealer, keep them as dealer
    }
    
    console.log('[HOLM SHOWDOWN] Dealer rotation:', {
      current: currentDealerPosition,
      eligiblePositions: eligibleDealers?.map(p => p.position) || [],
      nextDealer: nextDealerPosition
    });
    
    // Now set game_over status so dealer can click Next Game button
    const { error: gameOverError } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        pot: 0,
        awaiting_next_round: false,
        dealer_position: nextDealerPosition
      })
      .eq('id', gameId);
    
    if (gameOverError) {
      console.error('[HOLM SHOWDOWN] ERROR setting game_over status:', gameOverError);
    } else {
      console.log('[HOLM SHOWDOWN] Successfully set game_over status with new dealer:', nextDealerPosition);
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
        last_round_result: `Chucky beat ${playerUsername} with ${chuckyHandDesc}`,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
    
    console.log('[HOLM SHOWDOWN] Games pot update:', gameUpdateError ? `ERROR: ${gameUpdateError.message}` : 'SUCCESS - pot set to ' + newPot);
  }

  // Mark round complete but KEEP Chucky visible for result display
  await supabase
    .from('rounds')
    .update({ 
      status: 'completed'
      // Note: chucky_active stays true so cards remain visible during result announcement
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
  // CRITICAL: Use limit(1) + order to handle potential duplicate card records gracefully
  const evaluations = await Promise.all(
    stayedPlayers.map(async (player) => {
      const { data: playerCardsArray, error: cardsError } = await supabase
        .from('player_cards')
        .select('*')
        .eq('player_id', player.id)
        .eq('round_id', roundId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cardsError) {
        console.error('[HOLM MULTI] ERROR fetching cards for player:', player.id, cardsError);
      }

      const playerCardsData = playerCardsArray?.[0];
      
      // CRITICAL: Validate card data from database
      const rawCards = (playerCardsData?.cards as unknown as any[]) || [];
      const playerCards: Card[] = rawCards.map(c => ({
        suit: (c.suit || c.Suit || '') as Suit,
        rank: String(c.rank || c.Rank || '').toUpperCase() as Rank
      })).filter(c => c.suit && c.rank);
      
      // CRITICAL: Log if no cards found - this is the bug causing all ties
      if (rawCards.length === 0) {
        console.error('[HOLM MULTI] ⚠️⚠️⚠️ NO CARDS FOUND for player:', player.id, 'round:', roundId);
      } else if (playerCards.length !== rawCards.length) {
        console.warn('[HOLM MULTI] Card validation issue for player:', player.id, { raw: rawCards, validated: playerCards });
      }
      
      const allCards = [...playerCards, ...communityCards];
      const evaluation = evaluateHand(allCards, false); // No wild cards in Holm

      return {
        player,
        evaluation,
        cards: playerCards
      };
    })
  );

  // Debug: Log each player's evaluation with detailed hand description
  console.log('[HOLM MULTI] ========== HAND EVALUATIONS (RAW DATA) ==========');
  console.log('[HOLM MULTI] Community cards RAW:', JSON.stringify(communityCards));
  console.log('[HOLM MULTI] Community cards:', communityCards.map(c => `${c.rank}${c.suit}`).join(' '));
  
  evaluations.forEach(e => {
    const playerName = e.player.profiles?.username || e.player.user_id;
    const allCards = [...e.cards, ...communityCards];
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCardStr = allCards.map(c => `${c.rank}${c.suit}`).join(' ');
    
    console.log(`[HOLM MULTI] ---------- ${playerName} ----------`);
    console.log(`[HOLM MULTI] Player cards RAW:`, JSON.stringify(e.cards));
    console.log(`[HOLM MULTI] Player cards: ${playerCardStr}`);
    console.log(`[HOLM MULTI] All cards: ${allCardStr}`);
    console.log(`[HOLM MULTI] ${playerName} STORED EVAL: rank=${e.evaluation.rank}, value=${e.evaluation.value}`);
    
    // Re-evaluate with full logging to debug
    const eval2 = evaluateHand(allCards, false);
    const handDesc = formatHandRankDetailed(allCards, false);
    console.log(`[HOLM MULTI] ${playerName} FRESH EVAL: ${handDesc} | rank: ${eval2.rank} | value: ${eval2.value}`);
    
    // CRITICAL: Check if stored eval matches fresh eval
    if (e.evaluation.value !== eval2.value || e.evaluation.rank !== eval2.rank) {
      console.error(`[HOLM MULTI] ⚠️ MISMATCH for ${playerName}! stored: ${e.evaluation.rank}/${e.evaluation.value}, fresh: ${eval2.rank}/${eval2.value}`);
    }
  });

  // Find winner(s)
  const maxValue = Math.max(...evaluations.map(e => e.evaluation.value));
  console.log('[HOLM MULTI] Max evaluation value:', maxValue);
  
  // CRITICAL DEBUG: Log all player values to help identify why ties happen
  console.log('[HOLM MULTI] ===== ALL PLAYER VALUES (TIE DEBUG) =====');
  evaluations.forEach(e => {
    const name = e.player.profiles?.username || e.player.user_id;
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCardsStr = [...e.cards, ...communityCards].map(c => `${c.rank}${c.suit}`).join(' ');
    console.log(`[HOLM MULTI] ${name}: cards=[${playerCardStr}] all=[${allCardsStr}] rank=${e.evaluation.rank} value=${e.evaluation.value} isMax=${e.evaluation.value === maxValue}`);
  });
  
  const winners = evaluations.filter(e => e.evaluation.value === maxValue);
  const losers = evaluations.filter(e => e.evaluation.value < maxValue);
  
  // CRITICAL: Enhanced tie detection logging to catch miscalculations
  if (winners.length > 1) {
    console.error('[HOLM MULTI] ⚠️⚠️⚠️ TIE DETECTED - CHECK FOR EVALUATION BUG ⚠️⚠️⚠️');
    console.error('[HOLM MULTI] Tied player count:', winners.length);
    winners.forEach((w, i) => {
      const name = w.player.profiles?.username || w.player.user_id;
      const playerCardStr = w.cards.map(c => `${c.rank}${c.suit}`).join(' ');
      const allCards = [...w.cards, ...communityCards];
      const allCardStr = allCards.map(c => `${c.rank}${c.suit}`).join(' ');
      const handDesc = formatHandRankDetailed(allCards, false);
      console.error(`[HOLM MULTI] TIE ${i+1}: ${name}`);
      console.error(`[HOLM MULTI]   Player cards: ${playerCardStr}`);
      console.error(`[HOLM MULTI]   All cards: ${allCardStr}`);
      console.error(`[HOLM MULTI]   Hand: ${handDesc}`);
      console.error(`[HOLM MULTI]   Rank: ${w.evaluation.rank}`);
      console.error(`[HOLM MULTI]   Value: ${w.evaluation.value}`);
    });
    // Also log what hand rank type each has for easier debugging
    const handTypes = winners.map(w => w.evaluation.rank);
    const uniqueTypes = [...new Set(handTypes)];
    if (uniqueTypes.length > 1) {
      console.error(`[HOLM MULTI] ❌ BUG DETECTED: Different hand types are tied! Types: ${uniqueTypes.join(', ')}`);
    }
  } else {
    console.log('[HOLM MULTI] Single winner - no tie');
  }
  console.log('[HOLM MULTI] Winners count:', winners.length, 'Losers count:', losers.length);

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
    // Get detailed hand description for winner
    const winnerAllCards = [...winner.cards, ...communityCards];
    const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
    
    const { error: updateError } = await supabase
      .from('games')
      .update({
        last_round_result: `${winnerUsername} wins with ${winnerHandDesc} and takes $${roundPot}!`,
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
    
    // Deal Chucky cards (4 cards for Holm game) - EXCLUDE used cards
    // Get all player cards for this round to exclude from Chucky's deck
    const { data: allPlayerCardsForChucky } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('round_id', roundId);
    
    // Collect all used cards
    const usedCards = new Set<string>();
    
    // Add community cards
    communityCards.forEach(card => {
      usedCards.add(`${card.suit}-${card.rank}`);
    });
    
    // Add all player cards
    if (allPlayerCardsForChucky) {
      allPlayerCardsForChucky.forEach(pc => {
        const cards = pc.cards as unknown as Card[];
        cards.forEach(card => {
          usedCards.add(`${card.suit}-${card.rank}`);
        });
      });
    }
    
    // Create deck excluding used cards
    const fullDeck = createDeck();
    const availableCards = fullDeck.filter(card => !usedCards.has(`${card.suit}-${card.rank}`));
    const shuffledAvailable = shuffleDeck(availableCards);
    
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);
    
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
    const chuckyHandDesc = formatHandRankDetailed(chuckyAllCards, false);
    
    console.log('[HOLM TIE] Chucky hand:', chuckyHandDesc, 'value:', chuckyEval.value);
    
    const playersBeatChucky = winners.filter(w => w.evaluation.value > chuckyEval.value);
    const playersLoseToChucky = winners.filter(w => w.evaluation.value <= chuckyEval.value);
    
    console.log('[HOLM TIE] Players beat Chucky:', playersBeatChucky.length, 'Players lose:', playersLoseToChucky.length);
    
    if (playersBeatChucky.length === 0) {
      // All tied players lost to Chucky - they all match pot (capped)
      console.log('[HOLM TIE] Chucky beats all tied players, roundPot:', roundPot);
      
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(roundPot, game.pot_max_value) 
        : roundPot;
      
      console.log('[HOLM TIE] Each loser pays potMatchAmount:', potMatchAmount);
      
      let totalMatched = 0;
      let loserNames: string[] = [];
      
      for (const loser of playersLoseToChucky) {
        const loserUsername = loser.player.profiles?.username || loser.player.user_id;
        loserNames.push(loserUsername);
        
        console.log('[HOLM TIE] Deducting', potMatchAmount, 'from', loserUsername, 'current chips:', loser.player.chips);
        
        await supabase
          .from('players')
          .update({ chips: loser.player.chips - potMatchAmount })
          .eq('id', loser.player.id);
        
        totalMatched += potMatchAmount;
      }
      
      console.log('[HOLM TIE] Total matched from all losers:', totalMatched, '(', playersLoseToChucky.length, 'players)');
      
      const newPot = roundPot + totalMatched;
      
      await supabase
        .from('games')
        .update({
          last_round_result: `Tie broken by Chucky! ${loserNames.join(' and ')} lose to Chucky's ${chuckyHandDesc}. $${totalMatched} added to pot.`,
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
      // Some (or all) tied players beat Chucky - GAME ENDS, Chucky lost
      console.log('[HOLM TIE] Players beat Chucky - GAME OVER');
      
      // Winners split the pot
      const splitAmount = Math.floor(roundPot / playersBeatChucky.length);
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
      
      // If there are losers to Chucky, they still pay - but game ends regardless
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(roundPot, game.pot_max_value) 
        : roundPot;
      
      for (const loser of playersLoseToChucky) {
        await supabase
          .from('players')
          .update({ chips: loser.player.chips - potMatchAmount })
          .eq('id', loser.player.id);
      }
      
      // Reset all players for new game
      console.log('[HOLM TIE] Resetting player states for new game');
      await supabase
        .from('players')
        .update({ 
          status: 'active',
          current_decision: null,
          decision_locked: false,
          ante_decision: null
        })
        .eq('game_id', gameId);
      
      // First show the result announcement (round stays completed, game stays in_progress)
      console.log('[HOLM TIE] *** PLAYERS BEAT CHUCKY! Showing announcement. ***');
      
      await supabase
        .from('games')
        .update({
          last_round_result: `${winnerNames.join(' and ')} beat Chucky and take $${roundPot}!`
        })
        .eq('id', gameId);
      
      // 2-second delay for players to see the winning announcement
      console.log('[HOLM TIE] Pausing 2 seconds for announcement...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Calculate next dealer position (rotate clockwise to next HUMAN, non-sitting-out player)
      const { data: eligibleDealers } = await supabase
        .from('players')
        .select('position, is_bot, sitting_out')
        .eq('game_id', gameId)
        .eq('sitting_out', false)
        .eq('is_bot', false)
        .order('position', { ascending: true });
      
      const currentDealerPosition = game.dealer_position || 1;
      let nextDealerPosition = currentDealerPosition;
      
      if (eligibleDealers && eligibleDealers.length > 0) {
        const eligiblePositions = eligibleDealers.map(p => p.position);
        const currentDealerIndex = eligiblePositions.indexOf(currentDealerPosition);
        
        if (currentDealerIndex === -1) {
          nextDealerPosition = eligiblePositions[0];
        } else {
          const nextDealerIndex = (currentDealerIndex + 1) % eligiblePositions.length;
          nextDealerPosition = eligiblePositions[nextDealerIndex];
        }
      }
      
      // Game ends - players beat Chucky
      await supabase
        .from('games')
        .update({
          status: 'game_over',
          game_over_at: new Date().toISOString(),
          dealer_position: nextDealerPosition,
          buck_position: null,
          total_hands: 0,
          pot: 0,
          awaiting_next_round: true
        })
        .eq('id', gameId);
      
      console.log('[HOLM TIE] Game over - Chucky was beaten by tied players');
      return; // Early return - game is over
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
  // CRITICAL: Pass the new buck position explicitly to avoid race conditions
  await startHolmRound(gameId, false, newBuckPosition);
  
  // Clear awaiting flag
  await supabase
    .from('games')
    .update({ awaiting_next_round: false })
    .eq('id', gameId);

  console.log('[HOLM NEXT] Next hand ready');
}
