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
    
    // For 2 players (1 existing + 1 bot), position 5 is most directly opposite position 1
    // For more players, spread them evenly: 1, 5, 3, 7, 2, 4, 6
    const preferredOrder = existingPlayers.length === 1 
      ? [5, 1, 3, 7, 2, 4, 6]  // 2-player: bot goes to position 5 (directly across)
      : [1, 5, 3, 7, 2, 4, 6]; // Multi-player: spread evenly
    
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

export async function makeBotDecisions(gameId: string) {
  // Get all bot players in the game who haven't decided yet
  const { data: botPlayers } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('is_bot', true)
    .eq('status', 'active')
    .is('decision_locked', false);

  if (!botPlayers || botPlayers.length === 0) return;

  // Make random decisions for each bot (20% stay, 80% fold)
  for (const bot of botPlayers) {
    const shouldStay = Math.random() > 0.8;
    const decision = shouldStay ? 'stay' : 'fold';
    
    await makeDecision(gameId, bot.id, decision);
  }
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
