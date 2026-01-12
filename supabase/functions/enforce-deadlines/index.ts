import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Card utilities for server-side Holm round start
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DeadlineDebugSource = 'client' | 'cron' | 'debug-ui' | 'unknown';

type DeadlineDebugSnapshot = {
  nowIso: string;
  source: DeadlineDebugSource;
  requestId: string | null;
  debugLabel: string | null;
  game: any;
  deadlines: {
    config: any;
    ante: any;
    roundDecision: any;
    gameOver: any;
  };
  staleness: {
    configDeadlineStale: boolean;
    anteDeadlineStale: boolean;
    roundDecisionDeadlineStale: boolean;
    anyExpiredDeadline: boolean;
  };
  counts: {
    humansActive: number;
    humansTotal: number;
    botsTotal: number;
  };
  players: any[];
  rounds: any[];
};

// Helper to log sitting_out/sit_out_next_hand changes for debugging
async function logSittingOutChange(
  supabase: any,
  playerId: string,
  userId: string,
  gameId: string,
  username: string | null,
  isBot: boolean,
  fieldChanged: 'sitting_out' | 'sit_out_next_hand',
  oldValue: boolean,
  newValue: boolean,
  reason: string,
  sourceLocation: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  // Skip logging for bots
  if (isBot) return;
  // Only log if value is changing
  if (oldValue === newValue) return;

  try {
    await supabase
      .from('sitting_out_debug_log')
      .insert({
        player_id: playerId,
        user_id: userId,
        game_id: gameId,
        username: username || null,
        is_bot: isBot,
        field_changed: fieldChanged,
        old_value: oldValue,
        new_value: newValue,
        reason,
        source_location: sourceLocation,
        additional_context: additionalContext || null,
      });
  } catch (e) {
    console.error('[ENFORCE] Failed to log sitting out change:', e);
  }
}

function describeDeadline(deadlineIso: string | null | undefined, now: Date) {
  if (!deadlineIso) {
    return { iso: null, msFromNow: null, isExpired: false };
  }

  const t = new Date(deadlineIso).getTime();
  const msFromNow = t - now.getTime();
  return {
    iso: deadlineIso,
    msFromNow,
    isExpired: msFromNow <= 0,
  };
}

async function collectDeadlineDebug(
  supabase: any,
  gameId: string,
  game: any,
  now: Date,
  source: DeadlineDebugSource,
  requestId: string | null,
  debugLabel: string | null
): Promise<DeadlineDebugSnapshot> {
  const nowIso = now.toISOString();

  const { data: players } = await supabase
    .from('players')
    .select(
      'id,user_id,is_bot,position,status,created_at,waiting,sitting_out,sit_out_next_hand,stand_up_next_hand,ante_decision,current_decision,decision_locked,auto_fold,auto_ante'
    )
    .eq('game_id', gameId);

  const { data: rounds } = await supabase
    .from('rounds')
    .select('id,round_number,status,decision_deadline,current_turn_position,hand_number,created_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(5);

  const config = describeDeadline(game?.config_deadline ?? null, now);
  const ante = describeDeadline(game?.ante_decision_deadline ?? null, now);

  const currentRound = (rounds ?? []).find((r: any) => r.round_number === game?.current_round) ?? null;
  const roundDecision = describeDeadline(currentRound?.decision_deadline ?? null, now);
  const gameOver = describeDeadline(game?.game_over_at ? new Date(new Date(game.game_over_at).getTime() + 8000).toISOString() : null, now);

  const isConfigPhase = game?.status === 'dealer_selection' || game?.status === 'configuring' || game?.status === 'game_selection';
  const isAntePhase = game?.status === 'ante_decision';
  const isBettingPhase = game?.status === 'in_progress' || game?.status === 'betting';

  const configDeadlineStale = !!game?.config_deadline && !isConfigPhase;
  const anteDeadlineStale = !!game?.ante_decision_deadline && !isAntePhase;
  const roundDecisionDeadlineStale = !!currentRound?.decision_deadline && !isBettingPhase;

  const playersArr = players ?? [];
  const humansTotal = playersArr.filter((p: any) => !p.is_bot).length;
  const botsTotal = playersArr.filter((p: any) => p.is_bot).length;
  const humansActive = playersArr.filter((p: any) => !p.is_bot && p.status === 'active' && !p.sitting_out).length;

  const anyExpiredDeadline = [config, ante, roundDecision, gameOver].some((d: any) => d?.isExpired);

  return {
    nowIso,
    source,
    requestId,
    debugLabel,
    game,
    deadlines: { config, ante, roundDecision, gameOver },
    staleness: {
      configDeadlineStale,
      anteDeadlineStale,
      roundDecisionDeadlineStale,
      anyExpiredDeadline,
    },
    counts: {
      humansActive,
      humansTotal,
      botsTotal,
    },
    players: playersArr,
    rounds: rounds ?? [],
  };
}
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Prefer service role key for bypassing RLS, fallback to anon key
    const keyToUse = serviceRoleKey || anonKey;

    console.log('[ENFORCE] Init', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
      hasAnonKey: !!anonKey,
      serviceRoleKeyLen: serviceRoleKey?.length || 0,
      anonKeyLen: anonKey?.length || 0,
    });

    // Early exit if env vars not ready (can happen during cold start)
    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[ENFORCE] Missing required env vars:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!keyToUse,
        keyLen: keyToUse?.length || 0,
      });
      return new Response(JSON.stringify({
        error: 'Backend configuration missing - env vars not available',
        retry: true,
      }), {
        status: 503, // Service Unavailable - tells client to retry
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[ENFORCE] Failed to parse request body:', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gameId: string | undefined = body?.gameId;
    const debug: boolean = body?.debug === true;
    const auditOnly: boolean = body?.auditOnly === true;
    const source: DeadlineDebugSource = (body?.source ?? 'unknown') as DeadlineDebugSource;
    const requestId: string | null = typeof body?.requestId === 'string' ? body.requestId : null;
    const debugLabel: string | null = typeof body?.debugLabel === 'string' ? body.debugLabel : null;

    console.log('[ENFORCE] Received', { gameId, source, requestId, debug, auditOnly, debugLabel, gameIdType: typeof gameId });
    
    if (!gameId) {
      return new Response(JSON.stringify({ error: 'gameId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let actionsTaken: string[] = [];

    // Fetch game data
    console.log('[ENFORCE] Querying game:', gameId);
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    console.log('[ENFORCE] Game query result:', {
      found: !!game,
      error: gameError?.message || null,
      errorCode: (gameError as any)?.code || null,
      gameStatus: (game as any)?.status || null,
    });

    // Treat "game not found" as a SUCCESS response so clients don't surface 404s.
    const notFoundCode = (gameError as any)?.code;
    const notFoundMsg = String(gameError?.message ?? '').toLowerCase();
    const isNotFound = !game || notFoundCode === 'PGRST116' || notFoundMsg.includes('0 rows');

    if (isNotFound) {
      return new Response(JSON.stringify({
        success: true,
        gameMissing: true,
        retry: false,
        gameId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (gameError) {
      const msg = String(gameError.message ?? '');
      const lower = msg.toLowerCase();
      const isTransient =
        lower.includes('typeerror') ||
        lower.includes('econnreset') ||
        lower.includes('connection reset') ||
        lower.includes('sendrequest') ||
        lower.includes('client error') ||
        lower.includes('timeout') ||
        lower.includes('network');

      console.error('[ENFORCE] Game query failed:', { gameId, error: gameError, isTransient });

      return new Response(JSON.stringify({
        error: 'Temporary backend error',
        retry: true,
        gameId,
        dbError: gameError?.message || null,
        dbCode: (gameError as any)?.code || null,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect debug snapshot early so we can see game/player state BEFORE any enforcement.
    let debugSnapshot: DeadlineDebugSnapshot | null = null;
    if (debug || auditOnly) {
      try {
        debugSnapshot = await collectDeadlineDebug(supabase, gameId, game, now, source, requestId, debugLabel);
        console.log('[DEADLINE-AUDIT]', JSON.stringify({
          gameId,
          ...debugSnapshot,
        }, null, 2));
      } catch (e) {
        console.error('[DEADLINE-AUDIT] Failed to collect debug snapshot', { gameId, source, requestId, error: String(e) });
      }
    }

    // Audit-only mode: return snapshot without mutating anything.
    if (auditOnly) {
      return new Response(JSON.stringify({
        success: true,
        auditOnly: true,
        gameId,
        gameStatus: game.status,
        isPaused: !!game.is_paused,
        actionsTaken: [],
        debugSnapshot,
        source,
        requestId,
        debugLabel,
        timestamp: nowIso,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip ALL deadline enforcement if game is paused
    // This is critical - deadlines freeze when paused, resume when unpaused
    if (game.is_paused) {
      console.log('[ENFORCE] Game is paused, skipping all deadline enforcement for game', gameId);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Game is paused, no deadlines enforced',
        actionsTaken: [],
        gameStatus: game.status,
        isPaused: true,
        debugSnapshot,
        source,
        requestId,
        debugLabel,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 0. HANDLE STALE dealer_selection GAMES (no config_deadline yet, but stuck)
    // Games in dealer_selection that have been idle for >60 seconds should be cleaned up.
    // The dealer_selection phase should complete within seconds (the spinning animation).
    if (game.status === 'dealer_selection' && !game.config_deadline) {
      const gameCreatedAt = new Date(game.created_at);
      const gameUpdatedAt = new Date(game.updated_at);
      const staleSince = Math.max(gameCreatedAt.getTime(), gameUpdatedAt.getTime());
      const staleMs = now.getTime() - staleSince;
      const DEALER_SELECTION_TIMEOUT_MS = 60000; // 60 seconds
      
      console.log('[ENFORCE] Checking stale dealer_selection game:', {
        gameId,
        updatedAt: game.updated_at,
        staleMs,
        timeoutMs: DEALER_SELECTION_TIMEOUT_MS,
        isStale: staleMs > DEALER_SELECTION_TIMEOUT_MS,
      });
      
      if (staleMs > DEALER_SELECTION_TIMEOUT_MS) {
        console.log('[ENFORCE] dealer_selection game is STALE, cleaning up:', gameId);
        
        // Fetch players to check session history
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Re-fetch game to get latest total_hands
        const { data: freshGame } = await supabase
          .from('games')
          .select('total_hands')
          .eq('id', gameId)
          .maybeSingle();
        
        const totalHands = (freshGame?.total_hands ?? 0) as number;
        
        // Also check game_results as backup
        const { count: resultsCount } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);
        
        const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
        
        console.log('[ENFORCE] Stale dealer_selection session check:', { totalHands, resultsCount, hasHistory });
        
        if (!hasHistory) {
          // Delete empty session (FK-safe order)
          const { data: roundRows } = await supabase
            .from('rounds')
            .select('id')
            .eq('game_id', gameId);
          
          const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);
          
          if (roundIds.length > 0) {
            await supabase.from('player_cards').delete().in('round_id', roundIds);
          }
          
          await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
          await supabase.from('chat_messages').delete().eq('game_id', gameId);
          await supabase.from('rounds').delete().eq('game_id', gameId);
          await supabase.from('players').delete().eq('game_id', gameId);
          await supabase.from('games').delete().eq('id', gameId);
          
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
            .eq('id', gameId);
          
          actionsTaken.push('Stale dealer_selection: Has history, session ended');
        }
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: hasHistory ? 'session_ended' : 'deleted',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 0b. HANDLE STALE "waiting" GAMES (no activity for extended period)
    // Games stuck in "waiting" status (waiting for more players) for >2 hours should be cleaned up.
    const WAITING_GAME_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (game.status === 'waiting') {
      const gameUpdatedAt = new Date(game.updated_at);
      const staleMs = now.getTime() - gameUpdatedAt.getTime();
      
      console.log('[ENFORCE] Checking stale waiting game:', {
        gameId,
        updatedAt: game.updated_at,
        staleMs,
        timeoutMs: WAITING_GAME_TIMEOUT_MS,
        isStale: staleMs > WAITING_GAME_TIMEOUT_MS,
      });
      
      if (staleMs > WAITING_GAME_TIMEOUT_MS) {
        console.log('[ENFORCE] waiting game is STALE (>2 hours), cleaning up:', gameId);
        
        // Re-fetch game to get latest total_hands
        const { data: freshGame } = await supabase
          .from('games')
          .select('total_hands')
          .eq('id', gameId)
          .maybeSingle();
        
        const totalHands = (freshGame?.total_hands ?? 0) as number;
        
        // Also check game_results as backup
        const { count: resultsCount } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);
        
        const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
        
        console.log('[ENFORCE] Stale waiting session check:', { totalHands, resultsCount, hasHistory });
        
        if (!hasHistory) {
          // Delete empty session (FK-safe order)
          const { data: roundRows } = await supabase
            .from('rounds')
            .select('id')
            .eq('game_id', gameId);
          
          const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);
          
          if (roundIds.length > 0) {
            await supabase.from('player_cards').delete().in('round_id', roundIds);
          }
          
          await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
          await supabase.from('chat_messages').delete().eq('game_id', gameId);
          await supabase.from('rounds').delete().eq('game_id', gameId);
          await supabase.from('players').delete().eq('game_id', gameId);
          await supabase.from('games').delete().eq('id', gameId);
          
          actionsTaken.push('Stale waiting game (>2h): No history, deleted empty session');
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
            .eq('id', gameId);
          
          actionsTaken.push('Stale waiting game (>2h): Has history, session ended');
        }
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: hasHistory ? 'session_ended' : 'deleted',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 0c. HANDLE STALE "in_progress" GAMES (no decision_deadline and no activity for extended period)
    // Games stuck in "in_progress" without any decision deadlines for >2 hours should be cleaned up.
    const IN_PROGRESS_STALE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (game.status === 'in_progress') {
      // Fetch current round to check for decision deadline
      const { data: currentRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round ?? 0)
        .maybeSingle();
      
      const hasDecisionDeadline = !!currentRound?.decision_deadline;
      
      if (!hasDecisionDeadline) {
        const gameUpdatedAt = new Date(game.updated_at);
        const staleMs = now.getTime() - gameUpdatedAt.getTime();
        
        console.log('[ENFORCE] Checking stale in_progress game (no deadline):', {
          gameId,
          updatedAt: game.updated_at,
          staleMs,
          timeoutMs: IN_PROGRESS_STALE_TIMEOUT_MS,
          isStale: staleMs > IN_PROGRESS_STALE_TIMEOUT_MS,
          hasDecisionDeadline,
        });
        
        if (staleMs > IN_PROGRESS_STALE_TIMEOUT_MS) {
          console.log('[ENFORCE] in_progress game is STALE (>2h, no deadline), cleaning up:', gameId);
          
          // Re-fetch game to get latest total_hands
          const { data: freshGame } = await supabase
            .from('games')
            .select('total_hands')
            .eq('id', gameId)
            .maybeSingle();
          
          const totalHands = (freshGame?.total_hands ?? 0) as number;
          
          // Also check game_results as backup
          const { count: resultsCount } = await supabase
            .from('game_results')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', gameId);
          
          const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
          
          console.log('[ENFORCE] Stale in_progress session check:', { totalHands, resultsCount, hasHistory });
          
          // For in_progress games, they usually have history, so end the session
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
            .eq('id', gameId);
          
          actionsTaken.push('Stale in_progress game (>2h, no deadline): session ended');
          
          return new Response(JSON.stringify({
            success: true,
            actionsTaken,
            gameStatus: 'session_ended',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 1. ENFORCE CONFIG DEADLINE (dealer setup timeout)
    // Check if config_deadline has expired for games in config phase
    if ((game.status === 'dealer_selection' || game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
      const configDeadline = new Date(game.config_deadline);
      const msUntilDeadline = configDeadline.getTime() - now.getTime();
      
      console.log('[ENFORCE] Config deadline check:', {
        gameId,
        status: game.status,
        configDeadline: game.config_deadline,
        now: nowIso,
        msUntilDeadline,
        isExpired: msUntilDeadline <= 0,
      });
      
      if (msUntilDeadline <= 0) {
        console.log('[ENFORCE] Config deadline EXPIRED for game', gameId, { 
          deadline: game.config_deadline, 
          now: nowIso, 
          expiredByMs: Math.abs(msUntilDeadline),
        });
        
        // Find dealer player
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        const dealerPlayer = players?.find(p => p.position === game.dealer_position);

        if (dealerPlayer) {
          // Log this status change for debugging (before the update)
          await logSittingOutChange(
            supabase,
            dealerPlayer.id,
            dealerPlayer.user_id,
            gameId,
            null, // We don't have username in this query
            dealerPlayer.is_bot,
            'sitting_out',
            dealerPlayer.sitting_out,
            true,
            'Dealer timed out during config phase (edge function enforcement)',
            'enforce-deadlines/index.ts:config_deadline',
            { dealer_position: game.dealer_position, config_deadline: game.config_deadline }
          );

          // Mark dealer as sitting out
          await supabase
            .from('players')
            .update({ sitting_out: true, waiting: false })
            .eq('id', dealerPlayer.id);

          // Respect allow_bot_dealers
          const { data: gameDefaults } = await supabase
            .from('game_defaults')
            .select('allow_bot_dealers')
            .eq('game_type', 'holm')
            .maybeSingle();

          const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

          // If no active humans remain, end/delete the session (based on game history)
          const remainingActiveHumans = (players ?? []).filter((p: any) =>
            !p.is_bot &&
            !p.sitting_out &&
            p.id !== dealerPlayer.id
          );

          if (remainingActiveHumans.length < 1) {
            // Re-fetch game to get latest total_hands (avoid stale data race condition)
            const { data: freshGame } = await supabase
              .from('games')
              .select('total_hands')
              .eq('id', gameId)
              .maybeSingle();
            
            const totalHands = (freshGame?.total_hands ?? 0) as number;
            
            // Also check game_results as backup - if any results exist, session has history
            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', gameId);
            
            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
            
            console.log('[ENFORCE] Config timeout session check:', { totalHands, resultsCount, hasHistory });

            if (!hasHistory) {
              // Delete empty session (FK-safe order)
              const { data: roundRows } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId);

              const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);

              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
              }

              await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
              await supabase.from('chat_messages').delete().eq('game_id', gameId);
              await supabase.from('rounds').delete().eq('game_id', gameId);
              await supabase.from('players').delete().eq('game_id', gameId);
              await supabase.from('games').delete().eq('id', gameId);

              actionsTaken.push('Config timeout: No active humans and no history, deleted empty session');
            } else {
              await supabase
                .from('games')
                .update({
                  // Terminal state: do NOT allow the session to continue when the only human dealer timed out
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  // Clear any config/ante deadlines so clients can't "resume" countdowns
                  config_deadline: null,
                  ante_decision_deadline: null,
                  config_complete: false,
                })
                .eq('id', gameId);

              actionsTaken.push('Config timeout: Only human dealer; session ended (has history)');
            }

            return new Response(JSON.stringify({
              success: true,
              actionsTaken,
              gameStatus: 'deleted_or_game_over',
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Count remaining eligible dealers (non-sitting-out, excluding the timed-out dealer)
          const eligibleDealers = players?.filter((p: any) =>
            !p.sitting_out &&
            p.id !== dealerPlayer.id &&
            (allowBotDealers || !p.is_bot)
          ) || [];

          if (eligibleDealers.length >= 1) {
            // Rotate dealer to next eligible player
            const sortedEligible = eligibleDealers.sort((a: any, b: any) => a.position - b.position);
            const currentDealerIdx = sortedEligible.findIndex((p: any) => p.position > game.dealer_position);
            const nextDealer = currentDealerIdx >= 0
              ? sortedEligible[currentDealerIdx]
              : sortedEligible[0];

            // Calculate new config deadline (30 seconds from now)
            const newConfigDeadline = new Date(Date.now() + 30000).toISOString();

            await supabase
              .from('games')
              .update({
                dealer_position: nextDealer.position,
                config_deadline: newConfigDeadline,
              })
              .eq('id', gameId);

            actionsTaken.push(`Config timeout: Dealer ${dealerPlayer.position} sat out, rotated to ${nextDealer.position}`);
          } else {
            // Not enough eligible dealers - return to waiting_for_players status
            await supabase
              .from('games')
              .update({
                status: 'waiting_for_players',
                config_deadline: null,
                config_complete: false,
              })
              .eq('id', gameId);

            actionsTaken.push('Config timeout: No eligible dealers, returning to waiting_for_players');
          }
        }
      }
    }

    // 2. ENFORCE ANTE DECISION DEADLINE
    if (game.status === 'ante_decision' && game.ante_decision_deadline) {
      const anteDeadline = new Date(game.ante_decision_deadline);
      if (now > anteDeadline) {
        console.log('[ENFORCE] Ante deadline expired for game', gameId);
        
        // Find all players
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Find undecided players (no ante_decision yet) and auto-sit them out
        const undecidedPlayers = players?.filter(p => !p.ante_decision && !p.sitting_out) || [];
        
        if (undecidedPlayers.length > 0) {
          // Log each human player's status change for debugging
          for (const player of undecidedPlayers) {
            await logSittingOutChange(
              supabase,
              player.id,
              player.user_id,
              gameId,
              null,
              player.is_bot,
              'sitting_out',
              player.sitting_out,
              true,
              'Player did not respond to ante decision in time (edge function enforcement)',
              'enforce-deadlines/index.ts:ante_deadline',
              { ante_decision_deadline: game.ante_decision_deadline }
            );
          }

          const undecidedIds = undecidedPlayers.map(p => p.id);
          
          await supabase
            .from('players')
            .update({
              ante_decision: 'sit_out',
              sitting_out: true,
              waiting: false,
            })
            .in('id', undecidedIds);
          
          actionsTaken.push(`Ante timeout: Auto-sat-out ${undecidedIds.length} undecided players`);
        }
        
        // Re-fetch players after updates
        const { data: freshPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Count how many players successfully anted up
        const antedUpPlayers = freshPlayers?.filter(p => p.ante_decision === 'ante_up' && !p.sitting_out) || [];
        
        console.log('[ENFORCE] After ante timeout: anted_up=', antedUpPlayers.length, 'total=', freshPlayers?.length);
        
        if (antedUpPlayers.length >= 2) {
          // Enough players to start - transition game to in_progress
          // The client will detect this and call startHolmRound
          await supabase
            .from('games')
            .update({
              ante_decision_deadline: null,
              // Don't change status here - let the client handle the transition
              // to avoid race conditions with startHolmRound
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Ante timeout: ${antedUpPlayers.length} players anted up, ready to start`);
        } else if (antedUpPlayers.length < 2) {
          // Not enough players - return to waiting_for_players
          // Check if dealer is still active (not sitting out)
          const currentDealer = freshPlayers?.find(p => p.position === game.dealer_position);
          const dealerIsActive = currentDealer && !currentDealer.sitting_out;
          
          if (!dealerIsActive) {
            // Dealer timed out - rotate to next eligible dealer
            const eligibleDealers = freshPlayers?.filter(p => 
              !p.is_bot && 
              !p.sitting_out
            ).sort((a, b) => a.position - b.position) || [];
            
            if (eligibleDealers.length >= 1) {
              // Find next dealer clockwise from current position
              const currentPos = game.dealer_position || 1;
              const higherPositions = eligibleDealers.filter(p => p.position > currentPos);
              const nextDealer = higherPositions.length > 0 
                ? higherPositions[0] 
                : eligibleDealers[0];
              
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  ante_decision_deadline: null,
                  dealer_position: nextDealer.position,
                })
                .eq('id', gameId);
              
              actionsTaken.push(`Ante timeout: Dealer sat out, rotated to position ${nextDealer.position}, returning to waiting`);
            } else {
              // No eligible dealers at all
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  ante_decision_deadline: null,
                })
                .eq('id', gameId);
              
              actionsTaken.push('Ante timeout: No active players, returning to waiting_for_players');
            }
          } else {
            // Dealer is still active but not enough players
            await supabase
              .from('games')
              .update({
                status: 'waiting_for_players',
                ante_decision_deadline: null,
              })
              .eq('id', gameId);
            
            actionsTaken.push(`Ante timeout: Only ${antedUpPlayers.length} player(s) anted up, returning to waiting_for_players`);
          }
        }
      }
    }

    // 3. ENFORCE DECISION DEADLINE (stay/fold during gameplay)
    if (game.status === 'in_progress' || game.status === 'betting') {
      // IMPORTANT: round_number/status can become unreliable under race conditions.
      // Only act when we find a BETTING round whose decision_deadline is actually overdue.
      const { data: overdueRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .eq('status', 'betting')
        .not('decision_deadline', 'is', null)
        .lt('decision_deadline', nowIso)
        .order('decision_deadline', { ascending: true })
        .limit(1);

      let currentRound = overdueRounds?.[0];

      if (currentRound?.decision_deadline && currentRound.status === 'betting') {
        const decisionDeadline = new Date(currentRound.decision_deadline);
        if (now > decisionDeadline) {
          console.log('[ENFORCE] Decision deadline expired for game', gameId, 'round', currentRound.round_number, {
            roundId: currentRound.id,
            createdAt: currentRound.created_at,
            currentTurnPosition: currentRound.current_turn_position,
          });

          // Holm games: sequential turn-based decisions
          if (game.game_type === 'holm-game') {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            const activePlayers = players?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];
            const undecidedPlayers = activePlayers.filter((p: any) => !p.decision_locked);

            // Recovery: some stuck states have betting + expired deadline but missing current_turn_position.
            let currentTurnPos: number | null = (currentRound.current_turn_position ?? null) as any;
            if (!currentTurnPos && undecidedPlayers.length > 0) {
              currentTurnPos = undecidedPlayers
                .map((p: any) => p.position)
                .sort((a: number, b: number) => a - b)[0];

              await supabase
                .from('rounds')
                .update({ current_turn_position: currentTurnPos })
                .eq('id', currentRound.id);

              currentRound = { ...(currentRound as any), current_turn_position: currentTurnPos };
              actionsTaken.push(`Recovered missing current_turn_position (set to ${currentTurnPos})`);
            }

            if (currentTurnPos) {
              const currentTurnPlayer = activePlayers.find((p: any) => p.position === currentTurnPos);

              if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
                // CRITICAL: Check decision_locked, not current_decision
                // Only process if the player hasn't already locked their decision
                if (currentTurnPlayer.is_bot) {
                  // Bot decision - 50% stay, 50% fold (simple logic for server-side)
                  const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                  await supabase
                    .from('players')
                    .update({ current_decision: botDecision, decision_locked: true })
                    .eq('id', currentTurnPlayer.id);

                  actionsTaken.push(`Bot timeout: Made decision '${botDecision}' for bot at position ${currentTurnPlayer.position}`);
                } else {
                  // Human player - auto-fold AND set auto_fold flag for future hands
                  await supabase
                    .from('players')
                    .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                    .eq('id', currentTurnPlayer.id);

                  actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentTurnPlayer.position} and set auto_fold=true`);
                }
              }

              // CRITICAL: After decision, advance turn to next UNDECIDED player
              // Re-fetch players to get updated decisions
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', gameId);

              const freshActivePlayers = freshPlayers?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];

              // CRITICAL FIX: In Holm games, check if ALL active players have LOCKED their decision
              // Not just whether they have a current_decision, because players whose turn hasn't come
              // will have null current_decision but should NOT be considered "decided"
              const undecidedActivePlayers = freshActivePlayers.filter((p: any) => !p.decision_locked);
              const currentPos = currentTurnPos;

              console.log('[ENFORCE] Active players:', freshActivePlayers.map((p: any) => ({ pos: p.position, locked: p.decision_locked, decision: p.current_decision })));
              console.log('[ENFORCE] Undecided players:', undecidedActivePlayers.map((p: any) => p.position));

              if (undecidedActivePlayers.length === 0) {
                // All players decided - use ATOMIC guard to prevent race conditions
                // Only proceed if we successfully claim the lock (all_decisions_in was false)
                const { data: lockResult, error: lockError } = await supabase
                  .from('games')
                  .update({ all_decisions_in: true })
                  .eq('id', gameId)
                  .eq('all_decisions_in', false) // Atomic guard - only update if not already set
                  .select();

                if (lockError || !lockResult || lockResult.length === 0) {
                  actionsTaken.push('All players decided - but another process already claimed the lock, skipping');
                } else {
                  // CRITICAL FIX: Also update round status to 'showdown' so client-side
                  // processing can detect the state change. Without this, the round stays
                  // in 'betting' status and the client never triggers endHolmRound.
                  await supabase
                    .from('rounds')
                    .update({ status: 'showdown' })
                    .eq('id', (currentRound as any).id)
                    .eq('status', 'betting'); // Only update if still in betting status

                  actionsTaken.push('All players decided - all_decisions_in set to true, round status set to showdown (atomic lock acquired)');
                }
              } else {
                // CRITICAL FIX: Only advance to UNDECIDED players
                // Filter positions to only those who haven't locked their decision yet
                const undecidedPositions = undecidedActivePlayers.map((p: any) => p.position).sort((a: number, b: number) => a - b);

                // Find next undecided position clockwise
                const higherUndecidedPositions = undecidedPositions.filter((p: number) => p > (currentPos as number));
                const nextPosition = higherUndecidedPositions.length > 0
                  ? Math.min(...higherUndecidedPositions)
                  : Math.min(...undecidedPositions);

                if (nextPosition !== currentPos) {
                  // Advance turn to next undecided player
                  const { data: gameDefaults } = await supabase
                    .from('game_defaults')
                    .select('decision_timer_seconds')
                    .eq('game_type', 'holm')
                    .maybeSingle();

                  const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 30;
                  const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();

                  await supabase
                    .from('rounds')
                    .update({
                      current_turn_position: nextPosition,
                      decision_deadline: newDeadline
                    })
                    .eq('id', (currentRound as any).id);

                  actionsTaken.push(`Advanced turn from position ${currentPos} to UNDECIDED position ${nextPosition}`);
                }
              }
            }
          }

          // 3-5-7 games: simultaneous decisions - auto-fold ALL undecided players when deadline expires
          else if (game.game_type !== 'holm-game') {
            console.log('[ENFORCE] 3-5-7 decision deadline expired for game', gameId, 'round', currentRound.round_number);

            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            // Find all undecided active players
            const undecidedPlayers = players?.filter((p: any) =>
              p.status === 'active' &&
              !p.sitting_out &&
              !p.decision_locked &&
              p.ante_decision === 'ante_up'
            ) || [];

            console.log('[ENFORCE] 3-5-7 undecided players:', undecidedPlayers.map((p: any) => ({ pos: p.position, isBot: p.is_bot })));

            // Auto-fold all undecided players
            for (const player of undecidedPlayers) {
              if (player.is_bot) {
                // Bot decision - 50% stay, 50% fold
                const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                await supabase
                  .from('players')
                  .update({ current_decision: botDecision, decision_locked: true })
                  .eq('id', player.id);

                actionsTaken.push(`3-5-7 Bot timeout: Made decision '${botDecision}' for bot at position ${player.position}`);
              } else {
                // Human player - auto-fold AND set auto_fold flag
                await supabase
                  .from('players')
                  .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                  .eq('id', player.id);

                actionsTaken.push(`3-5-7 Decision timeout: Auto-folded player at position ${player.position} and set auto_fold=true`);
              }
            }

            // If we auto-folded anyone, set all_decisions_in and update round status
            if (undecidedPlayers.length > 0) {
              // Use atomic guard
              const { data: lockResult, error: lockError } = await supabase
                .from('games')
                .update({ all_decisions_in: true })
                .eq('id', gameId)
                .eq('all_decisions_in', false)
                .select();

              if (!lockError && lockResult && lockResult.length > 0) {
                await supabase
                  .from('rounds')
                  .update({ status: 'showdown' })
                  .eq('id', (currentRound as any).id)
                  .eq('status', 'betting');

                actionsTaken.push('3-5-7: All players decided - all_decisions_in set to true, round status set to showdown');
              }
            }
          }
        }
      }
    }

    // 4. ENFORCE STUCK SHOWDOWN/PROCESSING ROUNDS (Both Holm and 3-5-7 games)
    // If a round is stuck in 'showdown' or 'processing' status for too long,
    // the end-of-round function likely failed mid-execution. Auto-recover by
    // setting awaiting_next_round and allowing progression.
    // CRITICAL: Only trigger if game.awaiting_next_round is FALSE and all_decisions_in is TRUE.
    // If awaiting_next_round is already set, the client is handling progression.
    // If all_decisions_in is false, players are still deciding - not stuck.
    if (game.status === 'in_progress' && 
        game.awaiting_next_round !== true && game.all_decisions_in === true) {
      const { data: stuckRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .in('status', ['showdown', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      const stuckRound = stuckRounds?.[0];
      if (stuckRound) {
        // Use game.updated_at as proxy for when we entered this state (more accurate than round.created_at)
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
        
        // Only recover if stuck for more than 15 seconds AND no awaiting_next_round flag
        // Reduced from 45s to 15s for faster recovery - animations complete in <10s
        if (stuckDuration > 15000) {
          console.log('[ENFORCE] ⚠️ Round stuck in', stuckRound.status, 'for', Math.round(stuckDuration/1000), 'seconds (game unchanged) - auto-recovering');
          
          // For 3-5-7 games: Check if a single player stayed (they earn a leg)
          // This handles the case where the client disconnected before awarding the leg
          if (game.game_type === '3-5-7') {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId)
              .eq('ante_decision', 'ante_up')
              .eq('sitting_out', false);
            
            const stayedPlayers = players?.filter(p => p.current_decision === 'stay') || [];
            
            if (stayedPlayers.length === 1) {
              // Single stayer wins a leg - award it server-side
              const winner = stayedPlayers[0];
              console.log('[ENFORCE] 3-5-7: Single stayer detected, awarding leg to player', winner.id);
              
              await supabase
                .from('players')
                .update({ legs: (winner.legs || 0) + 1 })
                .eq('id', winner.id);
              
              // Check if they won the game
              const newLegs = (winner.legs || 0) + 1;
              if (newLegs >= game.legs_to_win) {
                console.log('[ENFORCE] 3-5-7: Player reached legs_to_win, transitioning to game_over');
                
                // Transition to game_over
                await supabase
                  .from('games')
                  .update({ 
                    status: 'game_over',
                    game_over_at: new Date().toISOString(),
                    awaiting_next_round: false,
                    all_decisions_in: true,
                  })
                  .eq('id', gameId);
                
                // Mark round as completed
                await supabase
                  .from('rounds')
                  .update({ status: 'completed' })
                  .eq('id', stuckRound.id);
                
                actionsTaken.push(`3-5-7 stuck recovery: Awarded leg to winner, game over (${newLegs} legs)`);
                
                // Return early - don't set awaiting_next_round since game is over
                return new Response(JSON.stringify({
                  success: true,
                  actionsTaken,
                  gameStatus: 'game_over',
                  timestamp: now.toISOString(),
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
              
              actionsTaken.push(`3-5-7 stuck recovery: Awarded leg to single stayer (now has ${newLegs} legs)`);
            }
          }
          
          // Mark round as completed and trigger next round
          await supabase
            .from('rounds')
            .update({ status: 'completed' })
            .eq('id', stuckRound.id);
          
          // Calculate next round number for 3-5-7 (cycles 1->2->3->1)
          const nextRoundNum = game.game_type === '3-5-7' 
            ? (stuckRound.round_number % 3) + 1 
            : (stuckRound.round_number || 1) + 1;
          
          // Set awaiting_next_round to trigger client-side progression
          await supabase
            .from('games')
            .update({ 
              awaiting_next_round: true,
              all_decisions_in: true,
              next_round_number: nextRoundNum,
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Stuck round recovery: Marked ${stuckRound.status} round ${stuckRound.round_number} as completed, set awaiting_next_round for round ${nextRoundNum}`);
        }
      }
    }

    // 4B. ENFORCE POST-ROUND COMPLETION RECOVERY (3-5-7)
    // If a round is already marked completed but the game never transitioned to awaiting_next_round,
    // the session can freeze indefinitely. This can happen if the client disconnects at the wrong time.
    if (
      game.status === 'in_progress' &&
      game.game_type === '3-5-7' &&
      game.awaiting_next_round !== true &&
      game.all_decisions_in === true
    ) {
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRound = latestRounds?.[0];

      if (latestRound?.status === 'completed') {
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();

        // Give the client a moment to set awaiting_next_round; if it doesn't, recover.
        if (stuckDuration > 10000) {
          const nextRoundNum = (latestRound.round_number % 3) + 1;

          await supabase
            .from('games')
            .update({
              awaiting_next_round: true,
              next_round_number: nextRoundNum,
              all_decisions_in: true,
            })
            .eq('id', gameId);

          actionsTaken.push(
            `3-5-7 post-round recovery: latest round ${latestRound.round_number} completed but awaiting_next_round missing, set awaiting_next_round for round ${nextRoundNum}`
          );
        }
      }
    }

    // 4C. ENFORCE POST-ROUND COMPLETION RECOVERY (HOLM)
    // Holm games can get stuck with round_status='completed' but awaiting_next_round=false.
    // This happens when endHolmRound errors mid-execution or client disconnects.
    // Unlike 3-5-7, we don't require all_decisions_in=true (it may be false if error occurred early).
    // Instead, check if ALL active (non-sitting-out) players have decision_locked=true.
    const isHolmGame = game.game_type === 'holm-game' || game.game_type === 'holm';
    if (
      game.status === 'in_progress' &&
      isHolmGame &&
      game.awaiting_next_round !== true
    ) {
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRound = latestRounds?.[0];

      // Check if round is completed (or stuck in processing/showdown for too long)
      if (latestRound && (latestRound.status === 'completed' || latestRound.status === 'showdown' || latestRound.status === 'processing')) {
        // For Holm, verify all active players have made decisions
        const { data: activePlayers } = await supabase
          .from('players')
          .select('id, decision_locked, current_decision, sitting_out')
          .eq('game_id', gameId)
          .eq('sitting_out', false);

        const allDecided = activePlayers?.every(p => p.decision_locked && p.current_decision !== null) ?? false;

        if (allDecided || latestRound.status === 'completed') {
          const gameUpdatedAt = new Date(game.updated_at);
          const stuckDuration = now.getTime() - gameUpdatedAt.getTime();

          // Give client time to handle; if stuck >15s, recover
          if (stuckDuration > 15000) {
            console.log('[ENFORCE] ⚠️ HOLM post-round recovery: round', latestRound.round_number, 'status=', latestRound.status, 'stuck for', Math.round(stuckDuration/1000), 's');

            // Mark round as completed if not already
            if (latestRound.status !== 'completed') {
              await supabase
                .from('rounds')
                .update({ status: 'completed' })
                .eq('id', latestRound.id);
            }

            // Set awaiting_next_round to trigger client-side progression
            // For Holm, next_round_number is just current + 1
            const nextRoundNum = (latestRound.round_number || 1) + 1;

            await supabase
              .from('games')
              .update({
                awaiting_next_round: true,
                all_decisions_in: true,
                next_round_number: nextRoundNum,
              })
              .eq('id', gameId);

            actionsTaken.push(
              `HOLM post-round recovery: round ${latestRound.round_number} (${latestRound.status}) stuck, set awaiting_next_round for hand ${nextRoundNum}`
            );
          }
        }
      }
    }

    // 5. ENFORCE AWAITING_NEXT_ROUND TIMEOUT (stuck game watchdog)
    // If a game has been stuck in awaiting_next_round=true for too long (>10 seconds),
    // it means client-side proceedToNextRound never fired. Auto-proceed server-side.
    if (game.status === 'in_progress' && game.awaiting_next_round === true && game.next_round_number) {
      // Check how long the game has been in this state by looking at updated_at
      const gameUpdatedAt = new Date(game.updated_at);
      const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
      
      // If stuck for more than 10 seconds (giving client 4s + buffer)
      if (stuckDuration > 10000) {
        console.log('[ENFORCE] ⚠️ Game stuck in awaiting_next_round for', Math.round(stuckDuration/1000), 'seconds - auto-proceeding');
        
        // Clear result and reset awaiting flag atomically (same as client-side proceedToNextRound)
        const { data: updateResult, error: updateError } = await supabase
          .from('games')
          .update({ 
            awaiting_next_round: false,
            next_round_number: null,
            last_round_result: null,
            all_decisions_in: false, // Reset for next round
          })
          .eq('id', gameId)
          .eq('awaiting_next_round', true)  // Only update if still awaiting (atomic guard)
          .select();
        
        if (updateError || !updateResult || updateResult.length === 0) {
          console.log('[ENFORCE] awaiting_next_round already cleared by another process');
          actionsTaken.push('awaiting_next_round watchdog: Another process already handled it');
        } else {
          const nextRoundNum = game.next_round_number;
          console.log('[ENFORCE] Cleared awaiting state, now starting round', nextRoundNum);
          
          // Get fresh player data for starting the round
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);
          
          const isHolmGame = game.game_type === 'holm-game';
          const isDiceGame = game.game_type === 'horses' || game.game_type === 'ship-captain-crew';
          
          // Dice games (Horses, Ship Captain Crew) manage their own state via horses_state in the round
          // and don't use the same round progression system. Skip the watchdog for these.
          if (isDiceGame) {
            console.log('[ENFORCE] Dice game detected, skipping awaiting_next_round watchdog (client manages state)', {
              gameId,
              gameType: game.game_type,
            });
            actionsTaken.push(`awaiting_next_round watchdog: Skipping dice game (${game.game_type}) - client manages state`);
          } else if (isHolmGame) {
            // For Holm games: Start the round server-side (just like we do for 3-5-7)
            // This ensures the game progresses even when no clients are connected
            
            // Get active players (not sitting out)
            const activePlayers = freshPlayers?.filter((p: any) => 
              p.status === 'active' && !p.sitting_out
            ) || [];
            
            if (activePlayers.length >= 2) {
              // Get game defaults for timer
              const { data: holmDefaults } = await supabase
                .from('game_defaults')
                .select('decision_timer_seconds')
                .eq('game_type', 'holm')
                .maybeSingle();
              
              const timerSeconds = (holmDefaults as any)?.decision_timer_seconds ?? 30;
              const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
              
              // Calculate buck position - rotate clockwise from current position
              const occupiedPositions = activePlayers.map((p: any) => p.position).sort((a: number, b: number) => a - b);
              let buckPosition = game.buck_position || occupiedPositions[0];
              
              // Rotate buck clockwise for next hand
              const currentBuckIndex = occupiedPositions.indexOf(buckPosition);
              if (currentBuckIndex !== -1) {
                const nextBuckIndex = (currentBuckIndex + 1) % occupiedPositions.length;
                buckPosition = occupiedPositions[nextBuckIndex];
              }
              
              // Clean up any existing round with same round_number
              const { data: existingHolmRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();
              
              if (existingHolmRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingHolmRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingHolmRound.id);
                await supabase.from('rounds').delete().eq('id', existingHolmRound.id);
              }
              
              // Deal cards
              const deck = shuffleDeck(createDeck());
              let cardIndex = 0;
              
              // Deal 4 community cards
              const communityCards = [
                deck[cardIndex++],
                deck[cardIndex++],
                deck[cardIndex++],
                deck[cardIndex++]
              ];
              
              // Get total_hands for hand_number
              const handNumber = (game.total_hands || 0) + 1;
              
              // Create the round
              const { data: newRound, error: holmRoundError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  cards_dealt: 4,
                  pot: game.pot || 0,
                  status: 'betting',
                  decision_deadline: decisionDeadline,
                  community_cards: communityCards,
                  community_cards_revealed: 2,
                  chucky_active: false,
                  current_turn_position: buckPosition,
                  hand_number: handNumber
                })
                .select()
                .single();
              
              if (holmRoundError || !newRound) {
                console.error('[ENFORCE] Failed to create Holm round:', holmRoundError);
                actionsTaken.push(`awaiting_next_round watchdog: Failed to create Holm round ${nextRoundNum}`);
              } else {
                // Deal 4 cards to each player
                for (const player of activePlayers) {
                  const playerCards = [
                    deck[cardIndex++],
                    deck[cardIndex++],
                    deck[cardIndex++],
                    deck[cardIndex++]
                  ];
                  
                  await supabase
                    .from('player_cards')
                    .insert({
                      player_id: player.id,
                      round_id: newRound.id,
                      cards: playerCards
                    });
                }
                
                // Reset player decisions
                await supabase
                  .from('players')
                  .update({ current_decision: null, decision_locked: false })
                  .eq('game_id', gameId);
                
                // Update game state
                await supabase
                  .from('games')
                  .update({
                    current_round: nextRoundNum,
                    buck_position: buckPosition,
                    all_decisions_in: false,
                    last_round_result: null,
                    is_first_hand: false,
                    total_hands: handNumber
                  })
                  .eq('id', gameId);
                
                actionsTaken.push(`awaiting_next_round watchdog: Started Holm round ${nextRoundNum} (hand #${handNumber}) with ${activePlayers.length} players, buck at position ${buckPosition}`);
                console.log('[ENFORCE] ✅ Successfully started Holm round server-side:', {
                  gameId,
                  roundNumber: nextRoundNum,
                  handNumber,
                  buckPosition,
                  playerCount: activePlayers.length
                });
              }
            } else {
              // Not enough players - return to waiting state
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  awaiting_next_round: false,
                  next_round_number: null
                })
                .eq('id', gameId);
              actionsTaken.push('awaiting_next_round watchdog: Not enough Holm players, returning to waiting');
            }
          } else {
            // For 3-5-7: Start the round directly server-side
            // This matches what client's proceedToNextRound -> startRound does
            
            // Get active players (anted up and not sitting out)
            const activePlayers = freshPlayers?.filter(p => 
              p.ante_decision === 'ante_up' && !p.sitting_out
            ) || [];
            
            if (activePlayers.length >= 2) {
              // Get game defaults for timer
              const { data: gameDefaults } = await supabase
                .from('game_defaults')
                .select('decision_timer_seconds')
                .eq('game_type', '3-5-7')
                .maybeSingle();
              
              const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
              const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
              
              // Create the round
              const cardsForRound = nextRoundNum === 1 ? 3 : nextRoundNum === 2 ? 5 : 7;

              // IMPORTANT: rounds has a unique constraint on (game_id, round_number).
              // Before inserting, delete any existing round with the same round_number.
              // Without this, the watchdog can error and the game will appear "frozen".
              const { data: existingRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();

              if (existingRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingRound.id);
                await supabase.from('rounds').delete().eq('id', existingRound.id);
              }

              const { error: roundInsertError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  cards_dealt: cardsForRound,
                  pot: game.pot || 0,
                  status: 'betting',
                  decision_deadline: decisionDeadline,
                });

              if (roundInsertError) {
                console.error('[ENFORCE] Failed to insert watchdog round:', {
                  gameId,
                  nextRoundNum,
                  error: roundInsertError,
                });
                actionsTaken.push(`awaiting_next_round watchdog: Failed to insert round ${nextRoundNum} (${roundInsertError.message})`);
              } else {
                // Update game current_round
                await supabase
                  .from('games')
                  .update({ current_round: nextRoundNum })
                  .eq('id', gameId);
              }
              
              // Reset player decisions for new round
              await supabase
                .from('players')
                .update({ current_decision: null, decision_locked: false })
                .eq('game_id', gameId)
                .eq('ante_decision', 'ante_up');
              
              // Deal cards (simplified - just create records, client will fetch)
              // Note: For a more complete implementation, we'd generate cards here
              // For now, let client-side logic handle card generation on next fetch
              
              actionsTaken.push(`awaiting_next_round watchdog: Started 3-5-7 round ${nextRoundNum} with ${activePlayers.length} players`);
            } else {
              actionsTaken.push('awaiting_next_round watchdog: Not enough players to start round');
            }
          }
        }
      } else {
        console.log('[ENFORCE] Game awaiting_next_round for', Math.round(stuckDuration/1000), 's (waiting for client, threshold: 10s)');
      }
    }

    // 6. ENFORCE GAME OVER COUNTDOWN (session ending after game)
    if (game.status === 'game_over' && game.game_over_at) {
      const gameOverAt = new Date(game.game_over_at);
      const gameOverDeadline = new Date(gameOverAt.getTime() + 8000); // 8 seconds countdown
      
      if (now > gameOverDeadline && !game.pending_session_end) {
        console.log('[ENFORCE] Game over countdown expired for game', gameId);
        // Don't automatically progress - let clients handle this via onComplete
        // This just logs that it should have progressed
        actionsTaken.push('Game over countdown expired - clients should have handled progression');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      actionsTaken,
      gameStatus: game.status,
      timestamp: nowIso,
      debugSnapshot: (body?.debug === true ? debugSnapshot : undefined),
      source: (body?.source ?? 'unknown'),
      requestId: (typeof body?.requestId === 'string' ? body.requestId : null),
      debugLabel: (typeof body?.debugLabel === 'string' ? body.debugLabel : null),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ENFORCE DEADLINES] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});