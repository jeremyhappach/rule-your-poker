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
    return { activePlayerCount: 0, playersRemoved: [] };
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
  
  // After evaluation, count active players (not sitting_out, not removed)
  const { data: remainingPlayers, error: countError } = await supabase
    .from('players')
    .select('id, sitting_out')
    .eq('game_id', gameId);
  
  if (countError || !remainingPlayers) {
    console.error('[PLAYER EVAL] Error counting remaining players:', countError);
    return { activePlayerCount: 0, playersRemoved };
  }
  
  const activePlayerCount = remainingPlayers.filter(p => !p.sitting_out).length;
  
  console.log('[PLAYER EVAL] Evaluation complete. Active players:', activePlayerCount, 'Removed:', playersRemoved.length);
  
  return { activePlayerCount, playersRemoved };
}

/**
 * Rotate dealer to next eligible player (non-sitting-out, non-bot)
 */
export async function rotateDealerPosition(gameId: string, currentDealerPosition: number): Promise<number> {
  console.log('[DEALER ROTATE] Current dealer position:', currentDealerPosition);
  
  // Get eligible dealers (non-sitting-out, non-bot humans)
  const { data: eligiblePlayers, error } = await supabase
    .from('players')
    .select('position, is_bot, sitting_out')
    .eq('game_id', gameId)
    .eq('sitting_out', false)
    .eq('is_bot', false)
    .order('position', { ascending: true });
  
  if (error || !eligiblePlayers || eligiblePlayers.length === 0) {
    console.log('[DEALER ROTATE] No eligible human players, keeping current position');
    return currentDealerPosition;
  }
  
  const eligiblePositions = eligiblePlayers.map(p => p.position);
  const currentDealerIndex = eligiblePositions.indexOf(currentDealerPosition);
  
  let nextDealerPosition: number;
  if (currentDealerIndex === -1) {
    // Current dealer not in eligible list, pick first eligible
    nextDealerPosition = eligiblePositions[0];
  } else {
    // Rotate to next position (wrapping around)
    const nextIndex = (currentDealerIndex + 1) % eligiblePositions.length;
    nextDealerPosition = eligiblePositions[nextIndex];
  }
  
  console.log('[DEALER ROTATE] New dealer position:', nextDealerPosition);
  
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
