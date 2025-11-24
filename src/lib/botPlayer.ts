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
  
  // Create bot player
  const { data: botPlayer, error } = await supabase
    .from('players')
    .insert({
      user_id: botId,
      game_id: gameId,
      position: nextPosition,
      chips: game.buy_in,
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
    
    // Add a small delay to make it feel more natural
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    await makeDecision(gameId, bot.id, decision, 10);
  }
}
