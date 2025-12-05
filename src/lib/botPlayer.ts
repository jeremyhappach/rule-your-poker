import { supabase } from "@/integrations/supabase/client";
import { makeDecision } from "./gameLogic";

export async function addBotPlayer(gameId: string) {
  console.log('[BOT CREATION] Starting bot creation for game:', gameId);
  
  // Get existing players to determine optimal position
  const { data: existingPlayers } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position', { ascending: true });

  // Calculate optimal position for spacing players around the table
  let nextPosition: number;
  
  if (!existingPlayers || existingPlayers.length === 0) {
    nextPosition = 1;
  } else {
    const occupiedPositions = new Set(existingPlayers.map(p => p.position));
    
    // For 2 players (1 existing + 1 bot), position 4 is closest to opposite on 7-seat table
    // For more players, spread them evenly: 1, 4, 2, 6, 3, 5, 7
    const preferredOrder = existingPlayers.length === 1 
      ? [4, 1, 2, 6, 3, 5, 7]  // 2-player: bot goes to position 4 (closest to opposite)
      : [1, 4, 2, 6, 3, 5, 7]; // Multi-player: spread evenly
    
    // Find first available position from preferred order
    nextPosition = preferredOrder.find(pos => !occupiedPositions.has(pos)) || 
                   Array.from({ length: 7 }, (_, i) => i + 1).find(pos => !occupiedPositions.has(pos)) || 
                   existingPlayers[existingPlayers.length - 1].position + 1;
  }

  console.log('[BOT CREATION] Next position:', nextPosition);

  // Get the current game's buy-in amount
  const { data: game } = await supabase
    .from('games')
    .select('buy_in')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.error('[BOT CREATION] Game not found');
    throw new Error('Game not found');
  }

  // Create a bot profile first
  const botId = crypto.randomUUID();
  
  // Count ALL existing bot profiles across all games to get a globally unique bot number
  const { data: existingBotProfiles } = await supabase
    .from('profiles')
    .select('username')
    .like('username', 'Bot %');
  
  const botNumber = (existingBotProfiles?.length || 0) + 1;
  const botName = `Bot ${botNumber}`;
  
  console.log('[BOT CREATION] Creating bot profile:', { botId, botName });
  
  // Insert bot profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: botId,
      username: botName
    });

  if (profileError) {
    console.error('[BOT CREATION] Profile creation error:', profileError);
    throw new Error(`Failed to create bot profile: ${profileError.message}`);
  }

  console.log('[BOT CREATION] Profile created, now creating player');

  // Create bot player
  const { data: botPlayer, error } = await supabase
    .from('players')
    .insert({
      user_id: botId,
      game_id: gameId,
      position: nextPosition,
      chips: 0,
      is_bot: true,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('[BOT CREATION] Player creation error:', error);
    throw error;
  }

  console.log('[BOT CREATION] Bot player created successfully:', botPlayer);

  return botPlayer;
}

export async function makeBotDecisions(gameId: string, passedTurnPosition?: number | null): Promise<boolean> {
  console.log('[BOT] ========== Making bot decisions for game:', gameId, 'passedTurnPosition:', passedTurnPosition, '==========');
  
  // Check if this is a Holm game
  const { data: game } = await supabase
    .from('games')
    .select('game_type, buck_position, current_round, rounds(*)')
    .eq('id', gameId)
    .single();
    
  const isHolmGame = game?.game_type === 'holm-game';
  console.log('[BOT] Game type:', game?.game_type, 'Is Holm:', isHolmGame);
  
  if (!game?.current_round) {
    console.log('[BOT] ERROR: No active round found');
    return false;
  }

  const currentRound = game.rounds?.find((r: any) => r.round_number === game.current_round);
  if (!currentRound) {
    console.log('[BOT] ERROR: Current round not found in game.rounds');
    return false;
  }
  
  // Use passed turn position (from frontend state) if available, otherwise fall back to DB value
  const effectiveTurnPosition = passedTurnPosition ?? currentRound.current_turn_position;
  
  console.log('[BOT] Current round data:', {
    round_number: currentRound.round_number,
    current_turn_position: currentRound.current_turn_position,
    passed_turn_position: passedTurnPosition,
    effective_turn_position: effectiveTurnPosition,
    status: currentRound.status
  });
  
  // Get all bot players in the game who haven't decided yet
  const { data: botPlayers } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('is_bot', true)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .is('decision_locked', false);

  console.log('[BOT] Found undecided bot players:', botPlayers?.map(b => ({ 
    id: b.id, 
    position: b.position,
    decision_locked: b.decision_locked,
    current_decision: b.current_decision
  })));

  if (!botPlayers || botPlayers.length === 0) {
    console.log('[BOT] No undecided bot players found');
    return false;
  }

  if (isHolmGame) {
    // HOLM GAME: Turn-based - only process the bot whose turn it is
    if (!effectiveTurnPosition) {
      console.log('[BOT] HOLM: No current turn position set');
      return false;
    }

    console.log('[BOT] HOLM: Looking for bot at turn position:', effectiveTurnPosition);
    const currentTurnBot = botPlayers.find(bot => bot.position === effectiveTurnPosition);
    
    if (!currentTurnBot) {
      console.log('[BOT] HOLM: Current turn position', effectiveTurnPosition, 'is not a bot or bot already decided');
      console.log('[BOT] HOLM: Available bot positions:', botPlayers.map(b => b.position));
      return false;
    }

    console.log('[BOT] HOLM: ✓ Found bot at turn position! Processing decision for bot:', {
      id: currentTurnBot.id,
      position: currentTurnBot.position,
      current_decision: currentTurnBot.current_decision,
      decision_locked: currentTurnBot.decision_locked
    });

    // Make random decision for bot (20% stay, 80% fold)
    const shouldStay = Math.random() < 0.2;
    const decision = shouldStay ? 'stay' : 'fold';
    
    console.log('[BOT] HOLM: *** Bot deciding:', decision, '***');
    await makeDecision(gameId, currentTurnBot.id, decision);
    console.log('[BOT] HOLM: *** Decision recorded, checking if round complete ***');
    
    const { checkHolmRoundComplete } = await import('./holmGameLogic');
    await checkHolmRoundComplete(gameId);
    console.log('[BOT] HOLM: *** checkHolmRoundComplete finished, turn should have advanced ***');
    
    // Return true to signal that bot made a decision and caller should refetch
    return true;
  } else {
    // 3-5-7 GAME: Simultaneous decisions - all bots decide instantly with small delay
    console.log('[BOT] 3-5-7: Processing', botPlayers.length, 'bot decisions simultaneously');
    
    for (const bot of botPlayers) {
      // Small random delay to make it feel natural (0-500ms)
      const delay = Math.random() * 500;
      
      setTimeout(async () => {
        const shouldStay = Math.random() < 0.2; // 20% chance to stay, 80% fold
        const decision = shouldStay ? 'stay' : 'fold';
        
        console.log('[BOT] 3-5-7: Bot at position', bot.position, 'deciding:', decision);
        await makeDecision(gameId, bot.id, decision);
        console.log('[BOT] 3-5-7: Bot decision recorded');
      }, delay);
    }
  }
  
  console.log('[BOT] ========== Bot decision complete ==========');
  return false;
}

export async function makeBotAnteDecisions(gameId: string) {
  console.log('[BOT ANTE] Starting bot ante decisions for game:', gameId);
  
  // Get all bot players who haven't made ante decisions yet
  const { data: botPlayers, error } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('is_bot', true)
    .is('ante_decision', null);

  console.log('[BOT ANTE] Found bots needing decisions:', botPlayers?.length || 0, botPlayers);
  
  if (error) {
    console.error('[BOT ANTE] Error fetching bot players:', error);
    return;
  }

  if (!botPlayers || botPlayers.length === 0) {
    console.log('[BOT ANTE] No bots need to make ante decisions');
    return;
  }

  // Bots always ante up
  for (const bot of botPlayers) {
    console.log('[BOT ANTE] Bot making ante decision:', bot.id);
    const { error: updateError } = await supabase
      .from('players')
      .update({
        ante_decision: 'ante_up',
        sitting_out: false,
      })
      .eq('id', bot.id);
      
    if (updateError) {
      console.error('[BOT ANTE] Error updating bot ante decision:', updateError);
    } else {
      console.log('[BOT ANTE] Bot successfully anted up:', bot.id);
    }
  }
  
  console.log('[BOT ANTE] Completed bot ante decisions');
}
