import { supabase } from "@/integrations/supabase/client";
import { makeDecision } from "./gameLogic";
import { getBotFoldProbability, AggressionLevel } from "./botHandStrength";
import { Card } from "./cardUtils";
import { generateUUID } from "./uuid";

// Weighted aggression levels - extreme levels are rare
const AGGRESSION_WEIGHTS: { level: AggressionLevel; weight: number }[] = [
  { level: 'very_conservative', weight: 5 },   // 5% chance
  { level: 'conservative', weight: 20 },       // 20% chance
  { level: 'normal', weight: 50 },             // 50% chance
  { level: 'aggressive', weight: 20 },         // 20% chance
  { level: 'very_aggressive', weight: 5 }      // 5% chance
];

function getRandomAggressionLevel(seed?: string): AggressionLevel {
  const totalWeight = AGGRESSION_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);

  // Prefer a stable pseudo-random value derived from a seed (UUID) so we never depend on
  // potentially-deterministic RNG behavior in certain environments.
  const rand01 = (() => {
    if (seed) {
      // FNV-1a 32-bit hash over the seed string
      let hash = 2166136261;
      for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const bucket0to99 = (hash >>> 0) % 100;
      return bucket0to99 / 100;
    }

    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 2 ** 32;
    } catch {
      return Math.random();
    }
  })();

  let random = rand01 * totalWeight;
  for (const { level, weight } of AGGRESSION_WEIGHTS) {
    random -= weight;
    if (random <= 0) return level;
  }

  return 'normal';
}

export async function addBotPlayer(gameId: string) {
  console.log('[BOT CREATION] ========== Starting bot creation ==========');
  console.log('[BOT CREATION] Game ID:', gameId);
  
  // Get existing players to determine optimal position
  const { data: existingPlayers, error: playersError } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position', { ascending: true });

  if (playersError) {
    console.error('[BOT CREATION] Error fetching existing players:', playersError);
    throw new Error(`Failed to fetch existing players: ${playersError.message}`);
  }

  console.log('[BOT CREATION] Existing players:', existingPlayers);

  // Calculate optimal position for spacing players around the table
  let nextPosition: number;
  
  if (!existingPlayers || existingPlayers.length === 0) {
    nextPosition = 1;
  } else {
    const occupiedPositions = new Set(existingPlayers.map(p => p.position));
    console.log('[BOT CREATION] Occupied positions:', Array.from(occupiedPositions));
    
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

  console.log('[BOT CREATION] Selected position:', nextPosition);

  // Get the current game's buy-in amount
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('buy_in')
    .eq('id', gameId)
    .single();

  if (gameError) {
    console.error('[BOT CREATION] Error fetching game:', gameError);
    throw new Error(`Failed to fetch game: ${gameError.message}`);
  }

  if (!game) {
    console.error('[BOT CREATION] Game not found');
    throw new Error('Game not found');
  }

  console.log('[BOT CREATION] Game found, buy_in:', game.buy_in);

  // Create a bot profile first with random aggression level
  const botId = generateUUID();
  console.log('[BOT CREATION] Generated bot ID:', botId);
  
  const aggressionLevel = getRandomAggressionLevel(botId);
  console.log('[BOT CREATION] Assigned aggression level:', aggressionLevel);
  
  // Count ALL existing bot profiles across all games to get a globally unique bot number
  const { data: existingBotProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('username')
    .like('username', 'Bot %');
  
  if (profilesError) {
    console.error('[BOT CREATION] Error fetching existing bot profiles:', profilesError);
  }
  
  const botNumber = (existingBotProfiles?.length || 0) + 1;
  const botName = `Bot ${botNumber}`;
  
  console.log('[BOT CREATION] Creating bot profile:', { botId, botName, aggressionLevel });
  
  // Insert bot profile with aggression level
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: botId,
      username: botName,
      aggression_level: aggressionLevel
    });

  if (profileError) {
    console.error('[BOT CREATION] Profile creation error:', profileError);
    throw new Error(`Failed to create bot profile: ${profileError.message}`);
  }

  console.log('[BOT CREATION] Profile created successfully, now creating player record');

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

  console.log('[BOT CREATION] ========== Bot player created successfully ==========');
  console.log('[BOT CREATION] Bot player:', botPlayer);

  return botPlayer;
}

/**
 * Add a bot player that starts sitting out (waiting to join next game)
 * Used by host during active games to add bots that will join at next hand
 */
export async function addBotPlayerSittingOut(gameId: string) {
  console.log('[BOT CREATION SITTING-OUT] ========== Starting sitting-out bot creation ==========');
  console.log('[BOT CREATION SITTING-OUT] Game ID:', gameId);
  
  // Get existing players to find a random open seat
  const { data: existingPlayers, error: playersError } = await supabase
    .from('players')
    .select('position')
    .eq('game_id', gameId)
    .order('position', { ascending: true });

  if (playersError) {
    console.error('[BOT CREATION SITTING-OUT] Error fetching existing players:', playersError);
    throw new Error(`Failed to fetch existing players: ${playersError.message}`);
  }

  console.log('[BOT CREATION SITTING-OUT] Existing players:', existingPlayers);

  // Find all open positions
  const occupiedPositions = new Set(existingPlayers?.map(p => p.position) || []);
  const allPositions = [1, 2, 3, 4, 5, 6, 7];
  const openPositions = allPositions.filter(pos => !occupiedPositions.has(pos));
  
  console.log('[BOT CREATION SITTING-OUT] Occupied positions:', Array.from(occupiedPositions));
  console.log('[BOT CREATION SITTING-OUT] Open positions:', openPositions);
  
  if (openPositions.length === 0) {
    console.error('[BOT CREATION SITTING-OUT] No open seats available');
    throw new Error('No open seats available');
  }
  
  // Pick a random open position
  const randomIndex = Math.floor(Math.random() * openPositions.length);
  const nextPosition = openPositions[randomIndex];

  console.log('[BOT CREATION SITTING-OUT] Selected random position:', nextPosition);

  // Create a bot profile first with random aggression level
  const botId = generateUUID();
  console.log('[BOT CREATION SITTING-OUT] Generated bot ID:', botId);
  
  const aggressionLevel = getRandomAggressionLevel(botId);
  console.log('[BOT CREATION SITTING-OUT] Assigned aggression level:', aggressionLevel);
  
  // Count ALL existing bot profiles across all games to get a globally unique bot number
  const { data: existingBotProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('username')
    .like('username', 'Bot %');
  
  if (profilesError) {
    console.error('[BOT CREATION SITTING-OUT] Error fetching existing bot profiles:', profilesError);
  }
  
  const botNumber = (existingBotProfiles?.length || 0) + 1;
  const botName = `Bot ${botNumber}`;
  
  console.log('[BOT CREATION SITTING-OUT] Creating bot profile:', { botId, botName, aggressionLevel });
  
  // Insert bot profile with aggression level
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: botId,
      username: botName,
      aggression_level: aggressionLevel
    });

  if (profileError) {
    console.error('[BOT CREATION SITTING-OUT] Profile creation error:', profileError);
    throw new Error(`Failed to create bot profile: ${profileError.message}`);
  }

  console.log('[BOT CREATION SITTING-OUT] Profile created successfully, now creating sitting-out player record');

  // Create bot player with sitting_out=true and waiting=true
  const { data: botPlayer, error } = await supabase
    .from('players')
    .insert({
      user_id: botId,
      game_id: gameId,
      position: nextPosition,
      chips: 0,
      is_bot: true,
      status: 'active',
      sitting_out: true,
      waiting: true
    })
    .select()
    .single();

  if (error) {
    console.error('[BOT CREATION SITTING-OUT] Player creation error:', error);
    throw error;
  }

  console.log('[BOT CREATION SITTING-OUT] ========== Bot player created successfully ==========');
  console.log('[BOT CREATION SITTING-OUT] Bot player:', botPlayer);

  return botPlayer;
}

export async function makeBotDecisions(gameId: string, passedTurnPosition?: number | null) {
  console.log('[BOT DECISIONS] Making decisions for game:', gameId, 'turnPosition:', passedTurnPosition);
  
  // Get current round and game type
  const { data: gameData } = await supabase
    .from('games')
    .select('game_type, current_round')
    .eq('id', gameId)
    .single();
  
  const isHolmGame = gameData?.game_type === 'holm-game' || gameData?.game_type === 'holm';
  const roundNumber = gameData?.current_round || 1;
  
  // Get current round data
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('id, current_turn_position, community_cards')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();
  
  if (!currentRound) {
    console.log('[BOT DECISIONS] No current round found');
    return false;
  }
  
  // For Holm games, use passed turn position for accuracy (avoids stale DB reads)
  const effectiveTurnPosition = passedTurnPosition ?? currentRound.current_turn_position;
  
  let botQuery = supabase
    .from('players')
    .select('id, user_id, position, current_decision, is_bot')
    .eq('game_id', gameId)
    .eq('is_bot', true)
    .eq('sitting_out', false)
    .is('current_decision', null);
  
  // For Holm games, only get the bot whose turn it is
  if (isHolmGame && effectiveTurnPosition !== null) {
    botQuery = botQuery.eq('position', effectiveTurnPosition);
    console.log('[BOT DECISIONS] Holm game - only processing bot at position:', effectiveTurnPosition);
  }
  
  const { data: botsToDecide } = await botQuery;
  
  if (!botsToDecide || botsToDecide.length === 0) {
    console.log('[BOT DECISIONS] No bots need to decide');
    return false;
  }

  console.log('[BOT DECISIONS] Bots to decide:', botsToDecide.map(b => ({ id: b.id, pos: b.position })));

  // Get bot profiles to fetch aggression levels
  const botUserIds = botsToDecide.map(b => b.user_id);
  const { data: botProfiles } = await supabase
    .from('profiles')
    .select('id, aggression_level')
    .in('id', botUserIds);
  
  const aggressionMap = new Map<string, AggressionLevel>();
  botProfiles?.forEach(p => {
    aggressionMap.set(p.id, (p.aggression_level as AggressionLevel) || 'normal');
  });

  // Get game defaults for bot behavior (for decision delay and hand strength toggle)
  const gameTypeKey = isHolmGame ? 'holm' : '3-5-7';
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('bot_decision_delay_seconds, bot_fold_probability, bot_use_hand_strength')
    .eq('game_type', gameTypeKey)
    .single();
  
  const decisionDelay = gameDefaults?.bot_decision_delay_seconds ?? 2.0;
  const useHandStrength = gameDefaults?.bot_use_hand_strength ?? true;
  const universalFoldProbability = gameDefaults?.bot_fold_probability ?? 30;
  
  // Parse community cards for Holm games
  const communityCards: Card[] = isHolmGame && currentRound.community_cards
    ? (currentRound.community_cards as unknown as Card[])
    : [];

  // For Holm games, process only the current turn's bot (should be just 1)
  if (isHolmGame) {
    const bot = botsToDecide[0];
    if (!bot) return false;
    
    const botAggressionLevel = aggressionMap.get(bot.user_id) || 'normal';
    console.log('[BOT DECISIONS] Holm: Processing bot decision for position:', bot.position, 'aggression:', botAggressionLevel);
    
    // Get this bot's cards
    const { data: playerCards } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('player_id', bot.id)
      .eq('round_id', currentRound.id)
      .single();
    
    const botCards: Card[] = playerCards?.cards ? (playerCards.cards as unknown as Card[]) : [];
    
    // Calculate fold probability - use hand strength or universal setting
    let foldProbability: number;
    if (useHandStrength) {
      foldProbability = getBotFoldProbability(botCards, communityCards, 'holm', 1, botAggressionLevel);
      console.log('[BOT DECISIONS] Holm bot fold probability:', foldProbability, '% based on hand strength, aggression:', botAggressionLevel);
    } else {
      // Apply aggression multiplier even to universal probability
      const multiplier = { 'very_conservative': 1.6, 'conservative': 1.3, 'normal': 1.0, 'aggressive': 0.7, 'very_aggressive': 0.4 }[botAggressionLevel];
      foldProbability = Math.min(100, Math.max(0, universalFoldProbability * multiplier));
      console.log('[BOT DECISIONS] Holm bot using universal fold probability:', foldProbability, '% (adjusted for aggression:', botAggressionLevel, ')');
    }
    
    // Add delay before bot makes decision
    await new Promise(resolve => setTimeout(resolve, decisionDelay * 1000));
    
    // Decide to stay or fold based on calculated probability
    const shouldFold = Math.random() * 100 < foldProbability;
    const decision: 'stay' | 'fold' = shouldFold ? 'fold' : 'stay';
    
    console.log('[BOT DECISIONS] Bot at position', bot.position, 'deciding:', decision);
    
    await makeDecision(gameId, bot.id, decision);
    // NOTE: makeDecision already calls checkHolmRoundComplete internally for Holm games
    // DO NOT call it again here - that causes double turn advancement!
    
    // Return true to indicate a decision was made (caller may need to refetch)
    return true;
  }
  
  // For 3-5-7 games, process all bots with staggered delays (simultaneous decisions)
  for (const bot of botsToDecide) {
    const botAggressionLevel = aggressionMap.get(bot.user_id) || 'normal';
    
    // Get this bot's cards
    const { data: playerCards } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('player_id', bot.id)
      .eq('round_id', currentRound.id)
      .single();
    
    const botCards: Card[] = playerCards?.cards ? (playerCards.cards as unknown as Card[]) : [];
    
    // Calculate fold probability - use hand strength or universal setting
    let foldProbability: number;
    if (useHandStrength) {
      foldProbability = getBotFoldProbability(botCards, [], '357', roundNumber, botAggressionLevel);
      console.log('[BOT DECISIONS] 3-5-7 bot at position', bot.position, 'fold probability:', foldProbability, '% (round', roundNumber, ', hand strength, aggression:', botAggressionLevel, ')');
    } else {
      // Apply aggression multiplier even to universal probability
      const multiplier = { 'very_conservative': 1.6, 'conservative': 1.3, 'normal': 1.0, 'aggressive': 0.7, 'very_aggressive': 0.4 }[botAggressionLevel];
      foldProbability = Math.min(100, Math.max(0, universalFoldProbability * multiplier));
      console.log('[BOT DECISIONS] 3-5-7 bot at position', bot.position, 'using universal fold probability:', foldProbability, '% (adjusted for aggression:', botAggressionLevel, ')');
    }
    
    // Stagger bot decisions slightly to feel more natural
    const randomDelay = (decisionDelay * 1000) + Math.random() * 1500;
    
    setTimeout(async () => {
      // Decide to stay or fold based on calculated probability
      const shouldFold = Math.random() * 100 < foldProbability;
      const decision: 'stay' | 'fold' = shouldFold ? 'fold' : 'stay';
      
      console.log('[BOT DECISIONS] Bot', bot.id, 'deciding:', decision, 'after', randomDelay, 'ms');
      
      await makeDecision(gameId, bot.id, decision);
    }, randomDelay);
  }
  
  return false; // 3-5-7 decisions are async, don't need immediate refetch
}

export async function makeBotAnteDecisions(gameId: string) {
  console.log('[BOT ANTE] Making ante decisions for bots in game:', gameId);
  
  // Get bot players who haven't made ante decision yet AND are not sitting out
  // CRITICAL: Respect sitting_out status - don't force bots back into the game if they're set to sit out
  const { data: botsToAnte } = await supabase
    .from('players')
    .select('id, sitting_out')
    .eq('game_id', gameId)
    .eq('is_bot', true)
    .is('ante_decision', null);
  
  if (!botsToAnte || botsToAnte.length === 0) {
    console.log('[BOT ANTE] No bots need ante decision');
    return;
  }

  console.log('[BOT ANTE] Bots to evaluate:', botsToAnte.length);

  // Only bots that are NOT sitting out will ante up
  // Bots that are sitting_out should stay sitting out (don't override with sitting_out: false)
  for (const bot of botsToAnte) {
    if (bot.sitting_out) {
      console.log('[BOT ANTE] Bot', bot.id, 'is sitting out, skipping ante');
      await supabase
        .from('players')
        .update({ ante_decision: 'sit_out' })
        .eq('id', bot.id);
    } else {
      console.log('[BOT ANTE] Bot', bot.id, 'anting up');
      await supabase
        .from('players')
        .update({ ante_decision: 'ante_up' })
        .eq('id', bot.id);
    }
  }

  console.log('[BOT ANTE] All bot ante decisions made');
}