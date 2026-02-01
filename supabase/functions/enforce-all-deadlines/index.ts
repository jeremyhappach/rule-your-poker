import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CRON-BASED COMPREHENSIVE DEADLINE ENFORCER
 * 
 * This edge function is designed to be called by a cron job.
 * It handles ALL game maintenance and progression when no clients are connected:
 * 
 * 1. Stale game cleanup (stuck sessions, empty games, etc.)
 * 2. Bot-only game detection and session ending
 * 3. Degenerate game state detection
 * 4. Hand evaluation and game progression for abandoned/bot-only games
 * 5. Game over countdown handling
 * 6. Config/ante/decision deadline enforcement (as backup to client)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============== CARD UTILITIES ==============
interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
}

function createDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Holm hand evaluation
const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function evaluateHolmHand(cards: Card[]): { rank: string; value: number } {
  if (cards.length === 0) return { rank: 'high-card', value: 0 };
  
  const validCards = cards.map(c => ({
    suit: c.suit,
    rank: String(c.rank).toUpperCase()
  })).filter(c => RANK_VALUES[c.rank] !== undefined);
  
  if (validCards.length === 0) return { rank: 'high-card', value: 0 };
  
  const sortedCards = [...validCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  const rankCounts: Record<string, number> = {};
  validCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  
  const groups = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1] || RANK_VALUES[b[0]] - RANK_VALUES[a[0]]);
  
  const bestRank = groups[0]?.[0];
  const bestCount = groups[0]?.[1] || 0;
  const secondRank = groups[1]?.[0];
  const secondCount = groups[1]?.[1] || 0;
  
  const suitCounts: Record<string, number> = {};
  validCards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const isFlush = maxSuitCount >= 5;
  
  const uniqueValues = [...new Set(validCards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  
  for (let start = 14; start >= 5; start--) {
    let hasAll = true;
    for (let i = 0; i < 5; i++) {
      if (!uniqueValues.includes(start - i)) {
        hasAll = false;
        break;
      }
    }
    if (hasAll) {
      isStraight = true;
      straightHigh = start;
      break;
    }
  }
  
  if (!isStraight && uniqueValues.includes(14) && uniqueValues.includes(2) && 
      uniqueValues.includes(3) && uniqueValues.includes(4) && uniqueValues.includes(5)) {
    isStraight = true;
    straightHigh = 5;
  }
  
  if (isFlush && isStraight) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count >= 5)?.[0];
    const flushCards = validCards.filter(c => c.suit === flushSuit);
    const flushValues = [...new Set(flushCards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
    
    for (let start = 14; start >= 5; start--) {
      let hasAll = true;
      for (let i = 0; i < 5; i++) {
        if (!flushValues.includes(start - i)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        return { rank: 'straight-flush', value: 8000000000 + start };
      }
    }
    if (flushValues.includes(14) && flushValues.includes(2) && flushValues.includes(3) &&
        flushValues.includes(4) && flushValues.includes(5)) {
      return { rank: 'straight-flush', value: 8000000000 + 5 };
    }
  }
  
  if (bestCount >= 4) {
    return { rank: 'four-of-a-kind', value: 7000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  if (bestCount >= 3 && secondCount >= 2) {
    return { rank: 'full-house', value: 6000000000 + RANK_VALUES[bestRank] * 100 + RANK_VALUES[secondRank] };
  }
  
  if (isFlush) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count >= 5)?.[0];
    const flushCards = validCards.filter(c => c.suit === flushSuit)
      .sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    return { rank: 'flush', value: 5000000000 + RANK_VALUES[flushCards[0].rank] * 100 };
  }
  
  if (isStraight) {
    return { rank: 'straight', value: 4000000000 + straightHigh };
  }
  
  if (bestCount >= 3) {
    return { rank: 'three-of-a-kind', value: 3000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  const pairs = groups.filter(([_, count]) => count >= 2);
  if (pairs.length >= 2) {
    const highPair = RANK_VALUES[pairs[0][0]];
    const lowPair = RANK_VALUES[pairs[1][0]];
    return { rank: 'two-pair', value: 2000000000 + highPair * 100 + lowPair };
  }
  
  if (bestCount >= 2) {
    return { rank: 'pair', value: 1000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  return { rank: 'high-card', value: RANK_VALUES[sortedCards[0].rank] };
}

// ============== MAIN HANDLER ==============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const cronRunId = crypto.randomUUID();
  console.log('[CRON-ENFORCE] Starting comprehensive deadline enforcement scan', { cronRunId });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const keyToUse = serviceRoleKey || anonKey;

    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[CRON-ENFORCE] Missing required env vars');
      return new Response(JSON.stringify({ error: 'Backend configuration missing' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    // DEBUG: allow temporarily disabling the cron enforcer to isolate race conditions.
    // Set system_settings.key = 'debug_disable_enforcement' with value:
    // - true (disables everything)
    // - { cron: true } (disables cron only)
    try {
      const { data: debugSetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'debug_disable_enforcement')
        .maybeSingle();

      const v: any = (debugSetting as any)?.value;
      const cronDisabled =
        v === true ||
        v === 'true' ||
        (typeof v === 'object' && v && (v.all === true || v.disabled === true || v.cron === true));

      if (cronDisabled) {
        console.log('[CRON-ENFORCE] Disabled via system_settings.debug_disable_enforcement', { cronRunId });
        return new Response(JSON.stringify({ success: true, disabled: true, cronRunId }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      console.warn('[CRON-ENFORCE] Failed to read debug_disable_enforcement (continuing):', e);
    }
    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch all active games
    const activeStatuses = ['waiting', 'dealer_selection', 'configuring', 'game_selection', 'ante_decision', 'in_progress', 'betting', 'game_over', 'waiting_for_players'];
    
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .in('status', activeStatuses);

    if (gamesError) {
      console.error('[CRON-ENFORCE] Failed to fetch games:', gamesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch games' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[CRON-ENFORCE] Found', games?.length || 0, 'active games to check');

    const results: { gameId: string; status: string; result: string }[] = [];

    // Staleness thresholds
    const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
    const PAUSED_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
    const DEALER_SELECTION_TIMEOUT_MS = 60000; // 60 seconds
    const AWAITING_NEXT_ROUND_THRESHOLD_MS = 10000; // 10 seconds

    for (const game of games || []) {
      const actionsTaken: string[] = [];
      const gameUpdatedAt = game.updated_at ? new Date(game.updated_at) : null;
      const msSinceUpdate = gameUpdatedAt ? now.getTime() - gameUpdatedAt.getTime() : 0;

      try {
        // ============= HANDLE STALE PAUSED GAMES =============
        if (game.is_paused) {
          const isRealMoney = game.real_money === true;
          
          if (msSinceUpdate > PAUSED_STALE_THRESHOLD_MS && !isRealMoney) {
            console.log('[CRON-ENFORCE] Stale paused PLAY MONEY game, ending session:', game.id);
            
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                pending_session_end: false,
                session_ended_at: nowIso,
                game_over_at: nowIso,
                is_paused: false,
                config_deadline: null,
                ante_decision_deadline: null,
                config_complete: false,
              })
              .eq('id', game.id);
            
            actionsTaken.push('Stale paused play-money game (>4h): session ended');
          } else {
            results.push({ gameId: game.id, status: game.status, result: 'skipped_paused' });
            continue;
          }
          
          results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') || 'no_action' });
          continue;
        }

        // ============= CONFIG DEADLINE ENFORCEMENT (game_selection/configuring/dealer_selection) =============
        // CRITICAL: Backup enforcement when no clients are connected during dealer setup phase.
        if ((game.status === 'dealer_selection' || game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
          const configDeadline = new Date(game.config_deadline);
          const msUntilDeadline = configDeadline.getTime() - now.getTime();
          
          if (msUntilDeadline <= 0) {
            console.log('[CRON-ENFORCE] Config deadline EXPIRED for game', game.id, 'status:', game.status);
            
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', game.id);

            const dealerPlayer = players?.find((p: any) => p.position === game.dealer_position);

            if (dealerPlayer) {
              // Mark dealer as sitting out
              await supabase
                .from('players')
                .update({ sitting_out: true, waiting: false })
                .eq('id', dealerPlayer.id);

              actionsTaken.push(`Config timeout: Dealer at position ${dealerPlayer.position} sat out`);

              // Fetch game defaults to check allow_bot_dealers
              const { data: gameDefaults } = await supabase
                .from('game_defaults')
                .select('allow_bot_dealers')
                .eq('game_type', game.game_type || 'holm')
                .maybeSingle();
              
              const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

              // Re-fetch players to get updated list
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', game.id);

              // Count remaining eligible dealers
              const eligibleDealers = (freshPlayers || []).filter((p: any) =>
                !p.sitting_out &&
                p.id !== dealerPlayer.id &&
                (allowBotDealers || !p.is_bot)
              );

              if (eligibleDealers.length >= 1) {
                // Rotate dealer to next eligible player
                const sortedEligible = eligibleDealers.sort((a: any, b: any) => a.position - b.position);
                const currentDealerIdx = sortedEligible.findIndex((p: any) => p.position > game.dealer_position);
                const nextDealer = currentDealerIdx >= 0
                  ? sortedEligible[currentDealerIdx]
                  : sortedEligible[0];

                const setupSeconds = typeof game.game_setup_timer_seconds === 'number'
                  ? Math.max(1, game.game_setup_timer_seconds)
                  : 30;
                const newConfigDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();

                await supabase
                  .from('games')
                  .update({
                    dealer_position: nextDealer.position,
                    config_deadline: newConfigDeadline,
                  })
                  .eq('id', game.id);

                actionsTaken.push(`Config timeout: Rotated dealer to position ${nextDealer.position}`);
              } else {
                // Not enough eligible dealers - check for history
                const totalHands = game.total_hands || 0;
                const { count: resultsCount } = await supabase
                  .from('game_results')
                  .select('id', { count: 'exact', head: true })
                  .eq('game_id', game.id);
                
                const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;

                // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
                const isRealMoney = game.real_money === true;
                
                if (isRealMoney) {
                  console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
                  await supabase
                    .from('games')
                    .update({
                      status: 'session_ended',
                      pending_session_end: false,
                      session_ended_at: nowIso,
                      game_over_at: nowIso,
                      config_deadline: null,
                      config_complete: false,
                    })
                    .eq('id', game.id);
                  actionsTaken.push('Config timeout: Real money game archived (never deleted)');
                } else if (!hasHistory) {
                  // Delete empty session
                  const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
                  const roundIds = (roundRows ?? []).map((r: any) => r.id);
                  if (roundIds.length > 0) {
                    await supabase.from('player_cards').delete().in('round_id', roundIds);
                    await supabase.from('player_actions').delete().in('round_id', roundIds);
                  }
                  await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
                  await supabase.from('chat_messages').delete().eq('game_id', game.id);
                  await supabase.from('rounds').delete().eq('game_id', game.id);
                  await supabase.from('players').delete().eq('game_id', game.id);
                  await supabase.from('games').delete().eq('id', game.id);
                  
                  actionsTaken.push('Config timeout: No eligible dealers, no history - deleted empty session');
                } else {
                  // Has history - end session instead of deleting
                  await supabase
                    .from('games')
                    .update({
                      status: 'session_ended',
                      pending_session_end: false,
                      session_ended_at: nowIso,
                      game_over_at: nowIso,
                      config_deadline: null,
                      config_complete: false,
                    })
                    .eq('id', game.id);

                  actionsTaken.push('Config timeout: No eligible dealers, session ended');
                }
              }
            } else {
              // No dealer found - clean up based on history
              const totalHands = game.total_hands || 0;
              const { count: resultsCount } = await supabase
                .from('game_results')
                .select('id', { count: 'exact', head: true })
                .eq('game_id', game.id);
              
              const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;

              // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
              const isRealMoney = game.real_money === true;
              
              if (isRealMoney) {
                console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    pending_session_end: false,
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    config_deadline: null,
                    config_complete: false,
                  })
                  .eq('id', game.id);
                actionsTaken.push('Config timeout: Real money game archived (never deleted)');
              } else if (!hasHistory) {
                // Delete empty session
                const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
                const roundIds = (roundRows ?? []).map((r: any) => r.id);
                if (roundIds.length > 0) {
                  await supabase.from('player_cards').delete().in('round_id', roundIds);
                  await supabase.from('player_actions').delete().in('round_id', roundIds);
                }
                await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
                await supabase.from('chat_messages').delete().eq('game_id', game.id);
                await supabase.from('rounds').delete().eq('game_id', game.id);
                await supabase.from('players').delete().eq('game_id', game.id);
                await supabase.from('games').delete().eq('id', game.id);
                
                actionsTaken.push('Config timeout: No dealer found, no history - deleted empty session');
              } else {
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    pending_session_end: false,
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    config_deadline: null,
                    config_complete: false,
                  })
                  .eq('id', game.id);

                actionsTaken.push('Config timeout: No dealer found, session ended');
              }
            }
            
            results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
            continue;
          }
        }

        // ============= BOT-ONLY GAME CHECK =============
        if (game.status === 'in_progress' || game.status === 'betting' || game.status === 'ante_decision') {
          const { data: allPlayers } = await supabase
            .from('players')
            .select('id, user_id, is_bot, sitting_out, status, auto_fold, chips')
            .eq('game_id', game.id);
          
          const presentHumans = (allPlayers || []).filter((p: any) => !p.is_bot && !p.sitting_out);
          const presentBots = (allPlayers || []).filter((p: any) => p.is_bot && !p.sitting_out);
          const activePlayers = (allPlayers || []).filter((p: any) => !p.sitting_out);
          
          if (presentHumans.length === 0 && presentBots.length > 0) {
            console.log('[CRON-ENFORCE] ⚠️ BOT-ONLY GAME DETECTED, ending session:', game.id);
            
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                pending_session_end: false,
                session_ended_at: nowIso,
                game_over_at: nowIso,
                config_deadline: null,
                ante_decision_deadline: null,
                awaiting_next_round: false,
              })
              .eq('id', game.id);
            
            actionsTaken.push('Bot-only game: All humans sitting_out, session ended');
            results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
            continue;
          }
          
          // ============= ALL AUTO-FOLD CHECK =============
          // Check if all active players are in auto_fold mode - this would cause infinite pussy tax
          if (activePlayers.length >= 2) {
            const allInAutoFold = activePlayers.every((p: any) => p.auto_fold === true);
            
            if (allInAutoFold) {
              console.log('[CRON-ENFORCE] ⚠️ ALL PLAYERS IN AUTO-FOLD DETECTED:', game.id);
              
              const isRealMoney = game.real_money === true;
              
              if (isRealMoney) {
                // Real money game: Pause the session
                console.log('[CRON-ENFORCE] Real money game - PAUSING session');
                
                await supabase
                  .from('games')
                  .update({
                    is_paused: true,
                    config_deadline: null,
                    ante_decision_deadline: null,
                  })
                  .eq('id', game.id);
                
                actionsTaken.push('All players in auto-fold: Real money game paused');
              } else {
                // Non-real money game: Split pot evenly and end session
                console.log('[CRON-ENFORCE] Play money game - Splitting pot and ending session');
                
                const currentPot = game.pot || 0;
                
                if (currentPot > 0 && activePlayers.length > 0) {
                  // Calculate split amount (integer division, remainder stays in void)
                  const splitAmount = Math.floor(currentPot / activePlayers.length);
                  
                  // Update each player's chips using atomic increment
                  for (const player of activePlayers) {
                    await supabase.rpc('increment_player_chips', {
                      p_player_id: player.id,
                      p_amount: splitAmount,
                    });
                  }
                  
                  actionsTaken.push(`Pot of $${currentPot} split evenly: $${splitAmount} to each of ${activePlayers.length} players`);
                }
                
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    pending_session_end: false,
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    pot: 0,
                    config_deadline: null,
                    ante_decision_deadline: null,
                    awaiting_next_round: false,
                  })
                  .eq('id', game.id);
                
                actionsTaken.push('All players in auto-fold: Play money game - pot split and session ended');
              }
              
              results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
              continue;
            }
          }
        }

        // ============= ANTE DECISION DEADLINE ENFORCEMENT =============
        // CRITICAL: This is the backup enforcement when no clients are connected.
        // If all browsers close during ante_decision, this ensures the game progresses.
        if (game.status === 'ante_decision') {
          const { data: allPlayers } = await supabase
            .from('players')
            .select('id, user_id, is_bot, sitting_out, status, ante_decision, profiles(username)')
            .eq('game_id', game.id);
          
          // Step 1: Auto-ante all bots immediately (they should never wait)
          const undecidedBots = (allPlayers || []).filter((p: any) => 
            p.is_bot && !p.ante_decision && !p.sitting_out
          );
          
          if (undecidedBots.length > 0) {
            console.log('[CRON-ENFORCE] 🤖 Auto-anteing', undecidedBots.length, 'bots for game', game.id);
            const botIds = undecidedBots.map((p: any) => p.id);
            await supabase
              .from('players')
              .update({ ante_decision: 'ante_up' })
              .in('id', botIds);
            actionsTaken.push(`Bot ante: Auto-anted ${botIds.length} bots`);
          }
          
          // Step 2: Check if ante deadline has expired for humans
          if (game.ante_decision_deadline) {
            const anteDeadline = new Date(game.ante_decision_deadline);
            if (now > anteDeadline) {
              console.log('[CRON-ENFORCE] Ante deadline expired for game', game.id);
              
              // Re-fetch players after bot ante updates
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('id, user_id, is_bot, sitting_out, status, ante_decision, profiles(username)')
                .eq('game_id', game.id);
              
              // Find undecided HUMAN players and auto-sit them out
              const undecidedHumans = (freshPlayers || []).filter((p: any) => 
                !p.is_bot && !p.ante_decision && !p.sitting_out
              );
              
              if (undecidedHumans.length > 0) {
                console.log('[CRON-ENFORCE] Sitting out', undecidedHumans.length, 'undecided humans');
                const undecidedIds = undecidedHumans.map((p: any) => p.id);
                await supabase
                  .from('players')
                  .update({
                    ante_decision: 'sit_out',
                    sitting_out: true,
                    waiting: false,
                  })
                  .in('id', undecidedIds);
                actionsTaken.push(`Ante timeout: Auto-sat-out ${undecidedIds.length} undecided human players`);
              }
              
              // Step 3: Check if we have enough players to continue
              const { data: finalPlayers } = await supabase
                .from('players')
                .select('id, user_id, is_bot, sitting_out, status, ante_decision, position')
                .eq('game_id', game.id);
              
              const activePlayers = (finalPlayers || []).filter((p: any) => 
                !p.sitting_out && p.ante_decision === 'ante_up'
              );
              
              if (activePlayers.length >= 2) {
                // Enough players - transition to in_progress
                console.log('[CRON-ENFORCE] Starting hand with', activePlayers.length, 'players');
                await supabase
                  .from('games')
                  .update({
                    status: 'in_progress',
                    ante_decision_deadline: null,
                  })
                  .eq('id', game.id);
                actionsTaken.push(`Ante complete: ${activePlayers.length} players ready, transitioning to in_progress`);
              } else {
                // Not enough players - return to waiting or rotate to config
                console.log('[CRON-ENFORCE] Not enough players after ante timeout, need at least 2, have', activePlayers.length);
                
                const currentDealer = (finalPlayers || []).find((p: any) => p.position === game.dealer_position);
                const dealerIsActive = currentDealer && !currentDealer.sitting_out;
                
                // Find next eligible dealer
                const eligibleDealers = (finalPlayers || []).filter((p: any) => 
                  !p.is_bot && !p.sitting_out
                ).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
                
                if (eligibleDealers.length >= 2) {
                  // We have enough humans for a game, just missing ante responses
                  // Rotate to configuring with new dealer
                  const currentPos = game.dealer_position || 1;
                  const higherPositions = eligibleDealers.filter((p: any) => p.position > currentPos);
                  const nextDealer = higherPositions.length > 0 
                    ? higherPositions[0] 
                    : eligibleDealers[0];
                  
                  const configDeadline = new Date(Date.now() + 30 * 1000).toISOString();
                  
                  await supabase
                    .from('games')
                    .update({
                      status: 'configuring',
                      ante_decision_deadline: null,
                      config_deadline: configDeadline,
                      dealer_position: dealerIsActive ? game.dealer_position : nextDealer.position,
                      last_round_result: null,
                    })
                    .eq('id', game.id);
                  
                  // Reset ante decisions for next attempt
                  await supabase
                    .from('players')
                    .update({
                      ante_decision: null,
                      current_decision: null,
                    })
                    .eq('game_id', game.id)
                    .eq('sitting_out', false);
                  
                  actionsTaken.push(`Ante timeout: Not enough players (${activePlayers.length}), rotating to configuring`);
                } else if (eligibleDealers.length === 1) {
                  // Only one human left
                  await supabase
                    .from('games')
                    .update({
                      status: 'waiting_for_players',
                      ante_decision_deadline: null,
                    })
                    .eq('id', game.id);
                  actionsTaken.push('Ante timeout: Only 1 active player, returning to waiting_for_players');
                } else {
                  // No eligible dealers - end session
                  const hasHistory = (game.total_hands || 0) > 0;
                  
                  if (hasHistory) {
                    await supabase
                      .from('games')
                      .update({
                        status: 'session_ended',
                        pending_session_end: false,
                        session_ended_at: nowIso,
                        game_over_at: nowIso,
                        ante_decision_deadline: null,
                      })
                      .eq('id', game.id);
                    actionsTaken.push('Ante timeout: No active players, session ended');
                  } else if (game.real_money === true) {
                    // CRITICAL: NEVER delete real_money games - archive instead
                    console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
                    await supabase
                      .from('games')
                      .update({
                        status: 'session_ended',
                        pending_session_end: false,
                        session_ended_at: nowIso,
                        game_over_at: nowIso,
                        ante_decision_deadline: null,
                      })
                      .eq('id', game.id);
                    actionsTaken.push('Ante timeout: Real money game archived (never deleted)');
                  } else {
                    // Delete empty session
                    const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
                    const roundIds = (roundRows ?? []).map((r: any) => r.id);
                    if (roundIds.length > 0) {
                      await supabase.from('player_cards').delete().in('round_id', roundIds);
                      await supabase.from('player_actions').delete().in('round_id', roundIds);
                    }
                    await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
                    await supabase.from('chat_messages').delete().eq('game_id', game.id);
                    await supabase.from('rounds').delete().eq('game_id', game.id);
                    await supabase.from('players').delete().eq('game_id', game.id);
                    await supabase.from('games').delete().eq('id', game.id);
                    actionsTaken.push('Ante timeout: No active players, no history - deleted empty session');
                  }
                }
              }
              
              if (actionsTaken.length > 0) {
                results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
                continue;
              }
            }
          }
        }

        // ============= STUCK HOLM GAME RECOVERY (all_decisions_in mismatch) =============
        // Detects games where all players have decision_locked=true but all_decisions_in is still false
        // This can happen if endHolmRound crashes/stalls before completing
        if ((game.game_type === 'holm' || game.game_type === 'holm-game') && 
            game.status === 'in_progress' && 
            game.all_decisions_in === false) {
          
          // For Holm, get the latest round by hand_number/round_number within the dealer game
          const dealerGameId = (game as any).current_game_uuid;
          const roundQuery = supabase
            .from('rounds')
            .select('id, status')
            .eq('game_id', game.id);
            
          const scopedQuery = dealerGameId 
            ? roundQuery.eq('dealer_game_id', dealerGameId)
            : roundQuery;
            
          const { data: currentRound } = await scopedQuery
            // CRITICAL: NULLS LAST so null hand_number/round_number rows don't win DESC ordering.
            .order('hand_number', { ascending: false, nullsFirst: false })
            .order('round_number', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          
          if (currentRound && (currentRound.status === 'processing' || currentRound.status === 'active' || currentRound.status === 'betting')) {
            const { data: holmPlayers } = await supabase
              .from('players')
              .select('id, position, decision_locked, current_decision, sitting_out, status')
              .eq('game_id', game.id);
            
            // Check active players (not sitting out)
            const activePlayers = (holmPlayers || []).filter((p: any) => 
              !p.sitting_out && p.status === 'active'
            );
            
            // Check if ALL active players have decision_locked = true
            const allDecided = activePlayers.length > 0 && 
              activePlayers.every((p: any) => p.decision_locked === true);
            
            if (allDecided) {
              console.log('[CRON-ENFORCE] 🔧 STUCK HOLM GAME RECOVERY: all players decided but all_decisions_in=false', {
                gameId: game.id,
                roundId: currentRound.id,
                roundStatus: currentRound.status,
                playerCount: activePlayers.length,
              });
              
              // Fix by setting all_decisions_in = true (triggers client-side showdown)
              await supabase
                .from('games')
                .update({ all_decisions_in: true })
                .eq('id', game.id);
              
              // Clear stale deadline/turn position
              await supabase
                .from('rounds')
                .update({ 
                  current_turn_position: null,
                  decision_deadline: null,
                })
                .eq('id', currentRound.id);
              
              actionsTaken.push('Stuck Holm recovery: Set all_decisions_in=true, all players had decided');
              results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
              continue;
            }
          }
        }

        // ============= DEGENERATE GAME STATE CHECK =============
        if (game.status === 'in_progress') {
          const CONSECUTIVE_FOLDS_THRESHOLD = 5;
          
          const { data: recentResults } = await supabase
            .from('game_results')
            .select('winner_player_id, winning_hand_description')
            .eq('game_id', game.id)
            .order('hand_number', { ascending: false })
            .limit(CONSECUTIVE_FOLDS_THRESHOLD);
          
          if (recentResults && recentResults.length >= CONSECUTIVE_FOLDS_THRESHOLD) {
            const allEveryoneFolded = recentResults.every((r: any) => 
              r.winner_player_id === null && 
              (r.winning_hand_description?.toLowerCase().includes('everyone folded') || 
               r.winning_hand_description?.toLowerCase().includes('pussy tax'))
            );
            
            if (allEveryoneFolded) {
              console.log('[CRON-ENFORCE] ⚠️ DEGENERATE GAME STATE, ending session:', game.id);
              
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  config_deadline: null,
                  ante_decision_deadline: null,
                  awaiting_next_round: false,
                })
                .eq('id', game.id);
              
              actionsTaken.push(`Degenerate game: ${CONSECUTIVE_FOLDS_THRESHOLD} consecutive hands everyone folded, session ended`);
              results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
              continue;
            }
          }
        }

        // ============= STALE DEALER_SELECTION CLEANUP =============
        if (game.status === 'dealer_selection' && !game.config_deadline) {
          const gameCreatedAt = new Date(game.created_at);
          const staleSince = Math.max(gameCreatedAt.getTime(), gameUpdatedAt?.getTime() || 0);
          const staleMs = now.getTime() - staleSince;
          
          if (staleMs > DEALER_SELECTION_TIMEOUT_MS) {
            console.log('[CRON-ENFORCE] Stale dealer_selection game, cleaning up:', game.id);
            
            const totalHands = game.total_hands || 0;
            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', game.id);
            
            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
            
            // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
            if (game.real_money === true) {
              console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  config_deadline: null,
                  config_complete: false,
                })
                .eq('id', game.id);
              actionsTaken.push('Stale dealer_selection: Real money game archived (never deleted)');
            } else if (!hasHistory) {
              // Delete empty session
              const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
              const roundIds = (roundRows ?? []).map((r: any) => r.id);
              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
              }
              await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
              await supabase.from('chat_messages').delete().eq('game_id', game.id);
              await supabase.from('rounds').delete().eq('game_id', game.id);
              await supabase.from('players').delete().eq('game_id', game.id);
              await supabase.from('games').delete().eq('id', game.id);
              
              actionsTaken.push('Stale dealer_selection: No history, deleted empty session');
            } else {
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  config_deadline: null,
                  ante_decision_deadline: null,
                  config_complete: false,
                })
                .eq('id', game.id);
              
              actionsTaken.push('Stale dealer_selection: Has history, session ended');
            }
            
            results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') || 'no_action' });
            continue;
          }
        }

        // ============= STALE WAITING GAME CLEANUP =============
        if (game.status === 'waiting' && msSinceUpdate > STALE_THRESHOLD_MS) {
          console.log('[CRON-ENFORCE] Stale waiting game (>2h), cleaning up:', game.id);
          
          const totalHands = game.total_hands || 0;
          const { count: resultsCount } = await supabase
            .from('game_results')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', game.id);
          
          const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
          
          // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
          if (game.real_money === true) {
            console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                pending_session_end: false,
                session_ended_at: nowIso,
                game_over_at: nowIso,
                config_deadline: null,
                config_complete: false,
              })
              .eq('id', game.id);
            actionsTaken.push('Stale waiting (>2h): Real money game archived (never deleted)');
          } else if (!hasHistory) {
            const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
            const roundIds = (roundRows ?? []).map((r: any) => r.id);
            if (roundIds.length > 0) {
              await supabase.from('player_cards').delete().in('round_id', roundIds);
            }
            await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
            await supabase.from('chat_messages').delete().eq('game_id', game.id);
            await supabase.from('rounds').delete().eq('game_id', game.id);
            await supabase.from('players').delete().eq('game_id', game.id);
            await supabase.from('games').delete().eq('id', game.id);
            
            actionsTaken.push('Stale waiting (>2h): No history, deleted');
          } else {
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                pending_session_end: false,
                session_ended_at: nowIso,
                game_over_at: nowIso,
                config_deadline: null,
                ante_decision_deadline: null,
                config_complete: false,
              })
              .eq('id', game.id);
            
            actionsTaken.push('Stale waiting (>2h): Has history, session ended');
          }
          
          results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') || 'no_action' });
          continue;
        }

        // ============= HORSES/SCC COMPLETED ROUND PROCESSING =============
        // CRITICAL: Only process dice game winners if NO active human players are present.
        // When human players are connected, the CLIENT handles winner evaluation and pot awards.
        // This cron logic is a FALLBACK for abandoned games (all bots or all humans disconnected).
        if ((game.game_type === 'horses' || game.game_type === 'ship-captain-crew') && 
            (game.status === 'in_progress' || game.status === 'betting')) {
          
          // Check for active human players FIRST
          const { data: activeHumans } = await supabase
            .from('players')
            .select('id')
            .eq('game_id', game.id)
            .eq('is_bot', false)
            .eq('sitting_out', false)
            .eq('status', 'active');
          
          const hasActiveHumans = (activeHumans?.length || 0) > 0;
          
          if (hasActiveHumans) {
            // Human player is active - let the client handle winner evaluation
            console.log('[CRON-ENFORCE] 🎲 Dice game has active human players, skipping server-side processing', {
              gameId: game.id,
              activeHumanCount: activeHumans?.length,
            });
          } else {
            // NO active humans - this is an abandoned game, cron should take over
            console.log('[CRON-ENFORCE] 🎲 Dice game has NO active humans, cron taking over', {
              gameId: game.id,
            });
            
            // Find the latest round for this game
            const { data: latestRound } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', game.id)
              .order('round_number', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (latestRound) {
              const horsesState = latestRound.horses_state as any;
              
              // Check if round is complete but game hasn't processed winner yet
              if ((latestRound.status === 'completed' || horsesState?.gamePhase === 'complete') &&
                  !game.awaiting_next_round) {
                
                // Safety guard: all active players must have completed
                const { data: activePlayersForCompletion } = await supabase
                  .from('players')
                  .select('id, sitting_out, status')
                  .eq('game_id', game.id)
                  .eq('status', 'active')
                  .eq('sitting_out', false);

                const activeIds = (activePlayersForCompletion || []).map((p: any) => p.id);
                const completedCount = activeIds.filter((pid: string) => {
                  const st = (horsesState?.playerStates || {})?.[pid];
                  return !!(st?.isComplete && st?.result);
                }).length;

                if (activeIds.length > 0 && completedCount < activeIds.length) {
                  console.log('[CRON-ENFORCE] 🎲 DICE GUARD: Not all players complete, skipping', {
                    gameId: game.id,
                    activeCount: activeIds.length,
                    completedCount,
                  });
                } else {
                  // All players complete, evaluate winner
                  console.log('[CRON-ENFORCE] 🎲 DICE ABANDONED: Processing winner for abandoned game', {
                    gameId: game.id,
                  });
                  
                  const playerStates = horsesState?.playerStates || {};
                  const turnOrder = (horsesState?.turnOrder || []) as string[];
                  const roundPot = latestRound.pot || game.pot || 0;
                  
                  // Determine winner based on hand results
                  let bestPlayer: { playerId: string; result: any } | null = null;
                  let isTie = false;
                  const tieBreakPlayers: { playerId: string; result: any }[] = [];
                  
                  for (const playerId of turnOrder) {
                    const state = playerStates[playerId];
                    if (!state?.isComplete || !state?.result) continue;
                    
                    const result = state.result;
                    
                    if (!bestPlayer) {
                      bestPlayer = { playerId, result };
                      tieBreakPlayers.push({ playerId, result });
                    } else {
                      if (result.rank > bestPlayer.result.rank) {
                        bestPlayer = { playerId, result };
                        tieBreakPlayers.length = 0;
                        tieBreakPlayers.push({ playerId, result });
                        isTie = false;
                      } else if (result.rank === bestPlayer.result.rank) {
                        if (result.highValue > bestPlayer.result.highValue) {
                          bestPlayer = { playerId, result };
                          tieBreakPlayers.length = 0;
                          tieBreakPlayers.push({ playerId, result });
                          isTie = false;
                        } else if (result.highValue === bestPlayer.result.highValue) {
                          tieBreakPlayers.push({ playerId, result });
                          isTie = tieBreakPlayers.length > 1;
                        }
                      }
                    }
                  }
                  
                  // Get player profiles for username lookup
                  const { data: allPlayers } = await supabase
                    .from('players')
                    .select('id, user_id, chips, legs, is_bot, profiles(username)')
                    .eq('game_id', game.id);
                  
                  const playerMap = new Map((allPlayers || []).map((p: any) => [p.id, p]));
                  
                  if (isTie && tieBreakPlayers.length > 1) {
                    // TIE - rollover
                    const winners = tieBreakPlayers.filter(p => 
                      p.result.rank === bestPlayer!.result.rank && 
                      p.result.highValue === bestPlayer!.result.highValue
                    );
                    
                    const winnerNames: string[] = [];
                    for (const winner of winners) {
                      const player = playerMap.get(winner.playerId);
                      if (player) {
                        winnerNames.push((player.profiles as any)?.username || 'Player');
                      }
                    }
                    
                    await supabase.from('game_results').insert({
                      game_id: game.id,
                      hand_number: latestRound.hand_number || (game.total_hands || 0) + 1,
                      winner_player_id: null,
                      winner_username: winnerNames.join(' & '),
                      pot_won: 0,
                      winning_hand_description: `TIE: ${bestPlayer!.result.description} - Rollover`,
                      is_chopped: true,
                      player_chip_changes: {},
                      game_type: game.game_type,
                      dealer_game_id: game.current_game_uuid || null,
                    });
                    
                    await supabase
                      .from('games')
                      .update({
                        last_round_result: "One tie all tie - rollover",
                        awaiting_next_round: true,
                        total_hands: (game.total_hands || 0) + 1,
                        status: 'in_progress',
                      })
                      .eq('id', game.id);
                    
                    await supabase.from('rounds').update({ status: 'completed' }).eq('id', latestRound.id);
                    
                    actionsTaken.push(`Abandoned dice game: Tie, rollover`);
                  } else if (bestPlayer) {
                    // Single winner
                    const winnerPlayer = playerMap.get(bestPlayer.playerId);
                    const winnerUsername = (winnerPlayer?.profiles as any)?.username || 'Player';
                    
                    if (winnerPlayer) {
                      await supabase.rpc('increment_player_chips', {
                        p_player_id: bestPlayer.playerId,
                        p_amount: roundPot
                      });
                    }
                    
                    const playerChipChanges: Record<string, number> = {
                      [bestPlayer.playerId]: roundPot
                    };
                    
                    await supabase.from('game_results').insert({
                      game_id: game.id,
                      hand_number: latestRound.hand_number || (game.total_hands || 0) + 1,
                      winner_player_id: bestPlayer.playerId,
                      winner_username: winnerUsername,
                      pot_won: roundPot,
                      winning_hand_description: bestPlayer.result.description,
                      is_chopped: false,
                      player_chip_changes: playerChipChanges,
                      game_type: game.game_type,
                      dealer_game_id: game.current_game_uuid || null,
                    });
                    
                    await supabase
                      .from('games')
                      .update({
                        pot: 0,
                        last_round_result: `${winnerUsername} wins with ${bestPlayer.result.description}!`,
                        awaiting_next_round: true,
                        total_hands: (game.total_hands || 0) + 1,
                        status: 'in_progress',
                      })
                      .eq('id', game.id);
                    
                    await supabase.from('rounds').update({ status: 'completed' }).eq('id', latestRound.id);
                    
                    actionsTaken.push(`Abandoned dice game: ${winnerUsername} wins, pot ${roundPot}`);
                  } else {
                    // No valid results - force transition
                    await supabase
                      .from('games')
                      .update({
                        awaiting_next_round: true,
                        status: 'in_progress',
                      })
                      .eq('id', game.id);
                    
                    await supabase.from('rounds').update({ status: 'completed' }).eq('id', latestRound.id);
                    
                    actionsTaken.push('Abandoned dice game: No results, forced transition');
                  }
                }
              }
            }
          }
        }

        // ============= STALE IN_PROGRESS CLEANUP =============
        if (game.status === 'in_progress') {
          // CRITICAL: ALL round lookups MUST be scoped by dealer_game_id to prevent cross-game contamination.
          // round_number cycles (1,2,3) in 3-5-7 and round_number=1 repeats for each Holm hand.
          let currentRound: any = null;
          const dealerGameId = (game as any).current_game_uuid;
          
          if (game.game_type === '3-5-7' && game.total_hands && game.current_round && dealerGameId) {
            // 3-5-7: Use triple-key scoping (dealer_game_id, hand_number, round_number)
            const { data } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', game.id)
              .eq('dealer_game_id', dealerGameId)
              .eq('hand_number', game.total_hands)
              .eq('round_number', game.current_round)
              .maybeSingle();
            currentRound = data;
          } else if (dealerGameId) {
            // All other games: scope to dealer_game_id and order by hand_number/round_number
            const { data } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', game.id)
              .eq('dealer_game_id', dealerGameId)
              .order('hand_number', { ascending: false, nullsFirst: false })
              .order('round_number', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            currentRound = data;
          }
          // If no dealer_game_id, skip - cannot safely identify round
          
          const hasDecisionDeadline = !!currentRound?.decision_deadline;
          const deadlineTime = hasDecisionDeadline ? new Date(currentRound.decision_deadline).getTime() : 0;
          const msSinceDeadline = hasDecisionDeadline ? now.getTime() - deadlineTime : 0;
          
          // Clean up if: no deadline and stale for 2h, OR deadline expired 30+ minutes ago
          const isStaleWithoutDeadline = !hasDecisionDeadline && msSinceUpdate > STALE_THRESHOLD_MS;
          const isStaleWithExpiredDeadline = hasDecisionDeadline && msSinceDeadline > (30 * 60 * 1000); // 30 min past deadline
          
          if (isStaleWithoutDeadline || isStaleWithExpiredDeadline) {
            const reason = isStaleWithoutDeadline 
              ? 'Stale in_progress (>2h, no deadline)' 
              : 'Stale in_progress (deadline expired >30 min ago)';
            console.log(`[CRON-ENFORCE] ${reason}, ending:`, game.id);
            
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                pending_session_end: false,
                session_ended_at: nowIso,
                game_over_at: nowIso,
                awaiting_next_round: false,
                config_deadline: null,
                ante_decision_deadline: null,
                config_complete: false,
              })
              .eq('id', game.id);
            
            actionsTaken.push(`${reason}: session ended`);
            results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
            continue;
          }
        }

        // ============= AWAITING_NEXT_ROUND WATCHDOG =============
        if (game.awaiting_next_round === true && (game.status === 'in_progress' || game.status === 'betting')) {
          const stuckDuration = msSinceUpdate;
          
          // If stuck for more than 30 minutes, clean up the game
          const STUCK_GAME_CLEANUP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
          if (stuckDuration > STUCK_GAME_CLEANUP_THRESHOLD_MS) {
            console.log('[CRON-ENFORCE] Game stuck in awaiting_next_round for >30 min, cleaning up:', game.id);
            
            const totalHands = game.total_hands || 0;
            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', game.id);
            
            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
            
            if (hasHistory) {
              // End session if there's history
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  awaiting_next_round: false,
                  config_deadline: null,
                  ante_decision_deadline: null,
                  config_complete: false,
                })
                .eq('id', game.id);
              
              actionsTaken.push('Stuck awaiting_next_round (>30 min): Has history, session ended');
            } else if (game.real_money === true) {
              // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
              console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  awaiting_next_round: false,
                  config_deadline: null,
                  ante_decision_deadline: null,
                })
                .eq('id', game.id);
              actionsTaken.push('Stuck awaiting_next_round (>30 min): Real money game archived (never deleted)');
            } else {
              // Delete if no history
              const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
              const roundIds = (roundRows ?? []).map((r: any) => r.id);
              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
                await supabase.from('player_actions').delete().in('round_id', roundIds);
              }
              await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
              await supabase.from('chat_messages').delete().eq('game_id', game.id);
              await supabase.from('rounds').delete().eq('game_id', game.id);
              await supabase.from('players').delete().eq('game_id', game.id);
              await supabase.from('games').delete().eq('id', game.id);
              
              actionsTaken.push('Stuck awaiting_next_round (>30 min): No history, deleted');
            }
            
            results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') || 'no_action' });
            continue;
          }
          
          if (stuckDuration > AWAITING_NEXT_ROUND_THRESHOLD_MS) {
            console.log('[CRON-ENFORCE] awaiting_next_round watchdog triggered for game:', game.id, 'type:', game.game_type);
            
            // ============= HOLM GAME ROUND TRANSITION =============
            if (game.game_type === 'holm-game') {
              const { data: activePlayers } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', game.id)
                .eq('status', 'active')
                .eq('sitting_out', false);
              
              if (activePlayers && activePlayers.length >= 2) {
                const { data: gameDefaults } = await supabase
                  .from('game_defaults')
                  .select('decision_timer_seconds')
                  .eq('game_type', 'holm')
                  .maybeSingle();
                
                const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 30;
                const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                
                // Create new Holm hand.
                // CRITICAL HOLM INVARIANT: round_number MUST always be 1; hand_number increments per hand.
                const dealerGameIdHolm = (game as any).current_game_uuid;

                if (!dealerGameIdHolm) {
                  actionsTaken.push('Watchdog: Missing dealer_game_id for Holm; cannot start new hand');
                  results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') });
                  continue;
                }

                const { data: latestRoundRow } = await supabase
                  .from('rounds')
                  .select('hand_number')
                  .eq('game_id', game.id)
                  .eq('dealer_game_id', dealerGameIdHolm)
                  .order('hand_number', { ascending: false, nullsFirst: false })
                  .limit(1)
                  .maybeSingle();

                const newHandNumber = (latestRoundRow?.hand_number ?? (game.total_hands || 0)) + 1;
                const newRoundNumber = 1;
                
                // CRITICAL: Scope existing round check to dealer_game_id to prevent cross-game contamination
                let existingRound: any = null;
                if (dealerGameIdHolm) {
                  const { data } = await supabase
                    .from('rounds')
                    .select('id')
                    .eq('game_id', game.id)
                    .eq('dealer_game_id', dealerGameIdHolm)
                    .eq('hand_number', newHandNumber)
                    .eq('round_number', newRoundNumber)
                    .maybeSingle();
                  existingRound = data;
                }
                
                if (existingRound?.id) {
                  await supabase.from('player_cards').delete().eq('round_id', existingRound.id);
                  await supabase.from('player_actions').delete().eq('round_id', existingRound.id);
                  await supabase.from('rounds').delete().eq('id', existingRound.id);
                }
                
                // Deal cards
                const deck = shuffleDeck(createDeck());
                let deckIndex = 0;
                
                // Deal 4 community cards (face down initially)
                const communityCards = deck.slice(deckIndex, deckIndex + 4);
                deckIndex += 4;
                
                // Deal player cards (4 each)
                const playerCardInserts: any[] = [];
                
                // Insert round first
                // Start turn at buck_position if valid; otherwise fall back to lowest active seat.
                const sortedActiveByPos = [...activePlayers].sort((a: any, b: any) => a.position - b.position);
                const buckPos = typeof (game as any).buck_position === 'number' ? (game as any).buck_position : null;
                const startingTurnPos = buckPos && sortedActiveByPos.some((p: any) => p.position === buckPos)
                  ? buckPos
                  : (sortedActiveByPos[0]?.position ?? 1);

                const { data: newRound, error: roundError } = await supabase
                  .from('rounds')
                  .insert({
                    game_id: game.id,
                    dealer_game_id: dealerGameIdHolm, // CRITICAL: Always set dealer_game_id
                    round_number: newRoundNumber,
                    hand_number: newHandNumber,
                    cards_dealt: 4,
                    pot: game.pot || 0,
                    status: 'betting',
                    decision_deadline: decisionDeadline,
                    community_cards: communityCards,
                    community_cards_revealed: 0,
                    current_turn_position: startingTurnPos,
                  })
                  .select()
                  .single();
                
                if (!roundError && newRound) {
                  // Deal cards to each player
                  for (const player of activePlayers) {
                    const playerCards = deck.slice(deckIndex, deckIndex + 4);
                    deckIndex += 4;
                    
                    playerCardInserts.push({
                      round_id: newRound.id,
                      player_id: player.id,
                      cards: playerCards,
                    });
                  }
                  
                  await supabase.from('player_cards').insert(playerCardInserts);
                  
                  // Update game
                   await supabase
                     .from('games')
                     .update({
                       // Keep Holm round counter stable; hand progression is tracked via rounds.hand_number.
                       current_round: 1,
                       total_hands: newHandNumber,
                       awaiting_next_round: false,
                       all_decisions_in: false,
                     })
                     .eq('id', game.id);
                  
                  // Reset player decisions
                   await supabase
                     .from('players')
                     .update({ current_decision: null, decision_locked: false })
                     .eq('game_id', game.id)
                     .eq('status', 'active')
                     .eq('sitting_out', false);
                  
                   actionsTaken.push(`Watchdog: Started Holm hand ${newHandNumber} with ${activePlayers.length} players`);
                }
              } else {
                // Not enough players - end session
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    awaiting_next_round: false,
                  })
                  .eq('id', game.id);
                actionsTaken.push('Watchdog: Holm <2 players, session ended');
              }
            }
            
            // ============= 3-5-7 GAME ROUND TRANSITION =============
            else if (game.game_type === '3-5-7') {
              const nextRoundNum = game.next_round_number;
              
              if (nextRoundNum && nextRoundNum >= 1 && nextRoundNum <= 3) {
                // Get active players
                const { data: players } = await supabase
                  .from('players')
                  .select('*')
                  .eq('game_id', game.id)
                  .eq('status', 'active')
                  .eq('sitting_out', false)
                  .order('position');
                
                if (players && players.length >= 2) {
                  const { data: gameDefaults } = await supabase
                    .from('game_defaults')
                    .select('decision_timer_seconds')
                    .eq('game_type', '3-5-7')
                    .maybeSingle();
                  
                  const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 10;
                  const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
                  
                  // Cards to deal based on round (3, 5, or 7)
                  const cardsToDeal = nextRoundNum === 1 ? 3 : nextRoundNum === 2 ? 5 : 7;
                  
                  // CRITICAL: For 3-5-7, round numbers cycle 1/2/3 per hand.
                  // Use the round_number from next_round_number (which is 1, 2, or 3).
                  // The unique constraint is (game_id, hand_number, round_number).
                  const newRoundNumber = nextRoundNum; // 1, 2, or 3 based on game state
                  const newHandNumber = nextRoundNum === 1 
                    ? (game.total_hands || 0) + 1  // New hand starts with round 1
                    : (game.total_hands || 1);      // Rounds 2/3 continue same hand
                  
                  // Deal cards
                  const deck = shuffleDeck(createDeck());
                  let deckIndex = 0;
                  
                  // Create round - use the correctly calculated hand number
                  const { data: newRound, error: roundError } = await supabase
                    .from('rounds')
                    .insert({
                      game_id: game.id,
                      round_number: newRoundNumber,
                      hand_number: newHandNumber,
                      cards_dealt: cardsToDeal,
                      pot: game.pot || 0,
                      status: 'betting',
                      decision_deadline: decisionDeadline,
                      current_turn_position: players[0].position,
                      dealer_game_id: game.current_game_uuid || null,
                    })
                    .select()
                    .single();
                  
                  if (!roundError && newRound) {
                    // Deal cards to each player
                    const playerCardInserts: any[] = [];
                    for (const player of players) {
                      const playerCards = deck.slice(deckIndex, deckIndex + cardsToDeal);
                      deckIndex += cardsToDeal;
                      
                      playerCardInserts.push({
                        round_id: newRound.id,
                        player_id: player.id,
                        cards: playerCards,
                      });
                    }
                    
                    await supabase.from('player_cards').insert(playerCardInserts);
                    
                    // Update game - CRITICAL: update total_hands when starting round 1 of new hand
                    const gameUpdateFields: Record<string, any> = {
                      current_round: newRoundNumber,
                      awaiting_next_round: false,
                      next_round_number: null,
                      last_round_result: null,
                      all_decisions_in: false,
                      status: 'in_progress',
                    };
                    if (newRoundNumber === 1) {
                      gameUpdateFields.total_hands = newHandNumber;
                    }
                    await supabase
                      .from('games')
                      .update(gameUpdateFields)
                      .eq('id', game.id);
                    
                    // Reset player decisions
                    await supabase
                      .from('players')
                      .update({ current_decision: null, decision_locked: false, status: 'active' })
                      .eq('game_id', game.id);
                    
                    actionsTaken.push(`Watchdog: Started 3-5-7 round ${nextRoundNum} (${cardsToDeal} cards) with ${players.length} players`);
                  }
                } else {
                  // Not enough players
                  await supabase
                    .from('games')
                    .update({
                      status: 'session_ended',
                      session_ended_at: nowIso,
                      game_over_at: nowIso,
                      awaiting_next_round: false,
                    })
                    .eq('id', game.id);
                  actionsTaken.push('Watchdog: 3-5-7 <2 players, session ended');
                }
              } else {
                // No next round configured or game complete - clear flag
                await supabase
                  .from('games')
                  .update({ awaiting_next_round: false, last_round_result: null })
                  .eq('id', game.id);
                actionsTaken.push('Watchdog: 3-5-7 no next round, cleared flag');
              }
            }
            
            // ============= HORSES DICE GAME ROUND TRANSITION =============
            else if (game.game_type === 'horses') {
              const { data: players } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', game.id)
                .eq('status', 'active')
                .eq('sitting_out', false)
                .order('position');
              
              if (players && players.length >= 2) {
                const anteAmount = game.ante_amount || 1;
                
                // Get next round number
                const { data: latestRound } = await supabase
                  .from('rounds')
                  .select('round_number')
                  .eq('game_id', game.id)
                  .order('round_number', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
                const newRoundNumber = (latestRound?.round_number || 0) + 1;
                const newHandNumber = (game.total_hands || 0) + 1;
                
                // Check Make It Take It setting - if enabled, dealer goes first
                const { data: makeItTakeItSetting } = await supabase
                  .from('system_settings')
                  .select('value')
                  .eq('key', 'make_it_take_it')
                  .maybeSingle();
                const makeItTakeIt = (makeItTakeItSetting?.value as { enabled?: boolean })?.enabled ?? false;
                const turnOffset = makeItTakeIt ? 0 : 1;
                console.log(`[CRON] Make It Take It: ${makeItTakeIt}, Turn offset: ${turnOffset}`);
                
                // Build turn order (clockwise from dealer, or starting with dealer if Make It Take It)
                const sortedPlayers = [...players].sort((a: any, b: any) => a.position - b.position);
                const dealerPos = game.dealer_position;
                const dealerIdx = dealerPos ? sortedPlayers.findIndex((p: any) => p.position === dealerPos) : -1;
                const turnOrder = dealerIdx >= 0
                  ? Array.from({ length: sortedPlayers.length }, (_, i) => sortedPlayers[(dealerIdx + i + turnOffset) % sortedPlayers.length].id)
                  : sortedPlayers.map((p: any) => p.id);
                
                const firstPlayer = sortedPlayers.find((p: any) => p.id === turnOrder[0]);
                const controllerUserId = turnOrder
                  .map((id: string) => sortedPlayers.find((p: any) => p.id === id))
                  .find((p: any) => p && !p.is_bot)?.user_id ?? null;
                
                const initialDice = [
                  { value: 0, isHeld: false },
                  { value: 0, isHeld: false },
                  { value: 0, isHeld: false },
                  { value: 0, isHeld: false },
                  { value: 0, isHeld: false },
                ];
                
                const horsesState = {
                  currentTurnPlayerId: turnOrder[0] ?? null,
                  playerStates: Object.fromEntries(
                    turnOrder.map((pid: string) => [
                      pid,
                      { dice: initialDice, rollsRemaining: 3, isComplete: false },
                    ]),
                  ),
                  gamePhase: 'playing',
                  turnOrder,
                  botControllerUserId: controllerUserId,
                  turnDeadline: firstPlayer?.is_bot ? null : new Date(Date.now() + 30_000).toISOString(),
                };
                
                // Collect antes
                const potForRound = (game.pot || 0) + (anteAmount * players.length);
                await supabase.rpc('decrement_player_chips', {
                  player_ids: players.map((p: any) => p.id),
                  amount: anteAmount,
                });
                
                // Create round
                const { error: roundError } = await supabase
                  .from('rounds')
                  .insert({
                    game_id: game.id,
                    round_number: newRoundNumber,
                    hand_number: newHandNumber,
                    cards_dealt: 2, // Constraint requires >= 2
                    status: 'betting',
                    pot: potForRound,
                    horses_state: horsesState,
                  });
                
                if (!roundError) {
                  // Update game
                  await supabase
                    .from('games')
                    .update({
                      current_round: newRoundNumber,
                      total_hands: newHandNumber,
                      pot: potForRound,
                      awaiting_next_round: false,
                      last_round_result: null,
                      status: 'in_progress',
                    })
                    .eq('id', game.id);
                  
                  actionsTaken.push(`Watchdog: Started Horses round ${newRoundNumber} with ${players.length} players`);
                }
              } else {
                // Not enough players
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    awaiting_next_round: false,
                  })
                  .eq('id', game.id);
                actionsTaken.push('Watchdog: Horses <2 players, session ended');
              }
            }
            
            // ============= SHIP-CAPTAIN-CREW DICE GAME ROUND TRANSITION =============
            else if (game.game_type === 'ship-captain-crew') {
              const { data: players } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', game.id)
                .eq('status', 'active')
                .eq('sitting_out', false)
                .order('position');
              
              if (players && players.length >= 2) {
                const anteAmount = game.ante_amount || 1;
                
                // Get next round number
                const { data: latestRound } = await supabase
                  .from('rounds')
                  .select('round_number')
                  .eq('game_id', game.id)
                  .order('round_number', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
                const newRoundNumber = (latestRound?.round_number || 0) + 1;
                const newHandNumber = (game.total_hands || 0) + 1;
                
                // Check Make It Take It setting - if enabled, dealer goes first
                const { data: makeItTakeItSetting } = await supabase
                  .from('system_settings')
                  .select('value')
                  .eq('key', 'make_it_take_it')
                  .maybeSingle();
                const makeItTakeIt = (makeItTakeItSetting?.value as { enabled?: boolean })?.enabled ?? false;
                const turnOffset = makeItTakeIt ? 0 : 1;
                console.log(`[CRON] SCC Make It Take It: ${makeItTakeIt}, Turn offset: ${turnOffset}`);
                
                // Build turn order (clockwise from dealer, or starting with dealer if Make It Take It)
                const sortedPlayers = [...players].sort((a: any, b: any) => a.position - b.position);
                const dealerPos = game.dealer_position;
                const dealerIdx = dealerPos ? sortedPlayers.findIndex((p: any) => p.position === dealerPos) : -1;
                const turnOrder = dealerIdx >= 0
                  ? Array.from({ length: sortedPlayers.length }, (_, i) => sortedPlayers[(dealerIdx + i + turnOffset) % sortedPlayers.length].id)
                  : sortedPlayers.map((p: any) => p.id);
                
                const firstPlayer = sortedPlayers.find((p: any) => p.id === turnOrder[0]);
                const controllerUserId = turnOrder
                  .map((id: string) => sortedPlayers.find((p: any) => p.id === id))
                  .find((p: any) => p && !p.is_bot)?.user_id ?? null;
                
                // SCC uses isSCC flag on dice
                const initialDice = [
                  { value: 0, isHeld: false, isSCC: false },
                  { value: 0, isHeld: false, isSCC: false },
                  { value: 0, isHeld: false, isSCC: false },
                  { value: 0, isHeld: false, isSCC: false },
                  { value: 0, isHeld: false, isSCC: false },
                ];
                
                const sccState = {
                  currentTurnPlayerId: turnOrder[0] ?? null,
                  playerStates: Object.fromEntries(
                    turnOrder.map((pid: string) => [
                      pid,
                      { dice: initialDice, rollsRemaining: 3, isComplete: false },
                    ]),
                  ),
                  gamePhase: 'playing',
                  turnOrder,
                  botControllerUserId: controllerUserId,
                  turnDeadline: firstPlayer?.is_bot ? null : new Date(Date.now() + 30_000).toISOString(),
                };
                
                // Collect antes
                const potForRound = (game.pot || 0) + (anteAmount * players.length);
                await supabase.rpc('decrement_player_chips', {
                  player_ids: players.map((p: any) => p.id),
                  amount: anteAmount,
                });
                
                // Create round
                const { error: roundError } = await supabase
                  .from('rounds')
                  .insert({
                    game_id: game.id,
                    round_number: newRoundNumber,
                    hand_number: newHandNumber,
                    cards_dealt: 2, // Constraint requires >= 2
                    status: 'betting',
                    pot: potForRound,
                    horses_state: sccState, // SCC reuses horses_state column
                  });
                
                if (!roundError) {
                  // Update game
                  await supabase
                    .from('games')
                    .update({
                      current_round: newRoundNumber,
                      total_hands: newHandNumber,
                      pot: potForRound,
                      awaiting_next_round: false,
                      last_round_result: null,
                      status: 'in_progress',
                    })
                    .eq('id', game.id);
                  
                  actionsTaken.push(`Watchdog: Started SCC round ${newRoundNumber} with ${players.length} players`);
                }
              } else {
                // Not enough players
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    session_ended_at: nowIso,
                    game_over_at: nowIso,
                    awaiting_next_round: false,
                  })
                  .eq('id', game.id);
                actionsTaken.push('Watchdog: SCC <2 players, session ended');
              }
            }
            
            // ============= UNKNOWN GAME TYPE - JUST CLEAR FLAG =============
            else {
              console.log('[CRON-ENFORCE] Unknown game type, clearing awaiting_next_round:', game.game_type);
              await supabase
                .from('games')
                .update({ awaiting_next_round: false })
                .eq('id', game.id);
              actionsTaken.push(`Watchdog: Unknown game type ${game.game_type}, cleared flag`);
            }
          }
        }

        // ============= ALL DECISIONS IN - SHOWDOWN (HOLM GAMES ONLY) =============
        // CRITICAL: Only process Holm showdowns here - 357/horses/scc handle their own showdowns
        // IMPORTANT: Only process if the round is stale (decision_deadline passed + grace period)
        // This prevents the cron from racing ahead of client animations
        if ((game.status === 'in_progress' || game.status === 'betting') && game.all_decisions_in === true && game.game_type === 'holm-game') {
          
          // CRITICAL: Scope to dealer_game_id and order by hand_number to get the active Holm round
          const dealerGameIdShowdown = (game as any).current_game_uuid;
          let currentRound: any = null;
          
          if (dealerGameIdShowdown) {
            const { data } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', game.id)
              .eq('dealer_game_id', dealerGameIdShowdown)
              .order('hand_number', { ascending: false })
              .order('round_number', { ascending: false })
              .limit(1)
              .maybeSingle();
            currentRound = data;
          }
          
          // GRACE PERIOD CHECK: Only process if either:
          // 1. No decision_deadline exists (already processed/cleared)
          // 2. Decision deadline has passed AND it's been at least 15 seconds stale
          // 3. The round is already in 'showdown' status (client started but didn't finish)
          const HOLM_SHOWDOWN_GRACE_MS = 15000; // 15 seconds grace for client animations
          let roundIsStale = false;
          
          if (currentRound) {
            if (!currentRound.decision_deadline) {
              // Deadline was cleared - safe to process
              roundIsStale = true;
            } else if (currentRound.status === 'showdown' || currentRound.status === 'processing') {
              // Already in showdown/processing - definitely stale
              roundIsStale = true;
            } else {
              const deadlineAt = new Date(currentRound.decision_deadline);
              const timeSinceDeadline = now.getTime() - deadlineAt.getTime();
              if (timeSinceDeadline > HOLM_SHOWDOWN_GRACE_MS) {
                roundIsStale = true;
              }
            }
          }
          
          if (!roundIsStale) {
            console.log('[CRON-ENFORCE] HOLM showdown: Skipping - within grace period, client is animating');
            results.push({ gameId: game.id, status: game.status, result: 'no_action_needed' });
            continue;
          }
          
          console.log('[CRON-ENFORCE] Processing HOLM showdown for game:', game.id);
          
          // Handle 'betting' status rounds (normal showdown)
          // Also handle 'completed' status if client crashed mid-showdown
          if (currentRound && (currentRound.status === 'betting' || currentRound.status === 'showdown' || currentRound.status === 'processing' || currentRound.status === 'completed')) {
            
            // STUCK GAME RECOVERY: If round is 'completed' but game still has all_decisions_in=true and awaiting_next_round=false,
            // the client crashed mid-showdown. Force advance to next round.
            if (currentRound.status === 'completed' && !game.awaiting_next_round) {
              console.log('[CRON-ENFORCE] STUCK RECOVERY: Round completed but game not advancing. Forcing awaiting_next_round=true for game:', game.id);
              await supabase
                .from('games')
                .update({ 
                  awaiting_next_round: true, 
                  all_decisions_in: false,
                  last_round_result: game.last_round_result || 'Showdown completed - advancing'
                })
                .eq('id', game.id);
              
              actionsTaken.push('STUCK RECOVERY: Forced awaiting_next_round after stale completed round');
              results.push({ gameId: game.id, status: game.status, result: actionsTaken.join('; ') || 'recovered' });
              continue;
            }
          
            // CRITICAL: Process both 'betting' AND 'processing' status rounds.
            // 'processing' status means a client claimed the round but crashed before completing showdown.
            if (currentRound.status === 'betting' || currentRound.status === 'processing') {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', game.id);
            
            const stayedPlayers = players?.filter((p: any) => 
              p.status === 'active' && 
              !p.sitting_out && 
              p.ante_decision === 'ante_up' && 
              p.current_decision === 'stay'
            ) || [];
            
            const foldedPlayers = players?.filter((p: any) => 
              p.status === 'active' && 
              !p.sitting_out && 
              p.ante_decision === 'ante_up' && 
              p.current_decision === 'fold'
            ) || [];
            
             console.log('[CRON-ENFORCE] Showdown: stayers=', stayedPlayers.length, 'folders=', foldedPlayers.length);

             // CRITICAL (Holm): NEVER advance hand_number based on games.total_hands.
             // games.total_hands can be stale and must not drift ahead of rounds.
             // Use the authoritative round.hand_number.
             const holmHandNumber = (currentRound as any)?.hand_number ?? (game.total_hands || 1);
            
            if (stayedPlayers.length === 0) {
              // Everyone folded - apply pussy tax if enabled
              const pussyTaxEnabled = game.pussy_tax_enabled;
              const pussyTaxValue = game.pussy_tax_value || 0;
              
              let totalTaxCollected = 0;
              const playerChipChanges: Record<string, number> = {};
              
              if (pussyTaxEnabled && pussyTaxValue > 0) {
                for (const player of foldedPlayers) {
                  await supabase.rpc('decrement_player_chips', {
                    player_ids: [player.id],
                    amount: pussyTaxValue
                  });
                  totalTaxCollected += pussyTaxValue;
                  playerChipChanges[player.id] = -pussyTaxValue;
                }
              }
              
              const newPot = (game.pot || 0) + totalTaxCollected;
              
              // Record result
               await supabase.from('game_results').insert({
                 game_id: game.id,
                 hand_number: holmHandNumber,
                winner_player_id: null,
                winner_username: null,
                pot_won: 0,
                winning_hand_description: pussyTaxEnabled ? `Everyone folded! Pussy Tax: $${totalTaxCollected}` : 'Everyone folded!',
                is_chopped: false,
                player_chip_changes: playerChipChanges,
                game_type: game.game_type,
                dealer_game_id: game.current_game_uuid || null,
              });
              
              await supabase
                .from('games')
                .update({
                  pot: newPot,
                  last_round_result: totalTaxCollected > 0 ? 'Pussy Tax' : 'Everyone folded!',
                  awaiting_next_round: true,
                  all_decisions_in: false,
                   // CRITICAL (Holm): Keep total_hands aligned to the active round's hand_number.
                   // Never increment here; no new round was inserted.
                   total_hands: holmHandNumber,
                })
                .eq('id', game.id);
              
              await supabase
                .from('rounds')
                .update({ status: 'completed' })
                .eq('id', currentRound.id);
              
              actionsTaken.push(`Showdown: Everyone folded, pussy tax collected: ${totalTaxCollected}`);
            } else if (stayedPlayers.length >= 1) {
              // Run showdown
              const communityCards: Card[] = ((currentRound.community_cards as any[]) || []).map((c: any) => ({
                suit: (c.suit || c.Suit) as Card['suit'],
                rank: String(c.rank || c.Rank).toUpperCase()
              }));
              
              const { data: allPlayerCards } = await supabase
                .from('player_cards')
                .select('*')
                .eq('round_id', currentRound.id);
              
              const roundPot = currentRound.pot || game.pot || 0;
              
              if (stayedPlayers.length === 1) {
                // Single stayer vs Chucky
                const player = stayedPlayers[0];
                const playerCardsRow = allPlayerCards?.find((pc: any) => pc.player_id === player.id);
                const playerCards: Card[] = ((playerCardsRow?.cards as any[]) || []).map((c: any) => ({
                  suit: (c.suit || c.Suit) as Card['suit'],
                  rank: String(c.rank || c.Rank).toUpperCase()
                }));
                
                // Deal Chucky's cards
                const usedCards = new Set<string>();
                communityCards.forEach(c => usedCards.add(`${c.suit}-${c.rank}`));
                (allPlayerCards || []).forEach((pc: any) => {
                  ((pc.cards as any[]) || []).forEach((c: any) => {
                    usedCards.add(`${(c.suit || c.Suit)}-${String(c.rank || c.Rank).toUpperCase()}`);
                  });
                });
                
                const fullDeck = createDeck();
                const availableCards = fullDeck.filter(c => !usedCards.has(`${c.suit}-${c.rank}`));
                const shuffledAvailable = shuffleDeck(availableCards);
                const chuckyCardCount = game.chucky_cards || 4;
                const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);
                
                await supabase
                  .from('rounds')
                  .update({
                    chucky_cards: chuckyCards as any,
                    chucky_active: true,
                    chucky_cards_revealed: chuckyCardCount,
                    community_cards_revealed: 4,
                  })
                  .eq('id', currentRound.id);
                
                const playerAllCards = [...playerCards, ...communityCards];
                const chuckyAllCards = [...chuckyCards, ...communityCards];
                
                const playerEval = evaluateHolmHand(playerAllCards);
                const chuckyEval = evaluateHolmHand(chuckyAllCards);
                
                const playerWins = playerEval.value > chuckyEval.value;
                
                if (playerWins) {
                  await supabase.rpc('increment_player_chips', {
                    p_player_id: player.id,
                    p_amount: roundPot
                  });
                  
                   await supabase.from('game_results').insert({
                     game_id: game.id,
                     hand_number: holmHandNumber,
                    winner_player_id: player.id,
                    pot_won: roundPot,
                    winning_hand_description: `Beat Chucky with ${playerEval.rank}`,
                    is_chopped: false,
                    player_chip_changes: { [player.id]: roundPot },
                    game_type: game.game_type,
                    dealer_game_id: game.current_game_uuid || null,
                  });
                  
                  await supabase
                    .from('players')
                    .update({ current_decision: null, decision_locked: false, ante_decision: null })
                    .eq('game_id', game.id);
                  
                  await supabase
                    .from('games')
                    .update({
                      status: 'game_over',
                      game_over_at: nowIso,
                      pot: 0,
                      awaiting_next_round: false,
                      all_decisions_in: false,
                       // CRITICAL (Holm): Do not increment total_hands in watchdog; keep aligned to rounds.
                       total_hands: holmHandNumber,
                      last_round_result: `Player beat Chucky!`,
                    })
                    .eq('id', game.id);
                  
                  await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                  
                  actionsTaken.push(`Showdown: Player beat Chucky with ${playerEval.rank}, won ${roundPot}`);
                } else {
                  // Chucky wins
                  const potMatchAmount = game.pot_max_enabled
                    ? Math.min(roundPot, game.pot_max_value)
                    : roundPot;
                  
                  await supabase.rpc('decrement_player_chips', {
                    player_ids: [player.id],
                    amount: potMatchAmount
                  });
                  
                  const newPot = roundPot + potMatchAmount;
                  
                  await supabase
                    .from('games')
                    .update({
                      pot: newPot,
                      last_round_result: `Chucky wins with ${chuckyEval.rank}!`,
                      awaiting_next_round: true,
                      all_decisions_in: false,
                       // CRITICAL (Holm): Do not increment total_hands in watchdog; keep aligned to rounds.
                       total_hands: holmHandNumber,
                    })
                    .eq('id', game.id);
                  
                  await supabase.from('rounds').update({ status: 'completed', chucky_active: false }).eq('id', currentRound.id);
                  
                  actionsTaken.push(`Showdown: Chucky beat player with ${chuckyEval.rank}, pot now ${newPot}`);
                }
              } else {
                // Multiple stayers - full showdown
                const playerHands: { player: any; eval: { rank: string; value: number } }[] = [];
                
                for (const player of stayedPlayers) {
                  const playerCardsRow = allPlayerCards?.find((pc: any) => pc.player_id === player.id);
                  const playerCards: Card[] = ((playerCardsRow?.cards as any[]) || []).map((c: any) => ({
                    suit: (c.suit || c.Suit) as Card['suit'],
                    rank: String(c.rank || c.Rank).toUpperCase()
                  }));
                  
                  const allCards = [...playerCards, ...communityCards];
                  const handEval = evaluateHolmHand(allCards);
                  
                  playerHands.push({ player, eval: handEval });
                }
                
                playerHands.sort((a, b) => b.eval.value - a.eval.value);
                
                const bestValue = playerHands[0].eval.value;
                const winners = playerHands.filter(ph => ph.eval.value === bestValue);
                
                await supabase
                  .from('rounds')
                  .update({ community_cards_revealed: 4, status: 'showdown' })
                  .eq('id', currentRound.id);
                
                if (winners.length === 1) {
                  const winner = winners[0];
                  
                  await supabase.rpc('increment_player_chips', {
                    p_player_id: winner.player.id,
                    p_amount: roundPot
                  });
                  
                   await supabase.from('game_results').insert({
                     game_id: game.id,
                     hand_number: holmHandNumber,
                    winner_player_id: winner.player.id,
                    pot_won: roundPot,
                    winning_hand_description: `${winner.eval.rank}`,
                    is_chopped: false,
                    player_chip_changes: { [winner.player.id]: roundPot },
                    game_type: game.game_type,
                    dealer_game_id: game.current_game_uuid || null,
                  });
                  
                  await supabase
                    .from('players')
                    .update({ current_decision: null, decision_locked: false, ante_decision: null })
                    .eq('game_id', game.id);
                  
                  // Get winner's name for the announcement
                  const winnerName = winner.player.profiles?.username || `Player ${winner.player.position}`;
                  
                  await supabase
                    .from('games')
                    .update({
                      status: 'game_over',
                      game_over_at: nowIso,
                      pot: 0,
                      awaiting_next_round: false,
                      all_decisions_in: false,
                       // CRITICAL (Holm): Do not increment total_hands in watchdog; keep aligned to rounds.
                       total_hands: holmHandNumber,
                      last_round_result: `${winnerName} won with ${winner.eval.rank}|||WINNER:${winner.player.id}|||POT:${roundPot}`,
                    })
                    .eq('id', game.id);
                  
                  await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                  
                  actionsTaken.push(`Showdown: Single winner with ${winner.eval.rank}, won ${roundPot}`);
                } else {
                  // Tie - split pot and game over
                  const splitAmount = Math.floor(roundPot / winners.length);
                  const playerChipChanges: Record<string, number> = {};
                  
                  for (const winner of winners) {
                    await supabase.rpc('increment_player_chips', {
                      p_player_id: winner.player.id,
                      p_amount: splitAmount
                    });
                    playerChipChanges[winner.player.id] = splitAmount;
                  }
                  
                   await supabase.from('game_results').insert({
                     game_id: game.id,
                     hand_number: holmHandNumber,
                    winner_player_id: winners[0].player.id,
                    pot_won: roundPot,
                    winning_hand_description: `Chopped: ${winners.length}-way split with ${winners[0].eval.rank}`,
                    is_chopped: true,
                    player_chip_changes: playerChipChanges,
                    game_type: game.game_type,
                    dealer_game_id: game.current_game_uuid || null,
                  });
                  
                  await supabase
                    .from('players')
                    .update({ current_decision: null, decision_locked: false, ante_decision: null })
                    .eq('game_id', game.id);
                  
                  await supabase
                    .from('games')
                    .update({
                      status: 'game_over',
                      game_over_at: nowIso,
                      pot: 0,
                      awaiting_next_round: false,
                      all_decisions_in: false,
                       // CRITICAL (Holm): Do not increment total_hands in watchdog; keep aligned to rounds.
                       total_hands: holmHandNumber,
                      last_round_result: `Chopped: ${winners.length}-way split`,
                    })
                    .eq('id', game.id);
                  
                  await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                  
                  actionsTaken.push(`Showdown: ${winners.length}-way chop with ${winners[0].eval.rank}`);
                }
              }
            }
            } // Close if (currentRound.status === 'betting')
          } // Close outer if (currentRound && status check)
        }

        // ============= GAME OVER COUNTDOWN =============
        // CRITICAL FIX: Handle game_over games both WITH and WITHOUT game_over_at set
        // Games can get stuck in game_over with null game_over_at if the client that set game_over
        // failed to also set game_over_at, or if there was a race condition.
        if (game.status === 'game_over') {
          // If game_over_at is null but game has been in game_over for a while (based on updated_at),
          // treat it as stale and clean it up using the same logic as stale game_over with game_over_at
          const STALE_GAME_OVER_THRESHOLD_MS = 60000; // 1 minute - if game_over with no game_over_at for 1min, it's stuck
          
          if (!game.game_over_at) {
            // game_over_at is null - check if it's been stuck based on updated_at
            if (msSinceUpdate > STALE_GAME_OVER_THRESHOLD_MS) {
              console.log('[CRON-ENFORCE] game_over with NULL game_over_at, stuck for', Math.round(msSinceUpdate / 1000), 'seconds:', game.id);
              
              // Apply the same stale game_over logic as below
              const { data: allPlayers } = await supabase
                .from('players')
                .select('id, user_id, position, sitting_out, waiting, stand_up_next_hand, sit_out_next_hand, is_bot, auto_fold, status')
                .eq('game_id', game.id)
                .order('position');
              
              if (allPlayers) {
                // Evaluate player states
                for (const player of allPlayers) {
                  if (player.stand_up_next_hand) {
                    if (player.is_bot) {
                      await supabase.from('players').delete().eq('id', player.id);
                    } else {
                      await supabase
                        .from('players')
                        .update({ sitting_out: true, stand_up_next_hand: false, waiting: false })
                        .eq('id', player.id);
                    }
                    continue;
                  }
                  
                  if (player.sit_out_next_hand) {
                    await supabase
                      .from('players')
                      .update({ sitting_out: true, sit_out_next_hand: false, waiting: false })
                      .eq('id', player.id);
                    continue;
                  }
                  
                  if (player.auto_fold) {
                    await supabase
                      .from('players')
                      .update({ sitting_out: true, waiting: false })
                      .eq('id', player.id);
                    continue;
                  }
                  
                  if (player.waiting && !player.sitting_out) {
                    await supabase
                      .from('players')
                      .update({ sitting_out: false, waiting: false })
                      .eq('id', player.id);
                  }
                }
                
                // Re-fetch and decide
                const { data: freshPlayers } = await supabase
                  .from('players')
                  .select('id, sitting_out, is_bot, status, position')
                  .eq('game_id', game.id);
                
                const activeHumans = (freshPlayers || []).filter((p: any) => !p.sitting_out && p.status !== 'observer' && !p.is_bot);
                
                const { data: gameDefaults } = await supabase
                  .from('game_defaults')
                  .select('allow_bot_dealers')
                  .eq('game_type', game.game_type || 'holm')
                  .maybeSingle();
                
                const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;
                
                const eligibleDealers = (freshPlayers || []).filter((p: any) =>
                  !p.sitting_out && p.status !== 'observer' && (allowBotDealers || !p.is_bot) && p.position !== null
                );
                
                if (activeHumans.length === 0) {
                  const hasHistory = (game.total_hands || 0) > 0;
                  
                  if (hasHistory) {
                    await supabase
                      .from('games')
                      .update({
                        status: 'session_ended',
                        session_ended_at: nowIso,
                        pending_session_end: false,
                        game_over_at: nowIso,
                        config_deadline: null,
                        ante_decision_deadline: null,
                        config_complete: false,
                        awaiting_next_round: false,
                      })
                      .eq('id', game.id);
                    actionsTaken.push('game_over stuck (null game_over_at): No active humans, session ended');
                  } else if (game.real_money === true) {
                    // CRITICAL: NEVER delete real_money games - archive instead (30 day retention)
                    console.log('[CRON-ENFORCE] Real money game - archiving instead of deleting');
                    await supabase
                      .from('games')
                      .update({
                        status: 'session_ended',
                        session_ended_at: nowIso,
                        pending_session_end: false,
                        game_over_at: nowIso,
                        config_deadline: null,
                        ante_decision_deadline: null,
                        config_complete: false,
                        awaiting_next_round: false,
                      })
                      .eq('id', game.id);
                    actionsTaken.push('game_over stuck (null game_over_at): Real money game archived (never deleted)');
                  } else {
                    // Delete empty session
                    const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
                    const roundIds = (roundRows ?? []).map((r: any) => r.id);
                    if (roundIds.length > 0) {
                      await supabase.from('player_cards').delete().in('round_id', roundIds);
                      await supabase.from('player_actions').delete().in('round_id', roundIds);
                    }
                    await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
                    await supabase.from('chat_messages').delete().eq('game_id', game.id);
                    await supabase.from('rounds').delete().eq('game_id', game.id);
                    await supabase.from('players').delete().eq('game_id', game.id);
                    await supabase.from('games').delete().eq('id', game.id);
                    actionsTaken.push('game_over stuck (null game_over_at): No humans, no history - deleted');
                  }
                } else if (eligibleDealers.length === 0) {
                  await supabase
                    .from('games')
                    .update({
                      status: 'session_ended',
                      session_ended_at: nowIso,
                      pending_session_end: false,
                      game_over_at: nowIso,
                      config_deadline: null,
                      ante_decision_deadline: null,
                      config_complete: false,
                      awaiting_next_round: false,
                    })
                    .eq('id', game.id);
                  actionsTaken.push('game_over stuck (null game_over_at): No eligible dealers, session ended');
                } else {
                  // Rotate dealer and start next hand
                  const eligiblePositions = eligibleDealers.map((p: any) => p.position as number).sort((a, b) => a - b);
                  const currentDealerPos = game.dealer_position || 0;
                  const currentIndex = eligiblePositions.indexOf(currentDealerPos);
                  
                  const nextDealerPos = currentIndex === -1
                    ? eligiblePositions[0]
                    : eligiblePositions[(currentIndex + 1) % eligiblePositions.length];
                  
                  const configDeadline = new Date(Date.now() + 30 * 1000).toISOString();
                  
                  await supabase
                    .from('games')
                    .update({
                      status: 'configuring',
                      dealer_position: nextDealerPos,
                      config_deadline: configDeadline,
                      game_over_at: null,
                      awaiting_next_round: false,
                      config_complete: false,
                      last_round_result: null,
                    })
                    .eq('id', game.id);
                  
                  await supabase
                    .from('players')
                    .update({
                      ante_decision: null,
                      current_decision: null,
                      decision_locked: false,
                      auto_fold: false,
                      pre_fold: false,
                      pre_stay: false,
                    })
                    .eq('game_id', game.id)
                    .eq('sitting_out', false);
                  
                  actionsTaken.push(`game_over stuck (null game_over_at): Rotated dealer to position ${nextDealerPos}`);
                }
              }
              
              results.push({
                gameId: game.id,
                status: game.status,
                result: actionsTaken.length > 0 ? actionsTaken.join('; ') : 'no_action_needed',
              });
              continue;
            } else {
              // game_over with null game_over_at but not stuck long enough yet - skip for now
              results.push({ gameId: game.id, status: game.status, result: 'game_over_null_timestamp_waiting' });
              continue;
            }
          }
          
          // game_over_at is set - use normal logic
          const gameOverAt = new Date(game.game_over_at);
          const gameOverDeadline = new Date(gameOverAt.getTime() + 8000);
          const staleThreshold = new Date(gameOverAt.getTime() + 15000);
          
          if (now > gameOverDeadline && game.pending_session_end) {
            console.log('[CRON-ENFORCE] game_over with pending_session_end, ending session:', game.id);
            
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                session_ended_at: game.session_ended_at ?? nowIso,
                pending_session_end: false,
                game_over_at: nowIso,
                config_deadline: null,
                ante_decision_deadline: null,
                config_complete: false,
                awaiting_next_round: false,
              })
              .eq('id', game.id);
            
            actionsTaken.push('game_over: pending_session_end → session ended');
          } else if (now > staleThreshold && !game.pending_session_end) {
            console.log('[CRON-ENFORCE] game_over stale (>15s), evaluating:', game.id);
            
            const { data: allPlayers } = await supabase
              .from('players')
              .select('id, user_id, position, sitting_out, waiting, stand_up_next_hand, sit_out_next_hand, is_bot, auto_fold, status')
              .eq('game_id', game.id)
              .order('position');
            
            if (allPlayers) {
              // Evaluate player states
              for (const player of allPlayers) {
                if (player.stand_up_next_hand) {
                  if (player.is_bot) {
                    await supabase.from('players').delete().eq('id', player.id);
                  } else {
                    await supabase
                      .from('players')
                      .update({ sitting_out: true, stand_up_next_hand: false, waiting: false })
                      .eq('id', player.id);
                  }
                  continue;
                }
                
                if (player.sit_out_next_hand) {
                  await supabase
                    .from('players')
                    .update({ sitting_out: true, sit_out_next_hand: false, waiting: false })
                    .eq('id', player.id);
                  continue;
                }
                
                if (player.auto_fold) {
                  await supabase
                    .from('players')
                    .update({ sitting_out: true, waiting: false })
                    .eq('id', player.id);
                  continue;
                }
                
                if (player.waiting && !player.sitting_out) {
                  await supabase
                    .from('players')
                    .update({ sitting_out: false, waiting: false })
                    .eq('id', player.id);
                }
              }
              
              // Re-fetch and decide
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('id, sitting_out, is_bot, status, position')
                .eq('game_id', game.id);
              
              const activeHumans = (freshPlayers || []).filter((p: any) => !p.sitting_out && p.status !== 'observer' && !p.is_bot);
              
              const { data: gameDefaults } = await supabase
                .from('game_defaults')
                .select('allow_bot_dealers')
                .eq('game_type', 'holm')
                .maybeSingle();
              
              const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;
              
              const eligibleDealers = (freshPlayers || []).filter((p: any) =>
                !p.sitting_out && p.status !== 'observer' && (allowBotDealers || !p.is_bot) && p.position !== null
              );
              
              if (activeHumans.length === 0) {
                const hasHistory = (game.total_hands || 0) > 0;
                
                if (hasHistory) {
                  await supabase
                    .from('games')
                    .update({
                      status: 'session_ended',
                      session_ended_at: nowIso,
                      pending_session_end: false,
                      game_over_at: nowIso,
                      config_deadline: null,
                      ante_decision_deadline: null,
                      config_complete: false,
                      awaiting_next_round: false,
                    })
                    .eq('id', game.id);
                  actionsTaken.push('game_over stale: No active humans, session ended');
                } else {
                  // Delete empty session
                  const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', game.id);
                  const roundIds = (roundRows ?? []).map((r: any) => r.id);
                  if (roundIds.length > 0) {
                    await supabase.from('player_cards').delete().in('round_id', roundIds);
                    await supabase.from('player_actions').delete().in('round_id', roundIds);
                  }
                  await supabase.from('chip_stack_emoticons').delete().eq('game_id', game.id);
                  await supabase.from('chat_messages').delete().eq('game_id', game.id);
                  await supabase.from('rounds').delete().eq('game_id', game.id);
                  await supabase.from('players').delete().eq('game_id', game.id);
                  await supabase.from('games').delete().eq('id', game.id);
                  actionsTaken.push('game_over stale: No humans, no history - deleted');
                }
              } else if (eligibleDealers.length === 0) {
                await supabase
                  .from('games')
                  .update({
                    status: 'session_ended',
                    session_ended_at: nowIso,
                    pending_session_end: false,
                    game_over_at: nowIso,
                    config_deadline: null,
                    ante_decision_deadline: null,
                    config_complete: false,
                    awaiting_next_round: false,
                  })
                  .eq('id', game.id);
                actionsTaken.push('game_over stale: No eligible dealers, session ended');
              } else {
                // Rotate dealer and start next hand
                const eligiblePositions = eligibleDealers.map((p: any) => p.position as number).sort((a, b) => a - b);
                const currentDealerPos = game.dealer_position || 0;
                const currentIndex = eligiblePositions.indexOf(currentDealerPos);
                
                const nextDealerPos = currentIndex === -1
                  ? eligiblePositions[0]
                  : eligiblePositions[(currentIndex + 1) % eligiblePositions.length];
                
                // CRITICAL FIX: Use 30s timer (matches game defaults) instead of 60s
                const configDeadline = new Date(Date.now() + 30 * 1000).toISOString();
                
                await supabase
                  .from('games')
                  .update({
                    status: 'configuring',
                    dealer_position: nextDealerPos,
                    config_deadline: configDeadline,
                    game_over_at: null,
                    awaiting_next_round: false,
                    config_complete: false,
                    // CRITICAL FIX: Clear last_round_result when rotating to new game config
                    // This prevents the old result banner from showing during configuration
                    last_round_result: null,
                  })
                  .eq('id', game.id);
                
                await supabase
                  .from('players')
                  .update({
                    ante_decision: null,
                    current_decision: null,
                    decision_locked: false,
                    auto_fold: false,
                    pre_fold: false,
                    pre_stay: false,
                  })
                  .eq('game_id', game.id)
                  .eq('sitting_out', false);
                
                actionsTaken.push(`game_over stale: Rotated dealer to position ${nextDealerPos}`);
              }
            }
          }
        }

        // Record result
        results.push({
          gameId: game.id,
          status: game.status,
          result: actionsTaken.length > 0 ? actionsTaken.join('; ') : 'no_action_needed',
        });

      } catch (gameErr) {
        console.error('[CRON-ENFORCE] Error processing game', game.id, ':', gameErr);
        results.push({ gameId: game.id, status: game.status, result: `error: ${gameErr}` });
      }
    }

    const duration = Date.now() - startTime;
    console.log('[CRON-ENFORCE] Completed in', duration, 'ms. Results:', results);

    return new Response(JSON.stringify({
      success: true,
      gamesProcessed: games?.length || 0,
      results,
      durationMs: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[CRON-ENFORCE] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
