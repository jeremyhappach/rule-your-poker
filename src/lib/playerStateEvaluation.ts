import { supabase } from "@/integrations/supabase/client";

interface Player {
  id: string;
  user_id: string;
  position: number;
  sitting_out: boolean;
  waiting: boolean;
  stand_up_next_hand: boolean;
  sit_out_next_hand: boolean;
  is_bot: boolean;
}

/**
 * Evaluate player states at end of game (before dealer rotation)
 * Returns the count of active players after evaluation
 * 
 * Evaluation order (stop on first match for each player):
 * 1. stand_up_next_hand = true → sitting_out = true, become observer (delete), waiting = false
 * 2. sit_out_next_hand = true → sitting_out = true, waiting = false, keep seat
 * 3. waiting = true → sitting_out = false, waiting = false (player now active)
 */
export async function evaluatePlayerStatesEndOfGame(gameId: string): Promise<{
  activePlayerCount: number;
  eligibleDealerCount: number;
  playersRemoved: string[];
}> {
  console.log('[PLAYER EVAL] ========== Evaluating player states for game:', gameId, '==========');
  
  // Fetch all players for this game
  const { data: players, error } = await supabase
    .from('players')
    .select('id, user_id, position, sitting_out, waiting, stand_up_next_hand, sit_out_next_hand, is_bot')
    .eq('game_id', gameId)
    .order('position');
  
  if (error || !players) {
    console.error('[PLAYER EVAL] Error fetching players:', error);
    return { activePlayerCount: 0, eligibleDealerCount: 0, playersRemoved: [] };
  }
  
  console.log('[PLAYER EVAL] Players to evaluate:', players.map(p => ({
    pos: p.position,
    sitting_out: p.sitting_out,
    waiting: p.waiting,
    stand_up: p.stand_up_next_hand,
    sit_out: p.sit_out_next_hand
  })));
  
  const playersRemoved: string[] = [];
  
  for (const player of players) {
    console.log('[PLAYER EVAL] Evaluating player at position', player.position);
    
    // Check in order - stop on first match
    
    // 1. stand_up_next_hand = true → become observer (delete player record)
    if (player.stand_up_next_hand) {
      console.log('[PLAYER EVAL] Player', player.position, 'standing up - removing from game');
      
      // Delete the player record (they become an observer)
      const { error: deleteError } = await supabase
        .from('players')
        .delete()
        .eq('id', player.id);
      
      if (deleteError) {
        console.error('[PLAYER EVAL] Error removing player:', deleteError);
      } else {
        playersRemoved.push(player.id);
      }
      continue; // Move to next player
    }
    
    // 2. sit_out_next_hand = true → sitting_out = true, waiting = false, keep seat
    if (player.sit_out_next_hand) {
      console.log('[PLAYER EVAL] Player', player.position, 'sitting out next hand');
      
      const { error: updateError } = await supabase
        .from('players')
        .update({
          sitting_out: true,
          waiting: false,
          sit_out_next_hand: false // Reset the flag
        })
        .eq('id', player.id);
      
      if (updateError) {
        console.error('[PLAYER EVAL] Error updating player:', updateError);
      }
      continue; // Move to next player
    }
    
    // 3. waiting = true → sitting_out = false, waiting = false (player now active)
    if (player.waiting) {
      console.log('[PLAYER EVAL] Player', player.position, 'was waiting - now active');
      
      const { error: updateError } = await supabase
        .from('players')
        .update({
          sitting_out: false,
          waiting: false
        })
        .eq('id', player.id);
      
      if (updateError) {
        console.error('[PLAYER EVAL] Error updating player:', updateError);
      }
      continue; // Move to next player
    }
    
    // No conditions matched - player state unchanged
    console.log('[PLAYER EVAL] Player', player.position, 'no state changes');
  }
  
  // After evaluation, count remaining players with their status
  // NOTE: At this point, waiting players have ALREADY been converted to active in the loop above
  // So we're counting post-evaluation state
  const { data: remainingPlayers, error: countError } = await supabase
    .from('players')
    .select('id, sitting_out, is_bot, waiting')
    .eq('game_id', gameId);
  
  if (countError || !remainingPlayers) {
    console.error('[PLAYER EVAL] Error counting remaining players:', countError);
    return { activePlayerCount: 0, eligibleDealerCount: 0, playersRemoved };
  }
  
  // Count active players (not sitting_out) - includes bots
  // NOTE: Players who had waiting=true are now sitting_out=false after evaluation above
  const activePlayerCount = remainingPlayers.filter(p => !p.sitting_out).length;
  
  // Fetch allow_bot_dealers setting
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('allow_bot_dealers')
    .eq('game_type', 'holm')
    .single();
  
  const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;
  
  // Count eligible dealers (non-sitting-out AND non-bot humans, unless bots are allowed as dealers)
  // NOTE: After evaluation, waiting players are now eligible (sitting_out=false, waiting=false)
  const eligibleDealerCount = remainingPlayers.filter(p => 
    !p.sitting_out && (allowBotDealers || !p.is_bot)
  ).length;
  
  console.log('[PLAYER EVAL] Evaluation complete. Active players:', activePlayerCount, 'Eligible dealers:', eligibleDealerCount, 'Removed:', playersRemoved.length, 'allowBotDealers:', allowBotDealers);
  console.log('[PLAYER EVAL] Remaining players detail:', remainingPlayers.map(p => ({
    id: p.id.slice(0, 8),
    sitting_out: p.sitting_out,
    is_bot: p.is_bot,
    waiting: p.waiting
  })));
  
  return { activePlayerCount, eligibleDealerCount, playersRemoved };
}

/**
 * Rotate dealer to next eligible player (non-sitting-out, and non-bot unless bots are allowed as dealers)
 */
export async function rotateDealerPosition(gameId: string, currentDealerPosition: number): Promise<number> {
  console.log('[DEALER ROTATE] ========== Starting dealer rotation ==========');
  console.log('[DEALER ROTATE] Current dealer position:', currentDealerPosition);
  
  // Fetch allow_bot_dealers setting
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('allow_bot_dealers')
    .eq('game_type', 'holm')
    .single();
  
  const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;
  console.log('[DEALER ROTATE] Allow bot dealers:', allowBotDealers);
  
  // Get ALL players for debugging
  const { data: allPlayers } = await supabase
    .from('players')
    .select('position, is_bot, sitting_out, user_id')
    .eq('game_id', gameId)
    .order('position', { ascending: true });
  
  console.log('[DEALER ROTATE] All players:', allPlayers?.map(p => ({
    pos: p.position,
    is_bot: p.is_bot,
    sitting_out: p.sitting_out
  })));
  
  // Build query for eligible dealers
  let query = supabase
    .from('players')
    .select('position, is_bot, sitting_out, user_id')
    .eq('game_id', gameId)
    .eq('sitting_out', false);
  
  // Only filter out bots if bot dealers are NOT allowed
  if (!allowBotDealers) {
    query = query.eq('is_bot', false);
  }
  
  const { data: eligiblePlayers, error } = await query.order('position', { ascending: true });
  
  console.log('[DEALER ROTATE] Eligible players:', eligiblePlayers?.map(p => p.position), 'error:', error);
  
  if (error || !eligiblePlayers || eligiblePlayers.length === 0) {
    console.log('[DEALER ROTATE] No eligible players, keeping current position');
    return currentDealerPosition;
  }
  
  const eligiblePositions = eligiblePlayers.map(p => p.position);
  console.log('[DEALER ROTATE] Eligible positions:', eligiblePositions);
  
  const currentDealerIndex = eligiblePositions.indexOf(currentDealerPosition);
  console.log('[DEALER ROTATE] Current dealer index in eligible list:', currentDealerIndex);
  
  let nextDealerPosition: number;
  if (currentDealerIndex === -1) {
    // Current dealer not in eligible list, pick first eligible
    console.log('[DEALER ROTATE] Current dealer NOT in eligible list, picking first eligible:', eligiblePositions[0]);
    nextDealerPosition = eligiblePositions[0];
  } else {
    // Rotate to next position (wrapping around) - go to the NEXT player clockwise
    const nextIndex = (currentDealerIndex + 1) % eligiblePositions.length;
    console.log('[DEALER ROTATE] Next index calculation: (', currentDealerIndex, '+ 1) %', eligiblePositions.length, '=', nextIndex);
    nextDealerPosition = eligiblePositions[nextIndex];
    console.log('[DEALER ROTATE] Rotating from position', currentDealerPosition, 'to position', nextDealerPosition);
  }
  
  console.log('[DEALER ROTATE] ========== New dealer position:', nextDealerPosition, '==========');
  
  return nextDealerPosition;
}

/**
 * Handle rejoin request from a sitting-out player
 */
export async function handlePlayerRejoin(playerId: string): Promise<boolean> {
  console.log('[PLAYER REJOIN] Setting waiting=true for player:', playerId);
  
  const { error } = await supabase
    .from('players')
    .update({ waiting: true })
    .eq('id', playerId);
  
  if (error) {
    console.error('[PLAYER REJOIN] Error:', error);
    return false;
  }
  
  return true;
}
