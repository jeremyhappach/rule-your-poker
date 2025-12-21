import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, type Suit, type Rank, evaluateHand, formatHandRank, formatHandRankDetailed } from "./cardUtils";
import { getDisplayName } from "./botAlias";
import { recordGameResult } from "./gameLogic";

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

  // CRITICAL: For Holm games, always use the LATEST round by round_number
  // game.current_round can be stale due to race conditions
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();
    
  if (!round) {
    console.log('[HOLM CHECK] Round not found');
    return;
  }
  
  console.log('[HOLM CHECK] Using latest round:', round.round_number, '(game.current_round was:', game.current_round, ')');
  
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
    // CRITICAL: Check if all_decisions_in is ALREADY true (another call beat us)
    // This prevents multiple concurrent calls from all triggering endHolmRound
    if (game.all_decisions_in) {
      console.log('[HOLM CHECK] all_decisions_in already true - another call already processing, skipping');
      return;
    }
    
    // CRITICAL: Also check round status - if already processing/showdown/completed, skip
    if (round.status === 'processing' || round.status === 'showdown' || round.status === 'completed') {
      console.log('[HOLM CHECK] Round already in status:', round.status, '- skipping duplicate call');
      return;
    }
    
    console.log('[HOLM CHECK] All players decided, attempting atomic all_decisions_in flag set');
    
    // CRITICAL: Use atomic guard to prevent race conditions / duplicate endHolmRound calls
    const { data: updateResult, error: updateError } = await supabase
      .from('games')
      .update({ all_decisions_in: true })
      .eq('id', gameId)
      .eq('all_decisions_in', false) // Only update if not already set - atomic guard
      .select();
    
    // Only the first call that successfully sets the flag should proceed
    if (updateError || !updateResult || updateResult.length === 0) {
      console.log('[HOLM CHECK] Another client already set all_decisions_in - skipping duplicate endHolmRound');
      return;
    }
    
    console.log('[HOLM CHECK] Successfully acquired lock, proceeding with endHolmRound');
    
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
    // CRITICAL: Re-fetch the current player's state to ensure we have fresh data
    const { data: freshCurrentPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .eq('position', round.current_turn_position)
      .eq('status', 'active')
      .eq('sitting_out', false)
      .maybeSingle();
    
    console.log('[HOLM CHECK] Fresh current player data:', {
      position: freshCurrentPlayer?.position,
      decision_locked: freshCurrentPlayer?.decision_locked,
      current_decision: freshCurrentPlayer?.current_decision
    });
    
    if (freshCurrentPlayer?.decision_locked && freshCurrentPlayer.current_decision !== null) {
      console.log('[HOLM CHECK] Current player decided, moving to next turn from position', round.current_turn_position);
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
  
  // CRITICAL: For Holm games, always use the LATEST round by round_number
  // game.current_round can be stale due to race conditions
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (!round) {
    console.error('[HOLM TURN] ERROR: No rounds found for game');
    return;
  }
  
  console.log('[HOLM TURN] Using latest round:', round.round_number, '(game.current_round was:', game.current_round, ')');
  
  const { data: allPlayers } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');
    
  if (!allPlayers || allPlayers.length === 0) {
    console.error('[HOLM TURN] ERROR: No active players found');
    return;
  }
  
  // CRITICAL FIX: Only consider players who have NOT yet made their decision
  // Players with decision_locked=true have already acted (stayed or folded)
  // We should NOT advance the turn to them - skip them entirely
  const undecidedPlayers = allPlayers.filter(p => !p.decision_locked);
  
  console.log('[HOLM TURN] All active players:', allPlayers.map(p => ({ pos: p.position, locked: p.decision_locked, decision: p.current_decision })));
  console.log('[HOLM TURN] Undecided players:', undecidedPlayers.map(p => p.position));
  
  if (undecidedPlayers.length === 0) {
    console.log('[HOLM TURN] No undecided players left - should trigger round completion');
    return;
  }
  
  const positions = undecidedPlayers.map(p => p.position).sort((a, b) => a - b);
  const currentIndex = positions.indexOf(round.current_turn_position);
  
  // CRITICAL: Turn order should be CLOCKWISE from buck, which means:
  // In a 7-seat table with positions [1,2,4], if we're at position 4,
  // the next clockwise position is 1 (wrapping around), not 2
  // We need to find the next HIGHER position, wrapping to lowest if at max
  let nextPosition: number;
  
  // Find the next position that is HIGHER than current, or wrap to lowest
  const higherPositions = positions.filter(p => p > round.current_turn_position);
  if (higherPositions.length > 0) {
    // There's a higher position, take the lowest one (next clockwise)
    nextPosition = Math.min(...higherPositions);
  } else {
    // No higher positions, wrap to the lowest position
    nextPosition = Math.min(...positions);
  }
  
  console.log('[HOLM TURN] *** MOVING TURN from position', round.current_turn_position, 'to', nextPosition, '***');
  console.log('[HOLM TURN] positions:', positions, 'currentIndex:', currentIndex, 'nextPosition (clockwise):', nextPosition);
  
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
  
  // CRITICAL ATOMIC GUARD (Holm first hand): do NOT flip status to in_progress yet.
  // Flipping status early makes clients fetch rounds while OLD rounds still exist, causing stale cards.
  // Instead, atomically clear is_first_hand as a lock while keeping status in ante_decision.
  if (isFirstHand) {
    const { data: lockResult, error: lockError } = await supabase
      .from('games')
      .update({ is_first_hand: false })
      .eq('id', gameId)
      .eq('status', 'ante_decision')
      .eq('is_first_hand', true)
      .select();

    if (lockError || !lockResult || lockResult.length === 0) {
      console.log('[HOLM] ⚠️ ATOMIC GUARD: Another client already started the first hand, skipping');
      return;
    }
    console.log('[HOLM] ✅ Successfully acquired first-hand lock (is_first_hand -> false)');

    // CRITICAL: Remove any old rounds/cards IMMEDIATELY while we are still in ante_decision,
    // so no client can fetch and render a previous hand during the dealing window.
    console.log('[HOLM] FIRST HAND - deleting any existing rounds/player_cards BEFORE dealing');
    const { data: oldRounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId);

    if (oldRounds && oldRounds.length > 0) {
      const oldRoundIds = oldRounds.map(r => r.id);
      await supabase
        .from('player_cards')
        .delete()
        .in('round_id', oldRoundIds);

      await supabase
        .from('rounds')
        .delete()
        .eq('game_id', gameId);

      console.log('[HOLM] Deleted', oldRounds.length, 'old rounds before first hand');
    }
  }
  
  // CRITICAL FIX: Before creating any new round, mark ALL existing non-completed rounds as completed
  // This prevents the "round misalignment" bug where multiple betting rounds exist simultaneously
  // and hand evaluation uses community cards from the wrong round
  // NOTE: Skip on first hand because we delete any old rounds above.
  if (!isFirstHand) {
    console.log('[HOLM] Cleaning up any non-completed rounds before creating new hand...');

    const { data: nonCompletedRounds } = await supabase
      .from('rounds')
      .select('id, round_number, status')
      .eq('game_id', gameId)
      .neq('status', 'completed');

    if (nonCompletedRounds && nonCompletedRounds.length > 0) {
      console.log('[HOLM] Found', nonCompletedRounds.length, 'non-completed rounds to clean up:',
        nonCompletedRounds.map(r => ({ id: r.id, round: r.round_number, status: r.status })));

      // Mark all non-completed rounds as completed
      const roundIds = nonCompletedRounds.map(r => r.id);
      await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .in('id', roundIds);

      console.log('[HOLM] ✅ Marked', roundIds.length, 'rounds as completed');
    }
  }
  
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
    // First hand - buck starts one position to the LEFT of dealer (clockwise order)
    // In clockwise rotation, LEFT means the NEXT higher position number
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
      
      // Get the NEXT position in clockwise order (one to the LEFT of dealer)
      // Clockwise = ascending position numbers, wrapping from max to min
      const nextIndex = (dealerIndex + 1) % occupiedPositions.length;
      buckPosition = occupiedPositions[nextIndex];
      console.log('[HOLM] Occupied positions:', occupiedPositions, 'Dealer at index:', dealerIndex, 'Buck goes to index:', nextIndex, 'position:', buckPosition);
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
    
    // Use atomic decrement to prevent race conditions / double charges
    const playerIds = players.map(p => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount
    });
    
    if (anteError) {
      console.error('[HOLM] ERROR collecting antes:', anteError);
    } else {
      console.log('[HOLM] Antes collected atomically from', playerIds.length, 'players, amount:', anteAmount);
    }
    
    potForRound = players.length * anteAmount;
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

  // CRITICAL FIX: For Holm games, current_round = 1 and is_first_hand = true is set in DealerConfig
  // On first hand: use current_round (already 1), then set is_first_hand = false
  // On subsequent hands: only increment if is_first_hand = false
  let nextRoundNumber: number;
  
  if (isFirstHand) {
    console.log('[HOLM] FIRST HAND - using current_round = 1');
    // Use current_round from game (pre-seeded to 1 during setup)
    nextRoundNumber = gameConfig.current_round || 1;
  } else {
    // Subsequent hand - check is_first_hand flag
    // If is_first_hand = true, DON'T increment (just set flag to false)
    // If is_first_hand = false, increment normally
    if (gameConfig.is_first_hand) {
      console.log('[HOLM] is_first_hand = true, using current_round without incrementing');
      nextRoundNumber = gameConfig.current_round || 1;
      // Set is_first_hand = false (done below in the game update)
    } else {
      // Normal increment from max existing round
      const { data: maxRoundData } = await supabase
        .from('rounds')
        .select('round_number')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      nextRoundNumber = (maxRoundData?.round_number || 0) + 1;
    }
  }
  
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

  // Get hand_number for this game
  // In Holm, each hand is one game cycle until someone beats Chucky or Chucky wins
  const handNumber = gameConfig.total_hands || 1;

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
      current_turn_position: buckPosition,
      hand_number: handNumber
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

  // Update game status AND current_round for Holm games
  // CRITICAL: current_round MUST be updated so MobileGameTable can detect new rounds
  // Also set is_first_hand = false after first hand is dealt
  console.log('[HOLM] Updating game status with current_round:', nextRoundNumber, 'is_first_hand will be set to false');
  const { error: gameUpdateError } = await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: nextRoundNumber, // RESTORED: Must update for round detection
      buck_position: buckPosition,
      all_decisions_in: false,
      last_round_result: null,
      is_first_hand: false // CRITICAL: Clear flag after first hand is dealt
    })
    .eq('id', gameId);

  if (gameUpdateError) {
    console.error('[HOLM] ERROR updating game status:', gameUpdateError);
  } else {
    console.log('[HOLM] ✅ Successfully updated game status, buck_position:', buckPosition);
  }

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

  // CRITICAL: Fetch the MOST RECENT round by round_number, not game.current_round
  // This prevents issues when current_round is stale due to race conditions
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) {
    console.log('[HOLM END] ERROR: No rounds found for game');
    return;
  }
  
  console.log('[HOLM END] Using most recent round:', round.round_number, '(game.current_round was:', game.current_round, ')');

  // Guard: Prevent multiple simultaneous calls - if round is completed, processing, or Chucky is already active, exit
  // Check status and chucky_active to prevent race conditions
  if (round.status === 'completed' || round.status === 'showdown' || round.status === 'processing' || round.chucky_active) {
    console.log('[HOLM END] Round already being processed or completed, skipping', {
      status: round.status,
      chucky_active: round.chucky_active
    });
    return;
  }

  // CRITICAL ATOMIC GUARD: Atomically mark round as 'processing' to prevent concurrent calls
  // This is the PRIMARY guard against double-charging - only the first call to successfully
  // transition from 'betting' to 'processing' will proceed
  const capturedRoundId = round.id;
  const capturedRoundNumber = round.round_number;
  console.log('[HOLM END] Attempting atomic lock on round:', capturedRoundId, 'round_number:', capturedRoundNumber);
  
  const { data: lockResult, error: lockError } = await supabase
    .from('rounds')
    .update({ status: 'processing' })
    .eq('id', capturedRoundId)
    .eq('status', 'betting') // ATOMIC GUARD: Only succeeds if still in 'betting' status
    .select();
    
  if (lockError || !lockResult || lockResult.length === 0) {
    console.log('[HOLM END] ⚠️ ATOMIC GUARD: Another client already acquired lock on this round, skipping');
    return;
  }
  console.log('[HOLM END] ✅ Successfully acquired atomic lock on round (status -> processing)');

  console.log('[HOLM END] Round data:', {
    id: capturedRoundId,
    status: 'processing (just set)',
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
  // CRITICAL: Only fetch players who are ACTIVE AND NOT SITTING OUT
  // This ensures we don't count sitting-out bots or observers in our stayed/folded calculations
  const { data: players } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || players.length === 0) {
    console.log('[HOLM END] ERROR: No active, non-sitting-out players found');
    return;
  }

  // CRITICAL FIX: Fetch ALL player cards NOW, BEFORE any delays or status changes
  // This prevents race conditions where cards get deleted/modified during delays
  console.log('[HOLM END] ⚠️ FETCHING ALL PLAYER CARDS IMMEDIATELY (before any delays) ⚠️');
  const { data: allPlayerCardsData, error: cardsError } = await supabase
    .from('player_cards')
    .select('*, players!inner(*, profiles(username))')
    .eq('round_id', round.id);
  
  if (cardsError) {
    console.error('[HOLM END] ERROR fetching player cards:', cardsError);
  }
  
  console.log('[HOLM END] Cached player cards count:', allPlayerCardsData?.length || 0);
  allPlayerCardsData?.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM END] Cached cards for ${playerData?.profiles?.username}: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });

  const stayedPlayers = players.filter(p => p.current_decision === 'stay');
  const activePlayers = players.filter(p => p.status === 'active' && !p.sitting_out);

  // CRITICAL DEBUG: Log exact player IDs to verify correct game context
  console.log('[HOLM END] ⚠️ PLAYER ID DEBUG ⚠️');
  console.log('[HOLM END] Game ID:', gameId);
  console.log('[HOLM END] Round ID:', round.id);
  players.forEach(p => {
    console.log(`[HOLM END] Player: ${p.profiles?.username} | ID: ${p.id} | position: ${p.position} | decision: ${p.current_decision}`);
  });
  console.log('[HOLM END] Stayed players:');
  stayedPlayers.forEach(p => {
    console.log(`[HOLM END]   - ${p.profiles?.username} | ID: ${p.id}`);
  });

  console.log('[HOLM END] Player decisions:', {
    total: players.length,
    stayed: stayedPlayers.length,
    folded: players.length - stayedPlayers.length,
    stayedPositions: stayedPlayers.map(p => p.position)
  });

  // Case 1: Everyone folded - pussy tax
  if (stayedPlayers.length === 0) {
    console.log('[HOLM END] ⚠️⚠️⚠️ Case 1: Everyone folded, applying pussy tax ⚠️⚠️⚠️');
    console.log('[HOLM END] PUSSY TAX DEBUG - Round ID:', capturedRoundId, 'Round Number:', capturedRoundNumber);
    const pussyTaxEnabled = game.pussy_tax_enabled ?? true;
    const pussyTaxAmount = pussyTaxEnabled ? (game.pussy_tax_value || 1) : 0;
    
    console.log('[HOLM END] PUSSY TAX DEBUG - Enabled:', pussyTaxEnabled, 'Amount:', pussyTaxAmount);
    console.log('[HOLM END] PUSSY TAX DEBUG - Active players:', activePlayers.map(p => ({ id: p.id, position: p.position, chips: p.chips })));
    
    let totalTaxCollected = 0;
    if (pussyTaxAmount > 0) {
      // Use atomic relative decrement to prevent race conditions / double charges
      const playerIds = activePlayers.map(p => p.id);
      console.log('[HOLM END] PUSSY TAX DEBUG - About to call RPC decrement_player_chips with playerIds:', playerIds, 'amount:', pussyTaxAmount);
      
      const { error: taxError } = await supabase.rpc('decrement_player_chips', {
        player_ids: playerIds,
        amount: pussyTaxAmount
      });
      
      console.log('[HOLM END] PUSSY TAX DEBUG - RPC result error:', taxError);
      
      if (taxError) {
        console.error('[HOLM END] Pussy tax decrement error:', taxError);
        console.log('[HOLM END] PUSSY TAX DEBUG - Running FALLBACK individual updates');
        // Fallback to individual updates if RPC doesn't exist
        for (const player of activePlayers) {
          await supabase
            .from('players')
            .update({ chips: player.chips - pussyTaxAmount })
            .eq('id', player.id);
        }
      } else {
        console.log('[HOLM END] PUSSY TAX DEBUG - RPC SUCCESS, NO fallback');
      }
      totalTaxCollected = pussyTaxAmount * activePlayers.length;
    }

    const newPot = game.pot + totalTaxCollected;
    const resultMessage = pussyTaxAmount > 0 
      ? `Pussy Tax!`
      : 'Everyone folded! No penalty.';

    console.log('[HOLM END] Pussy tax - old pot:', game.pot, 'tax collected:', totalTaxCollected, 'new pot:', newPot);

    // RABBIT HUNT: If enabled, reveal the 2 hidden community cards during pussy tax
    if (game.rabbit_hunt) {
      console.log('[HOLM END] Rabbit hunt enabled - revealing hidden community cards during pussy tax');
      await supabase
        .from('rounds')
        .update({ community_cards_revealed: 4 })
        .eq('id', capturedRoundId);
    }

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
      .eq('id', capturedRoundId);
    
    console.log('[HOLM END] Rounds pot update:', roundUpdateError ? `ERROR: ${roundUpdateError.message}` : 'SUCCESS');

    console.log('[HOLM END] Pussy tax case completed with new pot:', newPot);
    return;
  }

  // For single player vs Chucky, reveal all 4 community cards now
  // For multi-player showdown, we'll reveal the hidden cards AFTER exposing player cards
  if (stayedPlayers.length === 1) {
    // Single player - reveal all 4 community cards first
    console.log('[HOLM END] Single player - revealing all 4 community cards...', {
      roundId: capturedRoundId,
      currentlyRevealed: round.community_cards_revealed,
      targetRevealed: 4
    });
    
    const { error: revealError } = await supabase
      .from('rounds')
      .update({ community_cards_revealed: 4 })
      .eq('id', capturedRoundId);
    
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
    
    // Fetch all players for bot alias calculation
    const { data: allPlayersForAlias } = await supabase
      .from('players')
      .select('user_id, is_bot, created_at')
      .eq('game_id', gameId);
    const aliasPlayersList = allPlayersForAlias || [];
    
    const player = stayedPlayers[0];
    const playerUsername = getDisplayName(aliasPlayersList, player, player.profiles?.username || player.user_id);
    
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
      .eq('id', capturedRoundId);
    
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
      .eq('id', capturedRoundId);

    console.log('[HOLM END] Chucky cards stored, revealing one at a time with suspense...');
    
    // Reveal Chucky's cards one at a time with suspenseful delays
    // Wrapped in try-catch to ensure all cards get revealed even if individual updates fail
    try {
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
        const { error: revealError } = await supabase
          .from('rounds')
          .update({ chucky_cards_revealed: i })
          .eq('id', capturedRoundId);
        
        if (revealError) {
          console.error('[HOLM END] Error revealing card', i, ':', revealError);
        }
        console.log('[HOLM END] Revealed Chucky card', i, 'of', chuckyCardCount);
      }
    } catch (revealLoopError) {
      console.error('[HOLM END] Chucky reveal loop failed:', revealLoopError);
      // Force reveal all cards to prevent stuck state
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: chuckyCardCount })
        .eq('id', capturedRoundId);
      console.log('[HOLM END] Force-revealed all', chuckyCardCount, 'Chucky cards after error');
    }
    
    console.log('[HOLM END] All Chucky cards revealed');

    // Keep hand description visible - it will be replaced by result announcement after comparison
    // 2-second delay so players can compare hands before result
    console.log('[HOLM END] Pausing 2 seconds for players to compare hands...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Use round.pot as the authoritative pot value (game.pot may be stale)
    const roundPot = round.pot || game.pot || 0;
    try {
      await handleChuckyShowdown(gameId, capturedRoundId, player, communityCards, game, chuckyCards, roundPot);
    } catch (error) {
      console.error('[HOLM END] ERROR in handleChuckyShowdown:', error);
      // CRITICAL: On error, mark round as completed AND set awaiting_next_round to allow progression
      await supabase
        .from('rounds')
        .update({ status: 'completed', chucky_active: false })
        .eq('id', capturedRoundId);
      
      // Also update game to allow progression - this was missing and caused stuck games
      await supabase
        .from('games')
        .update({ 
          awaiting_next_round: true,
          last_round_result: 'Error occurred - advancing to next hand'
        })
        .eq('id', gameId);
      
      console.log('[HOLM END] Error recovery complete - set awaiting_next_round: true');
    }
    return;
  }

  // Case 3: Multiple players stayed - showdown (no Chucky)
  console.log('[HOLM END] Case 3: Multi-player showdown (no Chucky)');
  
  // Player cards are already visible to their owners, but now expose them to everyone
  // by marking the round as "showdown" phase - the UI will handle showing all cards
  console.log('[HOLM END] Exposing player cards for showdown - setting status to showdown...');
  
  // SET STATUS TO SHOWDOWN (from 'processing') so UI reveals player cards
  await supabase
    .from('rounds')
    .update({ status: 'showdown' })
    .eq('id', capturedRoundId);
  
  // 3 second delay for players to read exposed cards before revealing hidden community cards
  console.log('[HOLM END] Waiting 3 seconds for players to read exposed cards...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Now reveal the 2 hidden community cards (cards 3 and 4)
  console.log('[HOLM END] Revealing hidden community cards...');
  
  // Use round.pot as the authoritative pot value (game.pot may be stale)
  const roundPot = round.pot || game.pot || 0;
  
  // CRITICAL: Pass the cached cards (fetched at START of endHolmRound) to avoid race conditions
  await handleMultiPlayerShowdown(gameId, capturedRoundId, stayedPlayers, communityCards, game, roundPot, allPlayerCardsData || []);
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

  // Fetch all players for bot alias calculation
  const { data: allPlayers } = await supabase
    .from('players')
    .select('user_id, is_bot, created_at')
    .eq('game_id', gameId);
  const playersList = allPlayers || [];

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
  
  // Get player display name (bot alias for bots, username for humans)
  const playerUsername = getDisplayName(playersList, player, player.profiles?.username || player.user_id);

  if (playerWins) {
    console.log('[HOLM SHOWDOWN] Player wins! Pot:', roundPot);
    // Player beats Chucky - award pot, GAME OVER (Holm game ends when you beat Chucky)
    // Note: Holm game doesn't use legs system
    
    // Record game result for hand history
    const playerChipChanges: Record<string, number> = {};
    playerChipChanges[player.id] = roundPot;
    
    await recordGameResult(
      gameId,
      (game.total_hands || 0) + 1,
      player.id,
      playerUsername,
      playerHandDesc,
      roundPot,
      playerChipChanges,
      false
    );
    
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
    // Include pot amount in message for the celebration component to parse
    await supabase
      .from('games')
      .update({
        last_round_result: `${playerUsername} beat Chucky with ${playerHandDesc}!|||POT:${roundPot}`
      })
      .eq('id', gameId);
    
    // NOTE: Dealer rotation is NOT done here - it's done in handleGameOverComplete
    // AFTER evaluating player states (waiting → active, sit_out_next_hand → sitting_out, etc.)
    // This ensures the new dealer is selected based on post-evaluation player states
    console.log('[HOLM SHOWDOWN] NOT rotating dealer here - will be done in handleGameOverComplete after player state evaluation');
    
    // Set game_over status WITHOUT game_over_at - frontend will show celebration first
    // Then set game_over_at after celebration completes to auto-proceed
    // NOTE: dealer_position is NOT changed here - rotation happens in handleGameOverComplete
    const { error: gameOverError } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        game_over_at: null, // NULL - frontend celebration will set this after completing
        pot: 0,
        awaiting_next_round: false,
        // dealer_position is NOT updated here - rotation happens after player state evaluation
        buck_position: null,
        total_hands: (game.total_hands || 0) + 1
      })
      .eq('id', gameId);
    
    if (gameOverError) {
      console.error('[HOLM SHOWDOWN] ERROR setting game_over status:', gameOverError);
    } else {
      console.log('[HOLM SHOWDOWN] Successfully set game_over status (dealer rotation deferred to handleGameOverComplete)');
    }
  } else {
    // Check if it's a tie (player equals Chucky) vs Chucky actually winning
    const isTie = playerEval.value === chuckyEval.value;
    console.log('[HOLM SHOWDOWN] Chucky wins!', isTie ? '(TIE - Chucky wins ties)' : '(Chucky has better hand)');
    
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

    // Use atomic decrement to prevent race conditions / stale chip values
    const { error: chipError } = await supabase.rpc('decrement_player_chips', {
      player_ids: [player.id],
      amount: potMatchAmount
    });
    
    if (chipError) {
      console.error('[HOLM SHOWDOWN] ERROR deducting chips:', chipError);
    } else {
      console.log('[HOLM SHOWDOWN] Player chips deducted atomically by:', potMatchAmount);
    }

    const newPot = roundPot + potMatchAmount;

    console.log('[HOLM SHOWDOWN] Pot update - old:', roundPot, 'adding:', potMatchAmount, 'new:', newPot);

    // Use different message for tie vs actual loss
    const resultMessage = isTie 
      ? `Ya tie but ya lose!`
      : `Chucky beat ${playerUsername} with ${chuckyHandDesc}`;

    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        last_round_result: resultMessage,
        pot: newPot,
        awaiting_next_round: true  // Let frontend detect and animate
      })
      .eq('id', gameId);
    
    console.log('[HOLM SHOWDOWN] Games pot update:', gameUpdateError ? `ERROR: ${gameUpdateError.message}` : 'SUCCESS - pot set to ' + newPot);
    
    // Mark round complete and hide Chucky
    await supabase
      .from('rounds')
      .update({ 
        status: 'completed',
        chucky_active: false
      })
      .eq('id', roundId);
    
    // Frontend will handle the animation and transition via awaiting_next_round
    console.log('[HOLM SHOWDOWN] Chucky won - awaiting_next_round set, frontend will handle transition');
    return;
  }

  // Mark round complete but KEEP Chucky visible for result display (player win case - handled above)
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
 * CRITICAL: cachedPlayerCards is fetched at START of endHolmRound to prevent race conditions
 */
async function handleMultiPlayerShowdown(
  gameId: string,
  roundId: string,
  stayedPlayers: any[],
  communityCards: Card[],
  game: any,
  roundPot: number,
  cachedPlayerCards: any[]  // Cards fetched BEFORE any delays in endHolmRound
) {
  console.log('[HOLM MULTI] ========== handleMultiPlayerShowdown ==========');
  console.log('[HOLM MULTI] gameId:', gameId);
  console.log('[HOLM MULTI] roundId:', roundId);
  console.log('[HOLM MULTI] PASSED stayedPlayers count:', stayedPlayers.length);
  console.log('[HOLM MULTI] CACHED player cards count:', cachedPlayerCards.length);
  stayedPlayers.forEach(p => {
    console.log(`[HOLM MULTI] PASSED Stayed player: ${p.profiles?.username} | ID: ${p.id} | position: ${p.position}`);
  });
  cachedPlayerCards.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM MULTI] CACHED cards for ${playerData?.profiles?.username}: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });
  console.log('[HOLM MULTI] roundPot:', roundPot, 'game.pot:', game.pot);

  // Fetch all players for bot alias calculation
  const { data: allPlayers } = await supabase
    .from('players')
    .select('user_id, is_bot, created_at')
    .eq('game_id', gameId);
  const playersList = allPlayers || [];

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

  console.log('[HOLM MULTI] Evaluating hands using CACHED cards (fetched before delays)...');

  // CRITICAL: Filter cachedPlayerCards to only include players who stayed
  // cachedPlayerCards contains ALL player cards for the round (including folded players)
  // stayedPlayers contains only players who have current_decision='stay'
  const stayedPlayerIds = new Set(stayedPlayers.map(p => p.id));
  console.log('[HOLM MULTI] stayedPlayerIds:', Array.from(stayedPlayerIds));
  
  const cardsOfStayedPlayers = cachedPlayerCards.filter(pc => stayedPlayerIds.has(pc.player_id));
  
  console.log('[HOLM MULTI] CACHED cards count (all):', cachedPlayerCards.length);
  console.log('[HOLM MULTI] FILTERED to stayed players:', cardsOfStayedPlayers.length);
  cardsOfStayedPlayers.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM MULTI] Stayed player ${playerData?.profiles?.username} | ID: ${pc.player_id} | Cards: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });

  // Get current round number for debug data
  const { data: currentRoundData } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('id', roundId)
    .single();
  
  const currentRoundNumber = currentRoundData?.round_number || 0;

  // CRITICAL: Use cardsOfStayedPlayers (derived from player_cards join) instead of passed-in stayedPlayers
  // This ensures player_id values match exactly with the cards stored for this round
  const evaluations = cardsOfStayedPlayers.map((cardRecord) => {
    const playerData = cardRecord.players as any;
    const username = playerData?.profiles?.username || 'unknown';
    
    console.log(`[HOLM MULTI] Evaluating cards for: ${username} | ID: ${cardRecord.player_id}`);
    
    // Parse cards directly from the card record (guaranteed to match)
    const rawCards = (cardRecord.cards as unknown as any[]) || [];
    const playerCards: Card[] = rawCards.map(c => ({
      suit: (c.suit || c.Suit || '') as Suit,
      rank: String(c.rank || c.Rank || '').toUpperCase() as Rank
    })).filter(c => c.suit && c.rank);
    
    console.log(`[HOLM MULTI] ${username}: ${playerCards.length} cards from record`);
    
    if (playerCards.length !== 4) {
      console.error(`[HOLM MULTI] ⚠️ INVALID CARD COUNT for ${username}: expected 4, got ${playerCards.length}`);
    }
    
    const allCards = [...playerCards, ...communityCards];
    console.log(`[HOLM MULTI] ${username} total cards for eval: ${allCards.length} (${playerCards.length} player + ${communityCards.length} community)`);
    
    const evaluation = evaluateHand(allCards, false); // No wild cards in Holm
    
    console.log(`[HOLM MULTI] ${username} hand: ${playerCards.map(c => `${c.rank}${c.suit}`).join(' ')} | eval: rank=${evaluation.rank} value=${evaluation.value}`);

    return {
      player: {
        id: cardRecord.player_id,
        position: playerData?.position,
        chips: playerData?.chips || 0,
        profiles: playerData?.profiles,
        user_id: playerData?.user_id,
        is_bot: playerData?.is_bot || false
      },
      evaluation,
      cards: playerCards
    };
  });

  // Debug: Log each player's evaluation with detailed hand description
  console.log('[HOLM MULTI] ========== HAND EVALUATIONS (RAW DATA) ==========');
  console.log('[HOLM MULTI] Community cards RAW:', JSON.stringify(communityCards));
  console.log('[HOLM MULTI] Community cards:', communityCards.map(c => `${c.rank}${c.suit}`).join(' '));
  console.log('[HOLM MULTI] Community cards count:', communityCards.length);
  
  // Log evaluations - NO re-evaluation, just use stored values
  evaluations.forEach(e => {
    const playerName = e.player.profiles?.username || e.player.user_id;
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCardStr = [...e.cards, ...communityCards].map(c => `${c.rank}${c.suit}`).join(' ');
    const handDesc = formatHandRankDetailed([...e.cards, ...communityCards], false);
    
    console.log(`[HOLM MULTI] ${playerName}: cards=[${playerCardStr}] all=[${allCardStr}] hand=${handDesc} rank=${e.evaluation.rank} value=${e.evaluation.value}`);
  });

  // Build debug data for each player before finding winner
  const debugEvaluations = evaluations.map(e => {
    const playerName = e.player.profiles?.username || e.player.user_id.substring(0, 8);
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCards = [...e.cards, ...communityCards];
    const handDesc = formatHandRankDetailed(allCards, false);
    return {
      name: playerName,
      playerId: e.player.id,
      cards: playerCardStr,
      cardCount: e.cards.length,
      handDesc: handDesc,
      value: e.evaluation.value,
      rank: e.evaluation.rank
    };
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
    const winnerUsername = getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id);
    
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

    // Use atomic decrement to prevent race conditions / stale chip values
    const loserPlayerIds = losers.map(l => l.player.id);
    const { error: loserChipError } = await supabase.rpc('decrement_player_chips', {
      player_ids: loserPlayerIds,
      amount: potMatchAmount
    });
    
    if (loserChipError) {
      console.error('[HOLM MULTI] ERROR deducting loser chips:', loserChipError);
    } else {
      console.log('[HOLM MULTI] Loser chips deducted atomically, amount:', potMatchAmount);
    }
    
    let newPot = losers.length * potMatchAmount;

    // Set pot to losers' matched amount (no re-anting in Holm)
    console.log('[HOLM MULTI] New pot from losers match:', newPot);
    // Get detailed hand description for winner
    const winnerAllCards = [...winner.cards, ...communityCards];
    const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
    
    // Build debug data object to embed in result message
    const debugData = {
      roundId: roundId,
      roundNumber: currentRoundNumber,
      communityCards: communityCards.map(c => `${c.rank}${c.suit}`).join(' '),
      evaluations: debugEvaluations,
      winnerId: winner.player.id,
      winnerName: winnerUsername,
      maxValue: maxValue
    };
    
    // Embed debug JSON after the result message with a delimiter
    // Include both pot (winner takes) and matchAmount (losers pay) for animation coordination
    const loserIds = losers.map(l => l.player.id).join(',');
    const resultWithDebug = `${winnerUsername} won with ${winnerHandDesc}|||WINNER:${winner.player.id}|||LOSERS:${loserIds}|||POT:${roundPot}|||MATCH:${potMatchAmount}|||DEBUG:${JSON.stringify(debugData)}`;
    
    const { error: updateError } = await supabase
      .from('games')
      .update({
        last_round_result: resultWithDebug,
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
  } else if (losers.length > 0) {
    // PARTIAL TIE: Multiple winners but there are also losers
    // Winners split the pot, losers match the pot, do NOT proceed with Chucky
    console.log('[HOLM PARTIAL TIE] Partial tie detected. Winners split pot, losers match. No Chucky.');
    console.log('[HOLM PARTIAL TIE] Winners:', winners.length, 'Losers:', losers.length);
    
    // Winners split the pot
    const splitAmount = Math.floor(roundPot / winners.length);
    const winnerNames: string[] = [];
    
    for (const winner of winners) {
      const winnerUsername = getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id);
      winnerNames.push(winnerUsername);
      
      await supabase
        .from('players')
        .update({ 
          chips: winner.player.chips + splitAmount
        })
        .eq('id', winner.player.id);
    }
    
    console.log('[HOLM PARTIAL TIE] Winners each get:', splitAmount);
    
    // Losers match the pot (capped) - this becomes the NEW pot for next hand
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;
    
    console.log('[HOLM PARTIAL TIE] Losers pay potMatchAmount:', potMatchAmount, '(becomes new pot)');
    
    // Use atomic decrement to prevent race conditions / stale chip values
    const loserPlayerIds = losers.map(l => l.player.id);
    const { error: loserChipError } = await supabase.rpc('decrement_player_chips', {
      player_ids: loserPlayerIds,
      amount: potMatchAmount
    });
    
    if (loserChipError) {
      console.error('[HOLM PARTIAL TIE] ERROR deducting loser chips:', loserChipError);
    } else {
      console.log('[HOLM PARTIAL TIE] Loser chips deducted atomically, amount:', potMatchAmount);
    }
    
    let newPot = losers.length * potMatchAmount;
    console.log('[HOLM PARTIAL TIE] New pot from losers match:', newPot);
    
    // Get detailed hand description for winners
    const winnerAllCards = [...winners[0].cards, ...communityCards];
    const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
    
    // Build debug data object to embed in result message
    const debugData = {
      roundId: roundId,
      roundNumber: currentRoundNumber,
      communityCards: communityCards.map(c => `${c.rank}${c.suit}`).join(' '),
      evaluations: debugEvaluations,
      winnerIds: winners.map(w => w.player.id),
      winnerNames: winnerNames,
      maxValue: maxValue
    };
    
    // Embed debug JSON after the result message with a delimiter
    // Include both pot (winners split) and matchAmount (losers pay) for animation coordination
    const loserIds = losers.map(l => l.player.id).join(',');
    const winnerIds = winners.map(w => w.player.id).join(',');
    const resultWithDebug = `${winnerNames.join(' and ')} tied and split the pot with ${winnerHandDesc}|||WINNERS:${winnerIds}|||LOSERS:${loserIds}|||POT:${roundPot}|||MATCH:${potMatchAmount}|||DEBUG:${JSON.stringify(debugData)}`;
    
    const { error: updateError } = await supabase
      .from('games')
      .update({
        last_round_result: resultWithDebug,
        awaiting_next_round: true,
        pot: newPot
      })
      .eq('id', gameId);
    
    if (updateError) {
      console.error('[HOLM PARTIAL TIE] ERROR updating game:', updateError);
    } else {
      console.log('[HOLM PARTIAL TIE] Successfully set awaiting_next_round=true, pot=', newPot);
    }
  
    // Mark round as completed to hide timer
    await supabase
      .from('rounds')
      .update({ status: 'completed' })
      .eq('id', roundId);
  } else {
    // FULL TIE: ALL players tied - they must all face Chucky
    console.log('[HOLM TIE] Full tie detected (all players tied). Tied players must face Chucky.');
    
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
    const playersTieChucky = winners.filter(w => w.evaluation.value === chuckyEval.value);
    const playersLoseToChucky = winners.filter(w => w.evaluation.value <= chuckyEval.value);
    
    console.log('[HOLM TIE] Players beat Chucky:', playersBeatChucky.length, 'Players tie Chucky:', playersTieChucky.length, 'Players lose:', playersLoseToChucky.length);
    
    if (playersBeatChucky.length === 0) {
      // All tied players lost to or tied with Chucky - they all match pot (capped)
      const allTiedWithChucky = playersTieChucky.length === playersLoseToChucky.length;
      console.log('[HOLM TIE] Chucky beats/ties all players, roundPot:', roundPot, 'allTiedWithChucky:', allTiedWithChucky);
      
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(roundPot, game.pot_max_value) 
        : roundPot;
      
      console.log('[HOLM TIE] Each loser pays potMatchAmount:', potMatchAmount);
      
      // Use atomic decrement to prevent race conditions / stale chip values
      const loserIds = playersLoseToChucky.map(l => l.player.id);
      const loserNames = playersLoseToChucky.map(l => getDisplayName(playersList, l.player, l.player.profiles?.username || l.player.user_id));
      
      const { error: tieLoserChipError } = await supabase.rpc('decrement_player_chips', {
        player_ids: loserIds,
        amount: potMatchAmount
      });
      
      if (tieLoserChipError) {
        console.error('[HOLM TIE] ERROR deducting loser chips:', tieLoserChipError);
      } else {
        console.log('[HOLM TIE] Loser chips deducted atomically, amount:', potMatchAmount);
      }
      
      let totalMatched = playersLoseToChucky.length * potMatchAmount;
      
      console.log('[HOLM TIE] Total matched from all losers:', totalMatched, '(', playersLoseToChucky.length, 'players)');
      
      const newPot = roundPot + totalMatched;
      
      // Use different message for tie vs actual loss
      const resultMessage = allTiedWithChucky 
        ? `Ya tie but ya lose!`
        : `Tie broken by Chucky! ${loserNames.join(' and ')} lose to Chucky's ${chuckyHandDesc}. $${totalMatched} added to pot.`;
      
      await supabase
        .from('games')
        .update({
          last_round_result: resultMessage,
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
        const winnerUsername = getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id);
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
          last_round_result: `${winnerNames.join(' and ')} beat Chucky!|||POT:${roundPot}`
        })
        .eq('id', gameId);
      
      // 2-second delay for players to see the winning announcement
      console.log('[HOLM TIE] Pausing 2 seconds for announcement...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // NOTE: Dealer rotation is NOT done here - it's done in handleGameOverComplete
      // AFTER evaluating player states (waiting → active, sit_out_next_hand → sitting_out, etc.)
      console.log('[HOLM TIE] NOT rotating dealer here - will be done in handleGameOverComplete after player state evaluation');
      
      // Game ends - players beat Chucky
      // Set game_over_at to null so frontend celebration shows first
      // NOTE: dealer_position is NOT changed here - rotation happens in handleGameOverComplete
      await supabase
        .from('games')
        .update({
          status: 'game_over',
          game_over_at: null, // NULL - frontend celebration will set this after completing
          // dealer_position is NOT updated here - rotation happens after player state evaluation
          buck_position: null,
          total_hands: 0,
          pot: 0,
          awaiting_next_round: true
        })
        .eq('id', gameId);
      
      console.log('[HOLM TIE] Game over - Chucky was beaten by tied players (dealer rotation deferred)');
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

  // CRITICAL FIX: Mark ALL existing rounds as 'completed' before starting new hand
  // This prevents stale betting rounds from blocking new round creation or causing current_round to decrease
  console.log('[HOLM NEXT] Marking all existing rounds as completed');
  await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('game_id', gameId)
    .neq('status', 'completed');

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
