import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank, has357Hand } from "./cardUtils";
import { getBotAlias } from "./botAlias";

/**
 * Snapshot all players' chip counts after a hand completes.
 * This is used for accurate session results and for restoring chips when departed players rejoin.
 */
export async function snapshotPlayerChips(gameId: string, handNumber: number) {
  console.log('[SNAPSHOT] Snapshotting player chips for game:', gameId, 'hand:', handNumber);
  
  // Fetch all players with their profiles for username
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, chips, is_bot, created_at, profiles(username)')
    .eq('game_id', gameId);
  
  if (playersError || !players) {
    console.error('[SNAPSHOT] Error fetching players:', playersError);
    return;
  }
  
  // Build snapshot records
  const snapshots = players.map(player => {
    // Get username - for bots use alias, for humans use profile username
    let username = 'Unknown';
    if (player.is_bot) {
      username = getBotAlias(players, player.user_id);
    } else if (player.profiles && typeof player.profiles === 'object' && 'username' in player.profiles) {
      username = (player.profiles as { username: string }).username || 'Unknown';
    }
    
    return {
      game_id: gameId,
      player_id: player.id,
      user_id: player.user_id,
      username,
      chips: player.chips,
      is_bot: player.is_bot,
      hand_number: handNumber
    };
  });
  
  if (snapshots.length === 0) {
    console.log('[SNAPSHOT] No players to snapshot');
    return;
  }
  
  const { error: insertError } = await supabase
    .from('session_player_snapshots')
    .insert(snapshots);
  
  if (insertError) {
    console.error('[SNAPSHOT] Error inserting snapshots:', insertError);
  } else {
    console.log('[SNAPSHOT] Successfully snapshotted', snapshots.length, 'players');
  }
}

/**
 * Snapshot a single player's chips when they leave mid-session.
 * This ensures their final chip balance is captured for accurate session results.
 */
export async function snapshotDepartingPlayer(
  gameId: string, 
  playerId: string, 
  userId: string, 
  chips: number, 
  username: string,
  isBot: boolean
) {
  console.log('[SNAPSHOT] Snapshotting departing player:', username, 'chips:', chips);
  
  // Get the current hand number from the game's total_hands
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('total_hands')
    .eq('id', gameId)
    .maybeSingle();
  
  if (gameError || !game) {
    console.error('[SNAPSHOT] Error fetching game for departing snapshot:', gameError);
    return;
  }
  
  const handNumber = game.total_hands || 0;
  
  const { error: insertError } = await supabase
    .from('session_player_snapshots')
    .insert({
      game_id: gameId,
      player_id: playerId,
      user_id: userId,
      username,
      chips,
      is_bot: isBot,
      hand_number: handNumber
    });
  
  if (insertError) {
    console.error('[SNAPSHOT] Error inserting departing player snapshot:', insertError);
  } else {
    console.log('[SNAPSHOT] Successfully snapshotted departing player:', username);
  }
}

/**
 * Get the last known chip count for a user in a session (for rejoining players)
 */
export async function getLastKnownChips(gameId: string, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('session_player_snapshots')
    .select('chips')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('[SNAPSHOT] Error fetching last known chips:', error);
    return null;
  }
  
  return data?.chips ?? null;
}

/**
 * Record a game result for hand history tracking
 */
export async function recordGameResult(
  gameId: string,
  handNumber: number,
  winnerPlayerId: string | null,
  winnerUsername: string,
  winningHandDescription: string | null,
  potWon: number,
  playerChipChanges: Record<string, number>,
  isChopped: boolean = false,
  gameType?: string | null,
  dealerGameId?: string | null
) {
  console.log('[GAME RESULT] Recording game result:', {
    gameId,
    handNumber,
    winnerUsername,
    winningHandDescription,
    potWon,
    isChopped,
    gameType,
    dealerGameId
  });
  
  const { error } = await supabase
    .from('game_results')
    .insert({
      game_id: gameId,
      hand_number: handNumber,
      winner_player_id: winnerPlayerId,
      winner_username: winnerUsername,
      winning_hand_description: winningHandDescription,
      pot_won: potWon,
      player_chip_changes: playerChipChanges,
      is_chopped: isChopped,
      game_type: gameType || null,
      dealer_game_id: dealerGameId || null
    });
  
  if (error) {
    console.error('[GAME RESULT] Error recording game result:', error);
  } else {
    console.log('[GAME RESULT] Successfully recorded game result');
  }
}

export async function startRound(gameId: string, roundNumber: number) {
  console.log('[START_ROUND] Starting round', roundNumber, 'for game', gameId);
  
  // PARALLEL: Fetch game config + defaults (players are fetched AFTER we reset statuses)
  const [gameConfigResult, gameDefaultsResult] = await Promise.all([
    supabase
      .from('games')
      .select('ante_amount, leg_value, status, current_round, total_hands, pot, current_game_uuid')
      .eq('id', gameId)
      .single(),
    supabase
      .from('game_defaults')
      .select('decision_timer_seconds')
      .eq('game_type', '3-5-7')
      .maybeSingle()
  ]);
  
  const gameConfig = gameConfigResult.data;
  const gameDefaults = gameDefaultsResult.data;

  // Prevent starting if already in progress with this round
  if (gameConfig?.status === 'in_progress' && gameConfig?.current_round === roundNumber) {
    console.log('[START_ROUND] Round', roundNumber, 'already in progress, skipping');
    return;
  }
  
  const anteAmount = gameConfig?.ante_amount || 1;
  const legValue = gameConfig?.leg_value || 1;
  const currentGameUuid = gameConfig?.current_game_uuid || null;
  const cardsToDeal = roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7;
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 10;

  // If starting round 1, ensure all old rounds are deleted - FIRE AND FORGET to avoid blocking
  if (roundNumber === 1) {
    console.log('[START_ROUND] Cleaning up old rounds for round 1 (fire-and-forget)');
    
    // Fire-and-forget: Don't block on cleanup
    void (async () => {
      try {
        const { data: oldRounds } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId);

        if (oldRounds && oldRounds.length > 0) {
          await Promise.all([
            supabase.from('player_cards').delete().in('round_id', oldRounds.map(r => r.id)),
            supabase.from('rounds').delete().eq('game_id', gameId)
          ]);
          console.log('[START_ROUND] Background cleanup completed:', oldRounds.length, 'old rounds');
        }
      } catch (err) {
        console.error('[START_ROUND] Background cleanup error (non-fatal):', err);
      }
    })();
  }

  // Reset all players to active for the new round (must happen BEFORE we decide who gets dealt in later rounds)
  const { error: resetError } = await supabase
    .from('players')
    .update({
      current_decision: null,
      decision_locked: false,
      status: 'active'
    })
    .eq('game_id', gameId);

  if (resetError) {
    console.error('[START_ROUND] Failed to reset players:', resetError);
  }

  // CRITICAL: Fetch players AFTER the reset so we don't use stale fold/decision state (fixes missing cards in rounds 1-3)
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('position');

  if (playersError) {
    console.error('[START_ROUND] Error fetching players:', playersError);
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  if (!players || players.length === 0) {
    throw new Error('No players found in game');
  }

  // Deal to all non-sitting-out players. Status can be stale if reset failed; sitting_out is the true exclusion.
  const activePlayers = players.filter(p => !p.sitting_out);
  console.log('[START_ROUND] Players eligible for dealing:', {
    roundNumber,
    totalPlayers: players.length,
    activeCount: activePlayers.length,
    active: activePlayers.map(p => ({ id: p.id, position: p.position, status: p.status, sitting_out: p.sitting_out }))
  });
  let initialPot = 0;
  
  // timerSeconds already fetched in parallel at start
  console.log('[START_ROUND] Using decision timer:', timerSeconds, 'seconds');
  
  // Get current hand_number for this session
  // For round 1, use total_hands + 1 (new game starting)
  // For rounds 2-3, use the same hand_number as round 1
  let handNumber = 1;
  if (roundNumber === 1) {
    // New game starting - use total_hands + 1
    const { data: gameForHand } = await supabase
      .from('games')
      .select('total_hands')
      .eq('id', gameId)
      .single();
    handNumber = (gameForHand?.total_hands || 0) + 1;
  } else {
    // Continuing game - use same hand_number as existing rounds
    const { data: existingRoundForHand } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    handNumber = existingRoundForHand?.hand_number || 1;
  }

  // Create round with configured deadline (accounts for ~2s of processing/fetch time)
  const deadline = new Date(Date.now() + (timerSeconds + 2) * 1000);
  
  // CRITICAL: Use INSERT-AS-LOCK pattern with unique constraint on (game_id, hand_number, round_number)
  // The unique index prevents duplicate rounds - only ONE client can successfully insert.
  // That winning client is the ONLY one that charges antes, updates pot, etc.
  const { data: insertedRound, error: roundInsertError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: roundNumber,
      cards_dealt: roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7,
      status: 'betting',
      pot: 0, // Will be updated after ante collection
      decision_deadline: deadline.toISOString(),
      hand_number: handNumber
    })
    .select()
    .single();

  // Check if this client won the race to create the round
  if (roundInsertError) {
    // Unique constraint violation or other error - another client already created the round
    console.log('[START_ROUND] ⚠️ Round already exists (race lost or error):', roundInsertError.message);
    
    // Fetch the existing round so we can still return it (for callers that need round data)
    const { data: existingRound } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .eq('hand_number', handNumber)
      .maybeSingle();
    
    if (existingRound) {
      console.log('[START_ROUND] Returning existing round created by winner:', existingRound.id);
      return existingRound;
    }
    
    // If we can't find the round, throw error
    throw new Error(`Failed to create or find round: ${roundInsertError.message}`);
  }

  // This client WON the race - we are the only one that will charge antes
  console.log('[START_ROUND] ✅ WON round creation race for round', roundNumber, 'id:', insertedRound.id);
  
  // Charge antes only for round 1 (initial ante or re-ante after round 3 wraps)
  if (roundNumber === 1) {
    console.log('[START_ROUND] Charging antes. Players:', activePlayers.map(p => ({ id: p.id, position: p.position, chips_before: p.chips, is_bot: p.is_bot })));
    
    // Calculate total pot from active players
    initialPot = activePlayers.length * anteAmount;
    
    // BATCH: Charge all antes in a single RPC call instead of sequential updates
    const playerIds = activePlayers.map(p => p.id);
    console.log('[START_ROUND] Batch charging', playerIds.length, 'players $', anteAmount, 'each');
    
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount
    });
    
    if (anteError) {
      console.error('[START_ROUND] Error batch charging antes:', anteError);
      // RPC failed - log but don't use non-atomic fallback which causes accounting drift
    } else {
      // CRITICAL: Record ante deductions in game_results to maintain zero-sum accounting
      // Each player's ante payment is tracked as a negative chip change
      const anteChipChanges: Record<string, number> = {};
      for (const player of activePlayers) {
        anteChipChanges[player.id] = -anteAmount;
      }
      
      // Record antes as a game result entry with no winner (just ante collection)
      await recordGameResult(
        gameId,
        handNumber,
        null, // no winner - this is ante collection
        'Ante', // Description
        `${activePlayers.length} players anted $${anteAmount}`,
        0, // pot_won is 0 - this is money going INTO the pot
        anteChipChanges,
        false,
        '357', // game_type
        currentGameUuid // dealer_game_id
      );
      console.log('[START_ROUND] Recorded ante chip changes in game_results:', anteChipChanges);
    }
    
    console.log('[START_ROUND] Total ante pot:', initialPot);
  }

  // Get current pot and update game state + pot atomically
  const { data: currentGameForPot } = await supabase
    .from('games')
    .select('pot')
    .eq('id', gameId)
    .single();
  
  const currentPot = currentGameForPot?.pot || 0;
  
  // Build game update object - CRITICAL: For Round 1, also update total_hands to match handNumber
  // This ensures the unique constraint (game_id, hand_number, round_number) works correctly for subsequent hands
  // Similar to how Horses/SCC atomically update total_hands when starting a new hand
  const gameUpdate: Record<string, unknown> = {
    current_round: roundNumber,
    all_decisions_in: false,
    pot: currentPot + initialPot,  // Add antes to existing pot (0 for rounds 2-3)
    // CRITICAL: Clear stale deadlines from config/ante phases so cron doesn't enforce them mid-game
    config_deadline: null,
    ante_decision_deadline: null,
  };
  
  // For Round 1, atomically update total_hands to ensure the next hand gets a unique hand_number
  if (roundNumber === 1) {
    gameUpdate.total_hands = handNumber;
    console.log('[START_ROUND] Round 1: Setting total_hands to', handNumber);
  }
  
  const { error: gameUpdateError } = await supabase
    .from('games')
    .update(gameUpdate)
    .eq('id', gameId);
  
  if (gameUpdateError) {
    console.error('[START_ROUND] Failed to update game state:', gameUpdateError);
    throw new Error(`Failed to update game state: ${gameUpdateError.message}`);
  }
  
  console.log('[START_ROUND] Game state updated: current_round =', roundNumber, ', all_decisions_in = false, pot =', currentPot + initialPot, roundNumber === 1 ? ', total_hands = ' + handNumber : '');
  
  // Update round pot to reflect the ante collection
  if (initialPot > 0) {
    await supabase
      .from('rounds')
      .update({ pot: initialPot })
      .eq('id', insertedRound.id);
  }
  
  // Use the inserted round from here on
  const round = insertedRound;

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

  // BATCH: Prepare all player cards for a single insert
  const playerCardInserts: Array<{ player_id: string; round_id: string; cards: any }> = [];
  
  for (const player of activePlayers) {
    // Get existing cards from previous round (if any)
    const existingCards = previousRoundCards.get(player.id) || [];
    
    // Deal new cards from deck
    const newCards = deck.slice(cardIndex, cardIndex + newCardsToDeal);
    cardIndex += newCardsToDeal;
    const playerCards = [...existingCards, ...newCards];

    playerCardInserts.push({
      player_id: player.id,
      round_id: round.id,
      cards: playerCards as any
    });
  }
  
  // Single batch insert for all player cards
  if (playerCardInserts.length > 0) {
    const { error: cardsError } = await supabase
      .from('player_cards')
      .insert(playerCardInserts);
    
    if (cardsError) {
      console.error('[START_ROUND] Error batch inserting cards:', cardsError);
      throw new Error(`Failed to deal cards: ${cardsError.message}`);
    }
    console.log('[START_ROUND] Batch dealt cards to', playerCardInserts.length, 'players');
  }

  // ============ IMMEDIATE 357 CHECK FOR ROUND 1 ============
  // Check for 3-5-7 hand immediately after dealing cards - no decision needed!
  if (roundNumber === 1) {
    console.log('[START_ROUND] Checking for immediate 3-5-7 hands...');
    
    // Fetch all player cards just dealt (include is_bot for alias resolution)
    const { data: dealtCards } = await supabase
      .from('player_cards')
      .select('*, players!inner(id, position, legs, user_id, is_bot, profiles(username), created_at)')
      .eq('round_id', round.id);
    
    // Fetch all players for bot alias resolution
    const { data: allPlayersForAlias } = await supabase
      .from('players')
      .select('user_id, is_bot, created_at')
      .eq('game_id', gameId);
    
    if (dealtCards) {
      for (const pc of dealtCards) {
        const cards = pc.cards as unknown as Card[];
        if (has357Hand(cards)) {
          const player = pc.players as any;
          const username = player?.is_bot && allPlayersForAlias
            ? getBotAlias(allPlayersForAlias, player.user_id) 
            : (player?.profiles?.username || `Player ${player?.position}`);
          console.log('[START_ROUND] 🎉 IMMEDIATE 357 DETECTED!', { playerId: player?.id, username, cards });
          
          // NOTE: 3-5-7 sweep is an INSTANT WIN - do NOT award legs!
          // The player wins the game immediately without needing leg accumulation
          
          // Set the special result message for 357 sweep (triggers celebration animation)
          const sweepMessage = `357_SWEEP:${username}`;
          
          // Mark round as completed and set sweep message
          // DO NOT set status: 'game_over' yet - let animation play first
          await supabase
            .from('rounds')
            .update({ status: 'completed' })
            .eq('id', round.id);
          
          await supabase
            .from('games')
            .update({ 
              last_round_result: sweepMessage,
              awaiting_next_round: true  // Block further game logic during animation
            })
            .eq('id', gameId);
          
          // After 5 seconds (animation duration), set game_over state directly
          // Don't use handleGameOver - it would overwrite the sweep message
          setTimeout(async () => {
            console.log('[357 SWEEP] Animation complete, attempting atomic transition to game_over');
            
            // ATOMIC GUARD: Only the first client to update status from 'in_progress' to 'game_over' proceeds
            // This prevents duplicate pot awards in human-vs-human games
            const { data: guardResult, error: guardError } = await supabase
              .from('games')
              .update({ 
                status: 'game_over',
                game_over_at: new Date().toISOString(),
                current_round: null,
                awaiting_next_round: false,
                all_decisions_in: false
                // NOTE: Keep last_round_result as the sweep message, keep pot for now
              })
              .eq('id', gameId)
              .eq('status', 'in_progress')  // ATOMIC: Only if still in_progress
              .select('pot, total_hands, dealer_position, leg_value')
              .single();
            
            if (guardError || !guardResult) {
              console.log('[357 SWEEP] Another client already processed game over, skipping pot award');
              return;
            }
            
            console.log('[357 SWEEP] Won atomic guard, proceeding with pot award');
            
            const currentPot = guardResult.pot || 0;
            const legValue = guardResult.leg_value || 1;
            
            // Fetch all players to calculate total leg value
            const { data: allPlayers } = await supabase
              .from('players')
              .select('id, chips, legs')
              .eq('game_id', gameId);
            
            // Calculate total leg value from all players
            const totalLegValue = (allPlayers || []).reduce((sum, p) => sum + (p.legs * legValue), 0);
            const totalPrize = currentPot + totalLegValue;
            
            console.log('[357 SWEEP] Awarding prize to winner:', { 
              playerId: player?.id,
              currentPot, 
              totalLegValue, 
              totalPrize 
            });
            
            // Award pot + leg value to the winner using atomic increment
            const winnerPlayer = (allPlayers || []).find(p => p.id === player?.id);
            if (winnerPlayer && player?.id) {
              await supabase.rpc('increment_player_chips', {
                p_player_id: player.id,
                p_amount: totalPrize
              });
            }
            
            // Reset all players' legs to 0 for next game
            await supabase
              .from('players')
              .update({ 
                legs: 0,
                current_decision: null,
                decision_locked: false,
                ante_decision: null
              })
              .eq('game_id', gameId);
            
            // Now zero out the pot and update total_hands
            await supabase
              .from('games')
              .update({ 
                pot: 0,
                total_hands: (guardResult.total_hands || 0) + 1
              })
              .eq('id', gameId);
          }, 5000);
          
          return round; // Exit early - 357 sweep handled
        }
      }
    }
  }
  // ============ END IMMEDIATE 357 CHECK ============

  return round;
}

export async function makeDecision(gameId: string, playerId: string, decision: 'stay' | 'fold') {
  console.log('[MAKE DECISION] Starting:', { gameId, playerId, decision });
  
  // Get current game
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.log('[MAKE DECISION] Game not found');
    throw new Error('Game not found');
  }

  console.log('[MAKE DECISION] Game status:', game.status, 'Type:', game.game_type);

  // CRITICAL: For Holm games, fetch the LATEST round by round_number DESC
  // game.current_round is NOT updated for Holm (to avoid check constraint violation)
  const isHolmGame = game.game_type === 'holm-game';
  
  let currentRound;
  if (isHolmGame) {
    const { data: latestRound } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();
    currentRound = latestRound;
    console.log('[MAKE DECISION] Holm game - using latest round by round_number:', latestRound?.round_number);
  } else {
    const { data: rounds } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_number', game.current_round)
      .single();
    currentRound = rounds;
  }
  
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
  // isHolmGame already defined above
  
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
  
  if (isHolmGame) {
    // For Holm games, check if round is complete and advance turn
    // Import dynamically to avoid circular dependency
    const { checkHolmRoundComplete } = await import('./holmGameLogic');
    console.log('[MAKE DECISION] Holm game - calling checkHolmRoundComplete');
    await checkHolmRoundComplete(gameId);
  } else {
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
        // This function is only called for timer-expiry; mark humans as auto_fold.
        auto_fold: player.is_bot ? false : true,
        ...(isHolmGame ? {} : { status: 'folded' }),
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
  currentDealerPosition: number,
  currentGameUuid?: string | null
) {
  console.log('[HANDLE GAME OVER] Starting game over handler', { winnerId, winnerUsername, winnerLegs });
  
  // ATOMIC GUARD: Only the first client to update status from 'in_progress' to 'game_over' proceeds
  // This prevents duplicate pot awards in human-vs-human games
  const { data: guardResult, error: guardError } = await supabase
    .from('games')
    .update({ 
      status: 'game_over',
      game_over_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .eq('status', 'in_progress')  // ATOMIC: Only if still in_progress
    .select('total_hands, pot')
    .single();
  
  if (guardError || !guardResult) {
    console.log('[HANDLE GAME OVER] Another client already processed game over, skipping pot award');
    return;
  }
  
  console.log('[HANDLE GAME OVER] Won atomic guard, proceeding with pot award');
  
  // Use the pot value from the atomic guard result to ensure consistency
  const actualPot = guardResult.pot || currentPot;
  const newTotalHands = (guardResult.total_hands || 0) + 1;
  
  // Calculate total leg value from all players (legs are separate from pot)
  // Winner gets pot + all leg values when they win the game
  const totalLegValue = allPlayers.reduce((sum, p) => sum + (p.legs * legValue), 0);
  const totalPrize = actualPot + totalLegValue;
  
  console.log('[HANDLE GAME OVER] Awarding prize:', { actualPot, totalLegValue, totalPrize });
  
  // Calculate chip changes for all players (for game result tracking)
  // Winner gets the pot; losers record nothing (their losses were already recorded)
  const playerChipChanges: Record<string, number> = {};
  for (const player of allPlayers) {
    if (player.id === winnerId) {
      playerChipChanges[player.id] = totalPrize; // Winner gains the pot
    } else {
      // Other players' leg costs were already recorded when they bought legs
      // Recording 0 here for completeness in the game_results entry
      playerChipChanges[player.id] = 0;
    }
  }
  
  // Record game result for hand history
  await recordGameResult(
    gameId,
    newTotalHands,
    winnerId,
    winnerUsername,
    `${winnerLegs} legs`,
    totalPrize,
    playerChipChanges,
    false,
    '357', // game_type
    currentGameUuid // dealer_game_id
  );
  
  // Award the winner using atomic increment
  await supabase.rpc('increment_player_chips', {
    p_player_id: winnerId,
    p_amount: totalPrize
  });
  
  // Snapshot player chips AFTER awarding prize but BEFORE resetting player states
  await snapshotPlayerChips(gameId, newTotalHands);
  
  const gameWinMessage = `🏆 ${winnerUsername} won the game!`;
  
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
  // NOTE: game_over_at is NULL so frontend animation can complete before countdown starts
  const { data: gameOverUpdate, error: gameOverError } = await supabase
    .from('games')
    .update({ 
      status: 'game_over',
      // dealer_position is NOT updated here - rotation happens after player state evaluation
      current_round: null,
      awaiting_next_round: false,
      all_decisions_in: false,
      last_round_result: gameWinMessage,
      game_over_at: null,  // NULL - frontend animation will set this after completing
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
    .select('leg_value, legs_to_win, pot_max_enabled, pot_max_value, pussy_tax_enabled, pussy_tax_value, current_game_uuid')
    .eq('id', gameId)
    .single();
  
  const currentGameUuid = gameConfig?.current_game_uuid || null;
  
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
            const username = player.is_bot 
              ? getBotAlias(allPlayers, player.user_id) 
              : (player.profiles?.username || `Player ${player.position}`);
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
              // Fetch fresh player data and game data
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*, profiles(username)')
                .eq('game_id', gameId);
              
              // Fetch fresh pot value
              const { data: freshGameData } = await supabase
                .from('games')
                .select('pot, dealer_position, current_game_uuid')
                .eq('id', gameId)
                .single();
              
              const freshPot = freshGameData?.pot || 0;
              console.log('[357 SWEEP] Fresh pot value for game over:', freshPot);
              
              await handleGameOver(
                gameId,
                player.id,
                username,
                legsToWin,
                freshPlayers || allPlayers,
                freshPot,
                legValue,
                legsToWin,
                freshGameData?.dealer_position || 1,
                freshGameData?.current_game_uuid || currentGameUuid
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
    const username = soloStayer.is_bot 
      ? getBotAlias(allPlayers, soloStayer.user_id) 
      : (soloStayer.profiles?.username || `Player ${soloStayer.position}`);
    
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
    
    // Deduct leg cost using atomic decrement to prevent race conditions
    await supabase.rpc('decrement_player_chips', {
      player_ids: [soloStayer.id],
      amount: betAmount,
    });
    
    // Update legs separately (no race condition risk)
    // NOTE: Leg costs are NOT added to pot - they're held separately
    // Winner receives pot + all leg values when they win the game
    await supabase
      .from('players')
      .update({ legs: newLegCount })
      .eq('id', soloStayer.id);
    
    // CRITICAL: Record leg purchase in game_results for zero-sum accounting
    // This is a leg purchase - money held separately from pot, awarded to winner at game end
    const legChipChanges: Record<string, number> = {};
    legChipChanges[soloStayer.id] = -betAmount;
    
    const currentHandNumber = game.total_hands || 1;
    await recordGameResult(
      gameId,
      currentHandNumber,
      null, // no winner - this is a leg purchase
      'Leg Purchase',
      `${username} paid $${betAmount} for leg ${newLegCount}`,
      0, // pot_won is 0 - money held for game winner
      legChipChanges,
      false,
      '357', // game_type
      currentGameUuid // dealer_game_id
    );
    console.log('[endRound] Recorded leg purchase chip changes:', legChipChanges);
      
    resultMessage = `${username} won a leg`;
    
    console.log('[endRound] Leg awarded:', {
      newLegCount,
      betAmount,
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
        // Fetch fresh game data to get current pot value
        const { data: freshGameData } = await supabase
          .from('games')
          .select('pot, dealer_position, current_game_uuid')
          .eq('id', gameId)
          .single();
        
        const currentPot = freshGameData?.pot || 0;
        console.log('[SOLO WIN] Fresh pot value for game over:', currentPot);
        
        // Use centralized game-over handler with fresh data
        await handleGameOver(
          gameId,
          soloStayer.id,
          username,
          newLegCount,
          freshPlayers || allPlayers,
          currentPot,
          legValue,
          legsToWin,
          freshGameData?.dealer_position || 1,
          freshGameData?.current_game_uuid || currentGameUuid
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
      // 3-5-7 game uses wildcards based on round - determine explicit wild rank
      const wildRank = currentRound === 1 ? '3' : currentRound === 2 ? '5' : '7';
      const hands = playerCards
        .filter(pc => playersWhoStayed.some(p => p.id === pc.player_id))
        .map(pc => ({
          playerId: pc.player_id,
          cards: pc.cards as unknown as Card[],
          evaluation: evaluateHand(pc.cards as unknown as Card[], true, wildRank as any) // Pass correct wild rank
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
        // Find the best hand value
        const bestValue = Math.max(...hands.map(h => h.evaluation.value));
        
        // Find ALL players with the best hand (to detect ties)
        const winners = hands.filter(h => h.evaluation.value === bestValue);
        
        console.log('[endRound] SHOWDOWN: Best hands found:', {
          bestValue,
          winnerCount: winners.length,
          winners: winners.map(w => ({ playerId: w.playerId, rank: w.evaluation.rank }))
        });

        if (winners.length > 1) {
          // TIE - no money changes hands, just show the tie message
          const tiedPlayerNames: string[] = [];
          for (const w of winners) {
            const player = playersWhoStayed.find(p => p.id === w.playerId);
            if (player) {
              const name = player.is_bot 
                ? getBotAlias(allPlayers, player.user_id) 
                : (player.profiles?.username || `Player ${player.position}`);
              tiedPlayerNames.push(name);
            }
          }
          const handName = formatHandRank(winners[0].evaluation.rank);
          resultMessage = `${tiedPlayerNames.join(' and ')} tied with ${handName} - no money changes hands`;
          
          console.log('[endRound] SHOWDOWN: TIE detected, no chips transferred:', {
            tiedPlayers: tiedPlayerNames,
            handName
          });
        } else {
          // Single winner - transfer chips
          const winner = winners[0];

          console.log('[endRound] SHOWDOWN: Single winner determined:', {
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
            const winnerUsername = winningPlayer.is_bot 
              ? getBotAlias(allPlayers, winningPlayer.user_id) 
              : (winningPlayer.profiles?.username || `Player ${winningPlayer.position}`);
            const handName = formatHandRank(winner.evaluation.rank);
            
            const currentPot = game.pot || 0;
            let totalWinnings = 0;
            
            // Charge each loser and accumulate (pot stays for game winner)
            const loserIds: string[] = [];
            let amountPerLoser = 0;
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
                amountPerLoser = amountToCharge; // All losers pay same amount
                loserIds.push(player.id);
                
                // Deduct from loser using atomic decrement
                const { error: loserError } = await supabase.rpc('decrement_player_chips', {
                  player_ids: [player.id],
                  amount: amountToCharge,
                });
                
                if (loserError) {
                  console.error('[endRound] SHOWDOWN: ERROR deducting from loser:', player.id, loserError);
                } else {
                  console.log('[endRound] SHOWDOWN: Deducted', amountToCharge, 'from player', player.id);
                }
              }
            }
            
            // Award showdown winnings to winner using atomic increment
            const { error: winnerError } = await supabase.rpc('increment_player_chips', {
              p_player_id: winner.playerId,
              p_amount: totalWinnings
            });
            
            if (winnerError) {
              console.error('[endRound] SHOWDOWN: ERROR awarding to winner:', winner.playerId, winnerError);
            } else {
              console.log('[endRound] SHOWDOWN: Awarded', totalWinnings, 'to winner', winner.playerId);
            }
            
            // CRITICAL: Record showdown chip changes in game_results for zero-sum accounting
            // Winner gains what losers paid (not the pot - pot came from antes which are tracked separately)
            const showdownChipChanges: Record<string, number> = {};
            showdownChipChanges[winner.playerId] = totalWinnings;
            for (const loserId of loserIds) {
              showdownChipChanges[loserId] = -amountPerLoser;
            }
            
            // Get current hand number
            const currentHandNumber = game.total_hands || 1;
            
            await recordGameResult(
              gameId,
              currentHandNumber,
              winner.playerId,
              winnerUsername,
              handName,
              totalWinnings, // pot_won = what winner received from losers
              showdownChipChanges,
              false,
              currentGameUuid // dealer_game_id
            );
            console.log('[endRound] SHOWDOWN: Recorded chip changes:', showdownChipChanges);
            
            // Include metadata for chip transfer animation (similar to Holm format)
            // Format: "WinnerName won showdown|||WINNER:id|||LOSERS:ids|||AMOUNT:x|||HANDNAME:handDescription"
            // Client-side decides whether to show hand name based on reveal_at_showdown setting
            const showdownResult = `${winnerUsername} won showdown|||WINNER:${winner.playerId}|||LOSERS:${loserIds.join(',')}|||AMOUNT:${amountPerLoser}|||HANDNAME:${handName}`;
            
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
    console.log('[endRound] EVERYONE FOLDED - applying pussy tax logic');
    
    if (pussyTaxEnabled) {
      // Reset player statuses so chip animations are visible
      await supabase
        .from('players')
        .update({ 
          status: 'active',
          current_decision: null
        })
        .eq('game_id', gameId);
      
      // Only charge active (non-sitting-out) players
      const activePlayersForTax = allPlayers.filter(p => !p.sitting_out);
      const playerIds = activePlayersForTax.map(p => p.id);
      
      console.log('[endRound] Charging pussy tax to', playerIds.length, 'active players, amount:', pussyTaxValue);
      
      // Use atomic relative decrement to prevent race conditions / double charges
      const { error: taxError } = await supabase.rpc('decrement_player_chips', {
        player_ids: playerIds,
        amount: pussyTaxValue
      });
      
      if (taxError) {
        console.error('[357 END] Pussy tax decrement error:', taxError);
        // RPC failed - log but don't use non-atomic fallback which causes accounting drift
      } else {
        // CRITICAL: Record pussy tax in game_results for zero-sum accounting
        const pussyTaxChipChanges: Record<string, number> = {};
        for (const player of activePlayersForTax) {
          pussyTaxChipChanges[player.id] = -pussyTaxValue;
        }
        
        const currentHandNumber = game.total_hands || 1;
        await recordGameResult(
          gameId,
          currentHandNumber,
          null, // no winner - this is tax going into pot
          'Pussy Tax',
          `${activePlayersForTax.length} players paid $${pussyTaxValue} pussy tax`,
          0, // pot_won is 0 - money going INTO pot
          pussyTaxChipChanges,
          false,
          '357', // game_type
          currentGameUuid // dealer_game_id
        );
        console.log('[endRound] Recorded pussy tax chip changes:', pussyTaxChipChanges);
      }
      const taxCollected = pussyTaxValue * activePlayersForTax.length;
      
      // Add pussy tax to pot
      const { error: potError } = await supabase
        .from('games')
        .update({ 
          pot: (game.pot || 0) + taxCollected
        })
        .eq('id', gameId);
      
      if (potError) {
        console.error('[357 END] Error updating pot with pussy tax:', potError);
      }
      
      console.log('[endRound] Pussy tax applied:', { taxCollected, newPot: (game.pot || 0) + taxCollected });
      
      // Use consistent message that frontend expects (case-insensitive check)
      resultMessage = 'Pussy Tax';
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
