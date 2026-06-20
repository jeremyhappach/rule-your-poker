import { supabase } from "@/integrations/supabase/client";
import { logSittingOutSet } from "@/lib/sittingOutDebugLog";
// normalizeTwoPlayerSeatsIfNeeded intentionally not imported here — see note
// at the activeHumanCount block below.

interface Player {
  id: string;
  user_id: string;
  position: number;
  sitting_out: boolean;
  waiting: boolean;
  stand_up_next_hand: boolean;
  sit_out_next_hand: boolean;
  is_bot: boolean;
  auto_fold: boolean;
  profiles?: { username: string };
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
  activeHumanCount: number;
  eligibleDealerCount: number;
  playersStoodUp: string[];
}> {
  console.log('[PLAYER EVAL] ========== Evaluating player states for game:', gameId, '==========');

  // P0-CONTAINMENT: auto_fold is meaningful only for Holm/3-5-7 (turn timers drive it).
  // For cribbage / gin-rummy / yahtzee / dice, auto_fold may be stale from a prior game
  // and must NOT cause a forced sit-out (which then triggers a false "no active humans"
  // session-end). Read game_type and disable the auto_fold rule for non-Holm/357 games.
  const { data: gameRow } = await supabase
    .from('games')
    .select('game_type')
    .eq('id', gameId)
    .maybeSingle();
  const gType = (gameRow as any)?.game_type;
  const autoFoldRuleApplies =
    gType === '3-5-7' || gType === '3-5-7-game' || gType === '357' ||
    gType === 'holm' || gType === 'holm-game';

  // Fetch all players for this game with profile info for logging
  const { data: players, error } = await supabase
    .from('players')
    .select('id, user_id, position, sitting_out, waiting, stand_up_next_hand, sit_out_next_hand, is_bot, status, auto_fold, profiles(username)')
    .eq('game_id', gameId)
    .order('position');
  
  if (error || !players) {
    console.error('[PLAYER EVAL] Error fetching players:', error);
    return { activePlayerCount: 0, activeHumanCount: 0, eligibleDealerCount: 0, playersStoodUp: [] };
  }
  
  console.log('[PLAYER EVAL] Players to evaluate:', players.map(p => ({
    pos: p.position,
    sitting_out: p.sitting_out,
    waiting: p.waiting,
    stand_up: p.stand_up_next_hand,
    sit_out: p.sit_out_next_hand,
    auto_fold: p.auto_fold
  })));
  
  const playersStoodUp: string[] = [];
  
  for (const player of players) {
    console.log('[PLAYER EVAL] Evaluating player at position', player.position);
    
    // Check in order - stop on first match
    
    // 1. stand_up_next_hand = true → become observer (release seat)
    // For bots: delete the player record entirely
    // For humans: keep record but would need nullable position (currently not supported)
    if (player.stand_up_next_hand) {
      console.log('[PLAYER EVAL] Player', player.position, 'standing up - is_bot:', player.is_bot);
      
      if (player.is_bot) {
        // Delete bot player record entirely
        const { error: deleteError } = await supabase
          .from('players')
          .delete()
          .eq('id', player.id);
        
        if (deleteError) {
          console.error('[PLAYER EVAL] Error deleting bot player:', deleteError);
        } else {
          console.log('[PLAYER EVAL] Bot player deleted successfully');
          playersStoodUp.push(player.id);
        }
      } else {
        // For humans, set sitting_out=true and clear flags (they keep their seat for now)
        // A proper observer system would require nullable position column
        
        // Log this status change for debugging
        await logSittingOutSet(
          player.id,
          player.user_id,
          gameId,
          player.profiles?.username,
          player.is_bot,
          player.sitting_out,
          'Player had stand_up_next_hand=true, setting sitting_out=true',
          'playerStateEvaluation.ts:evaluatePlayerStatesEndOfGame',
          { position: player.position, stand_up_next_hand: true }
        );
        
        const { error: updateError } = await supabase
          .from('players')
          .update({
            status: 'left',
            sitting_out: true,
            stand_up_next_hand: false,
            waiting: false,
            ante_decision: null,
            auto_ante: false,
            auto_ante_runback: false,
            auto_fold: false,
          })
          .eq('id', player.id);
        
        if (updateError) {
          console.error('[PLAYER EVAL] Error updating player to sitting out:', updateError);
        } else {
          playersStoodUp.push(player.id);
        }
      }
      continue; // Move to next player
    }
    
    // 2. sit_out_next_hand = true → sitting_out = true, waiting = false, keep seat
    if (player.sit_out_next_hand) {
      console.log('[PLAYER EVAL] Player', player.position, 'sitting out next hand');
      
      // Log this status change for debugging
      await logSittingOutSet(
        player.id,
        player.user_id,
        gameId,
        player.profiles?.username,
        player.is_bot,
        player.sitting_out,
        'Player had sit_out_next_hand=true, converting to sitting_out=true',
        'playerStateEvaluation.ts:evaluatePlayerStatesEndOfGame',
        { position: player.position, sit_out_next_hand: true }
      );
      
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
    
    // 3. auto_fold = true → sitting_out = true (player timed out and is auto-folding)
    // P0-CONTAINMENT: gated by game_type; cribbage/gin/yahtzee/dice do not use auto_fold
    // as an authoritative timeout signal here, and stale flags would force false sit-outs.
    if (player.auto_fold && autoFoldRuleApplies) {
      console.log('[PLAYER EVAL] Player', player.position, 'has auto_fold=true - sitting out');
      
      // Log this status change for debugging
      await logSittingOutSet(
        player.id,
        player.user_id,
        gameId,
        player.profiles?.username,
        player.is_bot,
        player.sitting_out,
        'Player had auto_fold=true (timed out), setting sitting_out=true',
        'playerStateEvaluation.ts:evaluatePlayerStatesEndOfGame',
        { position: player.position, auto_fold: true }
      );
      
      const { error: updateError } = await supabase
        .from('players')
        .update({
          sitting_out: true,
          waiting: false
        })
        .eq('id', player.id);
      
      if (updateError) {
        console.error('[PLAYER EVAL] Error updating auto_fold player:', updateError);
      }
      continue; // Move to next player
    }

    // 4. waiting = true → sitting_out = false, waiting = false (player now active)
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
    .select('id, sitting_out, is_bot, waiting, status')
    .eq('game_id', gameId);
  
  if (countError || !remainingPlayers) {
    console.error('[PLAYER EVAL] Error counting remaining players:', countError);
    return { activePlayerCount: 0, activeHumanCount: 0, eligibleDealerCount: 0, playersStoodUp };
  }
  
  // Count active players (not sitting_out AND not observer) - includes bots
  // NOTE: Players who had waiting=true are now sitting_out=false after evaluation above
  const activePlayerCount = remainingPlayers.filter(p => !p.sitting_out && p.status !== 'observer' && p.status !== 'left').length;
  
  // Count active human players (not sitting_out, not observer, not left, not bot)
  const activeHumanCount = remainingPlayers.filter(p => !p.sitting_out && p.status !== 'observer' && p.status !== 'left' && !p.is_bot).length;

  // NOTE: Topology normalization (normalizeTwoPlayerSeatsIfNeeded) is
  // intentionally NOT called here. evaluatePlayerStatesEndOfGame runs on
  // every game_over evaluation regardless of where the session is headed
  // next (waiting vs game_selection vs dealer_selection). Topology mutation
  // is owned by the "next dealer game bootstrap" boundary only — see call
  // sites that wrap status flips into dealer_selection / cribbage_dealer_selection
  // / game_selection. Mutating seats here leaked normalizations into
  // game_over → waiting and waiting-table renders.



  
  // Fetch allow_bot_dealers setting
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('allow_bot_dealers')
    .eq('game_type', 'holm')
    .single();
  
  const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;
  
  // Count eligible dealers (non-sitting-out, non-observer, AND non-bot humans unless bots are allowed as dealers)
  // NOTE: After evaluation, waiting players are now eligible (sitting_out=false, waiting=false)
  const eligibleDealerCount = remainingPlayers.filter(p => 
    !p.sitting_out && p.status !== 'observer' && p.status !== 'left' && (allowBotDealers || !p.is_bot)
  ).length;
  
  console.log('[PLAYER EVAL] Evaluation complete. Active players:', activePlayerCount, 'Active humans:', activeHumanCount, 'Eligible dealers:', eligibleDealerCount, 'Stood up:', playersStoodUp.length, 'allowBotDealers:', allowBotDealers);
  console.log('[PLAYER EVAL] Remaining players detail:', remainingPlayers.map(p => ({
    id: p.id.slice(0, 8),
    sitting_out: p.sitting_out,
    is_bot: p.is_bot,
    waiting: p.waiting,
    status: p.status
  })));
  
  return { activePlayerCount, activeHumanCount, eligibleDealerCount, playersStoodUp };
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
  
  // Get ALL players for debugging - use fresh query with timestamp to avoid caching
  const { data: allPlayers } = await supabase
    .from('players')
    .select('position, is_bot, sitting_out, user_id, status, waiting')
    .eq('game_id', gameId)
    .order('position', { ascending: true });
  
  console.log('[DEALER ROTATE] All players:', allPlayers?.map(p => ({
    pos: p.position,
    is_bot: p.is_bot,
    sitting_out: p.sitting_out,
    status: p.status,
    waiting: p.waiting
  })));
  
  // Build query for eligible dealers:
  // - Must have a valid position (not null - excludes observers who stood up)
  // - Must not be sitting_out
  // - Must not be a bot (unless bots are allowed as dealers)
  // - Must not be in 'observer' status
  let query = supabase
    .from('players')
    .select('position, is_bot, sitting_out, user_id, status')
    .eq('game_id', gameId)
    .eq('sitting_out', false)
    .not('position', 'is', null)
    .neq('status', 'observer');
  
  // Only filter out bots if bot dealers are NOT allowed
  if (!allowBotDealers) {
    query = query.eq('is_bot', false);
  }
  
  const { data: eligiblePlayers, error } = await query.order('position', { ascending: true });
  
  console.log('[DEALER ROTATE] Eligible players:', eligiblePlayers?.map(p => ({ pos: p.position, sitting_out: p.sitting_out, status: p.status })), 'error:', error);
  
  if (error || !eligiblePlayers || eligiblePlayers.length === 0) {
    console.log('[DEALER ROTATE] No eligible players, keeping current position');
    return currentDealerPosition;
  }
  
  // Filter out any players with null positions (extra safety check)
  const validPlayers = eligiblePlayers.filter(p => p.position !== null);
  if (validPlayers.length === 0) {
    console.log('[DEALER ROTATE] No valid players with positions, keeping current position');
    return currentDealerPosition;
  }
  
  const eligiblePositions = validPlayers.map(p => p.position as number);
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
 * Check if "make it take it" is enabled and return winner's position if they're eligible to deal.
 * If winner is not eligible (sitting out), falls back to random eligible dealer.
 * Returns null if "make it take it" is disabled.
 */
/**
 * Check if "make it take it" is enabled and return winner's position if they're eligible to deal.
 * Bots cannot be dealers - if a bot wins:
 *   - If only 1 eligible human dealer, return their position
 *   - If multiple eligible human dealers, return 'selection' to trigger dealer selection
 * Returns null if "make it take it" is disabled.
 * Returns 'selection' if dealer selection animation should be triggered.
 */
export async function getMakeItTakeItDealer(
  gameId: string,
  winnerPlayerId: string | null
): Promise<number | 'selection' | null> {
  // Fetch the make_it_take_it setting from system_settings (global setting)
  const { data: settingData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'make_it_take_it')
    .maybeSingle();
  
  const makeItTakeIt = (settingData?.value as { enabled?: boolean })?.enabled ?? false;
  console.log('[MAKE IT TAKE IT] Setting enabled:', makeItTakeIt);
  
  if (!makeItTakeIt) {
    return null; // Feature disabled, use normal rotation
  }
  
  if (!winnerPlayerId) {
    console.log('[MAKE IT TAKE IT] No winner provided, falling back to normal rotation');
    return null;
  }
  
  // Get the winner's player info
  const { data: winnerPlayer, error: winnerError } = await supabase
    .from('players')
    .select('position, sitting_out, is_bot, status')
    .eq('id', winnerPlayerId)
    .single();
  
  if (winnerError || !winnerPlayer) {
    console.log('[MAKE IT TAKE IT] Could not find winner player, falling back to normal rotation');
    return null;
  }
  
  // If winner is a bot, find eligible human dealers
  if (winnerPlayer.is_bot) {
    console.log('[MAKE IT TAKE IT] Winner is a bot - bots cannot be dealers');
    return await findEligibleHumanDealer(gameId);
  }
  
  // Check if winner is eligible to deal (not sitting out, not observer, not left)
  const isEligible = !winnerPlayer.sitting_out && winnerPlayer.status !== 'observer' && winnerPlayer.status !== 'left' && winnerPlayer.position !== null;
  console.log('[MAKE IT TAKE IT] Winner eligible:', isEligible, 'position:', winnerPlayer.position);
  
  if (isEligible) {
    console.log('[MAKE IT TAKE IT] Winner is eligible, setting them as dealer at position:', winnerPlayer.position);
    return winnerPlayer.position;
  }
  
  // Winner is not eligible (sitting out), find eligible human dealers
  console.log('[MAKE IT TAKE IT] Winner is sitting out, finding eligible human dealer');
  return await findEligibleHumanDealer(gameId);
}

/**
 * Helper to find eligible human dealers for make it take it.
 * Returns position if only 1 eligible, 'selection' if multiple, null if none.
 */
async function findEligibleHumanDealer(gameId: string): Promise<number | 'selection' | null> {
  // Get all eligible human dealers (not bots, not sitting out, not observers)
  const { data: eligiblePlayers, error: eligibleError } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .eq('sitting_out', false)
    .eq('is_bot', false)
    .not('position', 'is', null)
    .neq('status', 'observer');
  
  if (eligibleError || !eligiblePlayers || eligiblePlayers.length === 0) {
    console.log('[MAKE IT TAKE IT] No eligible human dealers found');
    return null;
  }
  
  if (eligiblePlayers.length === 1) {
    console.log('[MAKE IT TAKE IT] Only 1 eligible human dealer, selecting them:', eligiblePlayers[0].position);
    return eligiblePlayers[0].position;
  }
  
  // Multiple eligible dealers - trigger dealer selection animation
  console.log('[MAKE IT TAKE IT] Multiple eligible human dealers:', eligiblePlayers.length, '- triggering selection');
  return 'selection';
}

/**
 * Handle rejoin request from a sitting-out player
 */
export async function handlePlayerRejoin(playerId: string): Promise<boolean> {
  console.log('[PLAYER REJOIN] Setting waiting=true and clearing pending sit-out intent for player:', playerId);

  // Rejoin/opt-in explicitly cancels any pending sit-out intent. Without this,
  // a player who timed out (sit_out_next_hand=true), then rejoined and played
  // the next dealer game, would still be converted back to sitting_out at the
  // dealer-game boundary by evaluatePlayerStatesEndOfGame.
  const { error } = await supabase
    .from('players')
    .update({
      waiting: true,
      sit_out_next_hand: false,
      stand_up_next_hand: false,
    })
    .eq('id', playerId);

  if (error) {
    console.error('[PLAYER REJOIN] Error:', error);
    return false;
  }

  return true;
}

/**
 * Session participation hygiene: AFTER participation reconciliation
 * (sit_out_next_hand → sitting_out and waiting → active), sanitize stale
 * per-decision / timeout-automation state for EVERY player in the session.
 *
 * Must run BEFORE branching to either a new dealer game or back to waiting
 * so that:
 *  - passive timeout sit-outs remain seated and visible (no status='left'),
 *  - their auto_fold / current_decision / decision_locked do not leak into
 *    the next dealer game (or block opt-in eligibility recompute),
 *  - opt-ins start clean.
 *
 * Intentionally does NOT touch: sitting_out, waiting, status, position,
 * chips, sit_out_next_hand, stand_up_next_hand — those are owned by
 * evaluatePlayerStatesEndOfGame and the seat/opt-in flows.
 */
export async function sanitizePlayerAutomationStateForSession(gameId: string): Promise<void> {
  console.log('[SESSION HYGIENE] Sanitizing per-decision / automation state for game:', gameId);
  const { error } = await supabase
    .from('players')
    .update({
      auto_fold: false,
      current_decision: null,
      decision_locked: false,
      pre_fold: false,
      pre_stay: false,
      ante_decision: null,
    })
     .eq('game_id', gameId);
  if (error) {
    console.error('[SESSION HYGIENE] Error sanitizing automation state:', error);
  }
}

/**
 * SESSION HYGIENE: Clear dealer-game-scoped transient state from the
 * session/games row at every dealer-game terminal boundary. The invariant
 * is: once a dealer game ends, no dealer-game-specific transient state
 * should remain on the session row to leak into the next dealer game.
 *
 * Must be called AFTER participation reconciliation + automation sanitation
 * and BEFORE branching to waiting / next-game selection / config.
 */
export async function clearDealerGameTransientSessionState(gameId: string): Promise<void> {
  console.log('[SESSION HYGIENE] Clearing dealer-game transient session state for game:', gameId);
  const { error } = await supabase
    .from('games')
    .update({
      current_round: 0,
      next_round_number: null,
      awaiting_next_round: false,
      last_round_result: null,
      all_decisions_in: false,
      all_decisions_in_round_id: null,
      buck_position: null,
      is_first_hand: false,
      current_game_uuid: null,
    })
    .eq('id', gameId);
  if (error) {
    console.error('[SESSION HYGIENE] Error clearing transient session state:', error);
  }
}

/**
 * Soft-remove all sitting out players when game transitions back to waiting.
 * Sets status='left' so they must re-select seats to rejoin.
 * Player records are preserved for hand history FK integrity.
 */
export async function removeSittingOutPlayersOnWaiting(gameId: string): Promise<void> {
  console.log('[WAITING CLEANUP] Soft-removing sitting out players for game:', gameId);
  
  // Find all sitting out players (including those with auto_fold=true who are essentially sitting out)
  const { data: sittingOutPlayers, error: fetchError } = await supabase
    .from('players')
    .select('id, user_id, position, is_bot, sitting_out, auto_fold, profiles(username)')
    .eq('game_id', gameId)
    .neq('status', 'left')
    .or('sitting_out.eq.true,auto_fold.eq.true');
  
  if (fetchError) {
    console.error('[WAITING CLEANUP] Error fetching sitting out players:', fetchError);
    return;
  }
  
  if (!sittingOutPlayers || sittingOutPlayers.length === 0) {
    console.log('[WAITING CLEANUP] No sitting out players to remove');
    return;
  }
  
  console.log('[WAITING CLEANUP] Found', sittingOutPlayers.length, 'sitting out players to soft-remove:', 
    sittingOutPlayers.map(p => ({ pos: p.position, username: p.profiles?.username, is_bot: p.is_bot })));
  
  // Soft-delete: set status='left' instead of deleting
  const playerIds = sittingOutPlayers.map(p => p.id);
  
  const { error: updateError } = await supabase
    .from('players')
    .update({ status: 'left', sitting_out: true })
    .in('id', playerIds);
  
  if (updateError) {
    console.error('[WAITING CLEANUP] Error soft-removing sitting out players:', updateError);
  } else {
    console.log('[WAITING CLEANUP] Successfully soft-removed', playerIds.length, 'sitting out players');
  }
}
