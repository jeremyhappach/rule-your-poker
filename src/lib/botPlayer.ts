import { supabase } from "@/integrations/supabase/client";
import { makeDecision } from "./gameLogic";

export async function addBotPlayer(gameId: string) {
  // Count existing players to determine position
  const { data: existingPlayers } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existingPlayers && existingPlayers.length > 0 
    ? existingPlayers[0].position + 1 
    : 1;

  // Get the current game's buy-in amount
  const { data: game } = await supabase
    .from('games')
    .select('buy_in')
    .eq('id', gameId)
    .single();

  if (!game) throw new Error('Game not found');

  // Create a bot profile first
  const botId = crypto.randomUUID();
  const botNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'];
  const randomName = botNames[Math.floor(Math.random() * botNames.length)];
  const uniqueSuffix = Math.floor(Math.random() * 10000);
  const botName = `Bot ${randomName} ${uniqueSuffix}`;
  
  // Insert bot profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: botId,
      username: botName
    });

  if (profileError) {
    console.error('Profile creation error:', profileError);
    throw new Error(`Failed to create bot profile: ${profileError.message}`);
  }

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

  if (error) throw error;

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

  // Make random decisions for each bot (60% stay, 40% fold)
  for (const bot of botPlayers) {
    const shouldStay = Math.random() > 0.4;
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
