import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank, formatHandRankDetailed, has357Hand } from "./cardUtils";
import {
  buildAdvance357CardAssignments,
  cardsDealtForRound,
  type EligiblePlayer,
} from "./threeFiveSeven/advanceRound";
import { readDebugHarness } from "./debugHarness/useDebugHarness";
// detectAndSettleInstantWin357 was retired from the R1 seam path — the
// instant-357 sweep is now settled inside the `advance_357_round` RPC
// transaction. The helper remains available for the legacy bootstrap
// deal path in `startRound`, imported lazily there if needed.
import { resolveSessionHostPlayerId } from "./debugHarness/resolveHarnessHost";
import {
  // isTargetedWartimePreflightReadyForHarness — no longer imported here; caller owns preflight
  emitWartime,
  withDbMutationCorrelation as __withWartimeDbMutationCorrelation,
  registerActualEmitterInvocation as __wartimeRegisterEmitterGL,
  registerWartimeProductionHook as __wartimeRegisterHookGL,
  SRC as WARTIME_SRC,
} from "./threeFiveSeven/wartime";
import {
  emitH1r3ToH2r1 as __emitH1r3H2r1,
  noteH2r1RoundIdentitySelected as __noteH2r1Selected,
} from "./threeFiveSeven/wartime/h1r3ToH2r1";

// 3-5-7 Wartime — canonical production owner for db.mutation.correlation.
// gameLogic.ts contains the 3-5-7 round/ante/deal/settlement mutations.
// withDbMutationCorrelation wraps each real Supabase call site.
__wartimeRegisterHookGL({
  requirementId: 'db.mutation.correlation',
  sourceSiteId: WARTIME_SRC.DB_MUTATION_CORRELATION.id,
  sourceFile: 'src/lib/gameLogic.ts',
  sourceFunction: 'gameLogic.dbMutations',
});
__wartimeRegisterEmitterGL('db.mutation.correlation', WARTIME_SRC.DB_MUTATION_CORRELATION.id);
__wartimeRegisterHookGL({
  requirementId: 'db.mutation.correlation',
  sourceSiteId: WARTIME_SRC.DB_RECORD_RESULT_INSTANT_WIN.id,
  sourceFile: 'src/lib/gameLogic.ts',
  sourceFunction: 'instant-win recordGameResult correlation call site',
});
__wartimeRegisterEmitterGL('db.mutation.correlation', WARTIME_SRC.DB_RECORD_RESULT_INSTANT_WIN.id);
__wartimeRegisterHookGL({
  requirementId: 'db.mutation.correlation',
  sourceSiteId: WARTIME_SRC.DB_SNAPSHOT_CHIPS_INSTANT_WIN.id,
  sourceFile: 'src/lib/gameLogic.ts',
  sourceFunction: 'instant-win snapshotPlayerChips correlation call site',
});
__wartimeRegisterEmitterGL('db.mutation.correlation', WARTIME_SRC.DB_SNAPSHOT_CHIPS_INSTANT_WIN.id);

/** Deterministic 3-5-7 instant-win forced hand (matches has357Hand contract). */
const FORCED_357_CARDS: Card[] = [
  { rank: '3', suit: '♣' },
  { rank: '5', suit: '♦' },
  { rank: '7', suit: '♥' },
];

/** Persistent 3-5-7 instant-win diagnostic — writes to debug_events (best-effort). */
async function trace357InstantWin(
  eventType: string,
  gameId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('debug_events').insert({
      event_type: `357.instant_win.${eventType}`,
      game_id: gameId,
      round_id: (payload.roundId as string | undefined) ?? null,
      payload: payload as any,
    });
  } catch { /* diagnostic-only */ }
}
import { getBotAlias } from "./botAlias";
import { logPlayerDecision, logGameState, logRaceConditionGuard, logStatusChange, logDiceEvent, logAllDecisionsIn } from "./gameStateDebugLog";
import { persistTransition } from "./persistSyncDebugEvent";
import { emit357InstantWinTerminal } from "./threeFiveSeven/instantWinLifecycle";
import {
  playerToPlayer,
  playerToPot,
  potToPlayer,
  settleGameplayChipTransfers,
} from "./gameplayChipTransfers";


/**
 * Canonical snapshot identity resolver.
 *
 * `session_player_snapshots` is keyed on
 * (game_id, dealer_game_id, hand_number, player_id) — `hand_number` restarts
 * at 1 for every dealer game, so the dealer game is a mandatory part of the
 * identity. `games.current_game_uuid` is the authoritative current
 * `dealer_games.id` for the session.
 */
async function resolveDealerGameId(
  gameId: string,
  dealerGameId?: string | null,
): Promise<string | null> {
  if (dealerGameId) return dealerGameId;
  const { data } = await supabase
    .from('games')
    .select('current_game_uuid')
    .eq('id', gameId)
    .maybeSingle();
  const resolved = (data?.current_game_uuid as string | null) ?? null;
  if (!resolved) {
    // Legitimate only before the session's first dealer game exists (e.g. a
    // lobby-phase departure). Any financial snapshot boundary with an active
    // dealer game must resolve non-null; a null here degrades to the legacy
    // identity and is therefore surfaced rather than written silently.
    console.warn('[SNAPSHOT] No dealer game resolved — writing legacy null identity', { gameId });
  }
  return resolved;
}

/**
 * Snapshot all players' chip counts after a hand completes.
 * This is used for accurate session results and for restoring chips when departed players rejoin.
 *
 * Idempotent at the database level: the unique index
 * `session_player_snapshots_dealer_hand_participant_key` makes a replay of the
 * same authoritative hand a no-op, while a later dealer game reusing the same
 * `hand_number` is a distinct identity and always writes.
 */
export async function snapshotPlayerChips(
  gameId: string,
  handNumber: number,
  dealerGameId?: string | null,
) {
  const resolvedDealerGameId = await resolveDealerGameId(gameId, dealerGameId);
  console.log('[SNAPSHOT] Snapshotting player chips for game:', gameId, 'dealerGame:', resolvedDealerGameId, 'hand:', handNumber);
  
  // Fetch all players with their profiles for username
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, chips, is_bot, created_at, profiles(username)')
    .eq('game_id', gameId);
  
  if (playersError || !players) {
    console.error('[SNAPSHOT] Error fetching players:', playersError);
    return;
  }
  
  // Build snapshot records
  const snapshots = players.map(player => {
    // Get username - for bots use alias, for humans use profile username
    let username = 'Unknown';
    if (player.is_bot) {
      username = getBotAlias(players, player.user_id);
    } else if (player.profiles && typeof player.profiles === 'object' && 'username' in player.profiles) {
      username = (player.profiles as { username: string }).username || 'Unknown';
    }
    
    return {
      game_id: gameId,
      dealer_game_id: resolvedDealerGameId,
      player_id: player.id,
      user_id: player.user_id,
      username,
      chips: player.chips,
      is_bot: player.is_bot,
      hand_number: handNumber
    };
  });
  
  if (snapshots.length === 0) {
    console.log('[SNAPSHOT] No players to snapshot');
    return;
  }
  
  const { error: insertError } = resolvedDealerGameId
    ? await supabase
        .from('session_player_snapshots')
        .upsert(snapshots, {
          onConflict: 'game_id,dealer_game_id,hand_number,player_id',
          ignoreDuplicates: true,
        })
    : await supabase.from('session_player_snapshots').insert(snapshots);
  
  if (insertError) {
    console.error('[SNAPSHOT] Error inserting snapshots:', insertError);
  } else {
    console.log('[SNAPSHOT] Successfully snapshotted', snapshots.length, 'players');
  }
}

/**
 * Snapshot a single player's chips when they leave mid-session.
 * This ensures their final chip balance is captured for accurate session results.
 *
 * Conflict behavior is DO NOTHING (`ignoreDuplicates: true`), never DO UPDATE.
 * Financial boundary: a snapshot already present for this exact
 * (game, dealer game, hand, participant) identity is the post-settlement
 * authoritative balance for that hand, and departure itself moves no chips, so
 * the existing row must not be degraded. A departure after further play lands
 * on a later `hand_number` and therefore writes its own row.
 * (`session_player_snapshots` also has no UPDATE RLS policy, so a DO UPDATE
 * upsert from the client would be rejected outright.)
 */
export async function snapshotDepartingPlayer(
  gameId: string, 
  playerId: string, 
  userId: string, 
  chips: number, 
  username: string,
  isBot: boolean
) {
  console.log('[SNAPSHOT] Snapshotting departing player:', username, 'chips:', chips);
  
  // Get the current hand number from the game's total_hands
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('total_hands, current_game_uuid')
    .eq('id', gameId)
    .maybeSingle();
  
  if (gameError || !game) {
    console.error('[SNAPSHOT] Error fetching game for departing snapshot:', gameError);
    return;
  }
  
  const handNumber = game.total_hands || 0;
  const dealerGameId = (game.current_game_uuid as string | null) ?? null;
  
  const row = {
    game_id: gameId,
    dealer_game_id: dealerGameId,
    player_id: playerId,
    user_id: userId,
    username,
    chips,
    is_bot: isBot,
    hand_number: handNumber
  };

  const { error: insertError } = dealerGameId
    ? await supabase
        .from('session_player_snapshots')
        .upsert(row, {
          onConflict: 'game_id,dealer_game_id,hand_number,player_id',
          ignoreDuplicates: true,
        })
    : await supabase.from('session_player_snapshots').insert(row);
  
  if (insertError) {
    console.error('[SNAPSHOT] Error inserting departing player snapshot:', insertError);
  } else {
    console.log('[SNAPSHOT] Successfully snapshotted departing player:', username);
  }
}


/**
 * Get the last known chip count for a user in a session (for rejoining players)
 */
export async function getLastKnownChips(gameId: string, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('session_player_snapshots')
    .select('chips')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('[SNAPSHOT] Error fetching last known chips:', error);
    return null;
  }
  
  return data?.chips ?? null;
}

/**
 * Record a game result for hand history tracking
 */
export async function recordGameResult(
  gameId: string,
  handNumber: number,
  winnerPlayerId: string | null,
  winnerUsername: string,
  winningHandDescription: string | null,
  potWon: number,
  playerChipChanges: Record<string, number>,
  isChopped: boolean = false,
  gameType?: string | null,
  dealerGameId?: string | null
) {
  console.log('[GAME RESULT] Recording game result:', {
    gameId,
    handNumber,
    winnerUsername,
    winningHandDescription,
    potWon,
    isChopped,
    gameType,
    dealerGameId
  });
  
  const { error } = await supabase
    .from('game_results')
    .insert({
      game_id: gameId,
      hand_number: handNumber,
      winner_player_id: winnerPlayerId,
      winner_username: winnerUsername,
      winning_hand_description: winningHandDescription,
      pot_won: potWon,
      player_chip_changes: playerChipChanges,
      is_chopped: isChopped,
      game_type: gameType || null,
      dealer_game_id: dealerGameId || null
    });

  if (error) {
    console.error('[GAME RESULT] Error recording game result:', error);
    return { error };
  }
  console.log('[GAME RESULT] Successfully recorded game result');
  return { error: null };
}

async function settleThreeFiveSevenTerminal(
  gameId: string,
  roundId: string,
  dealerGameId: string,
  handNumber: number,
) {
  const { data, error } = await supabase.rpc('three_five_seven_settle_game', {
    p_game_id: gameId,
    p_round_id: roundId,
    p_dealer_game_id: dealerGameId,
    p_hand_number: handNumber,
  });

  if (error) throw error;
  return data;
}

export async function startRound(gameId: string, roundNumber: number) {
  console.log('[START_ROUND] Starting round', roundNumber, 'for game', gameId);

  // 3-5-7 bootstrap is one database transaction. The committed round is
  // returned to the initiating browser; Realtime only synchronizes peers.
  if (roundNumber !== 1) {
    throw new Error('three_five_seven_begin_game requires opening round 1');
  }
  const { data: authorityResult, error: authorityError } = await supabase.rpc(
    'three_five_seven_begin_game' as any,
    { p_game_id: gameId } as any,
  );
  if (authorityError) throw authorityError;
  return authorityResult;
  
  // PARALLEL: Fetch game config + defaults (players are fetched AFTER we reset statuses)
  const [gameConfigResult, gameDefaultsResult] = await Promise.all([
    supabase
      .from('games')
      .select('ante_amount, leg_value, status, current_round, total_hands, pot, current_game_uuid, game_over_at, game_type, current_host, dealer_position')
      .eq('id', gameId)
      .single(),
    supabase
      .from('game_defaults')
      .select('decision_timer_seconds')
      .eq('game_type', '3-5-7')
      .maybeSingle()
  ]);

  const gameConfig = gameConfigResult.data;
  const gameDefaults = gameDefaultsResult.data;

  // P0 CONTAINMENT (CRIB-CORRUPT-01): startRound is the 3-5-7 round-creation path.
  // It must NEVER fire against another game type — doing so inserts spurious round
  // rows (e.g. round_number=2 reusing the current hand_number) into a game whose
  // own round-creation logic only uses round_number=1, bypassing the unique
  // (dealer_game_id, hand_number, round_number) lock and corrupting live state.
  const gt = (gameConfig as any)?.game_type;
  const is357 = gt === '3-5-7' || gt === '3-5-7-game' || gt === '357';
  if (gameConfig && !is357) {
    logRaceConditionGuard(gameId, 'gameLogic:startRound', 'BLOCKED_NON_357_GAME_TYPE', {
      roundNumber,
      gameType: gt ?? null,
      dealerGameId: (gameConfig as any)?.current_game_uuid ?? null,
    });
    console.warn('[START_ROUND] startRound-suppressed-non-357 — refusing to create round for game_type=', gt);
    return;
  }

  // CRITICAL GUARD: Block round creation if game is already over or ended
  if (gameConfig?.status === 'game_over' || gameConfig?.status === 'session_ended') {
    logRaceConditionGuard(gameId, 'gameLogic:startRound', 'BLOCKED_GAME_OVER', {
      roundNumber,
      currentStatus: gameConfig?.status,
      gameOverAt: gameConfig?.game_over_at,
      dealerGameId: gameConfig?.current_game_uuid,
    });
    console.warn('[START_ROUND] Blocked - game is in terminal state:', gameConfig?.status);
    return;
  }

  // Prevent starting if already in progress with this round
  if (gameConfig?.status === 'in_progress' && gameConfig?.current_round === roundNumber) {
    logRaceConditionGuard(gameId, 'gameLogic:startRound', 'ROUND_ALREADY_IN_PROGRESS', {
      roundNumber,
      currentRound: gameConfig?.current_round,
    });
    console.log('[START_ROUND] Round', roundNumber, 'already in progress, skipping');
    return;
  }

  // Wartime preflight is owned by the CALLER (see `handleAllAnteDecisionsIn`
  // in Game.tsx). `startRound` must not repeat the preflight — a
  // second gate here would either double-block or (if bypassed) allow
  // partial mutation ambiguity. There is one preflight owner, and one
  // canonical round-start owner (this function).





  // Instant-win terminal diagnostics only (fire-and-forget). Wartime
  // lifecycle instrumentation has been retired — do NOT reintroduce
  // begin/complete-around-every-op tracing here.

  const anteAmount = gameConfig?.ante_amount || 1;
  const legValue = gameConfig?.leg_value || 1;
  const currentGameUuid = gameConfig?.current_game_uuid || null;
  const cardsToDeal = roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7;
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 10;

  // NOTE: We no longer delete old rounds - they are preserved for hand history
  // The card rendering now uses dealer_game_id + round_number to prevent stale card matching
  console.log('[START_ROUND] Preserving existing rounds for hand history');

  // IMPORTANT (CONCURRENCY): We only reset players + charge antes + deal cards if THIS client
  // wins the round creation lock. Losing clients must not reset decisions mid-round.
  let initialPot = 0;
  
  // timerSeconds already fetched in parallel at start
  console.log('[START_ROUND] Using decision timer:', timerSeconds, 'seconds');

  // 3-5-7 HAND MODEL:
  // hand_number increments ONLY when starting a NEW Round 1.
  // Rounds 1/2/3 share the same hand_number.
  const currentHandNumber = typeof gameConfig?.total_hands === 'number' ? gameConfig.total_hands : 0;
  const handNumber = roundNumber === 1 ? currentHandNumber + 1 : (currentHandNumber || 1);

  // Create round with configured deadline (accounts for ~2s of processing/fetch time)
  const deadline = new Date(Date.now() + (timerSeconds + 2) * 1000);

  // 3-5-7 HAND-OPENING LEGS SNAPSHOT
  // ---------------------------------
  // Populated ONLY on the canonical Round 1 insert for a 3-5-7 hand.
  // This is the immutable authoritative source for instant-357 Sweep
  // the Legs eligibility downstream (see terminalDescriptor.ts).
  //
  // Race-loser behavior: the race-losing INSERT never reaches the DB
  // (unique index on (dealer_game_id, hand_number, round_number)), so
  // no overwrite is possible. Losing callers refetch the winner's row
  // in the error branch below and inherit the winner's snapshot.
  //
  // Roster source: `startRound` has no prior authoritative fetch of
  // `players` in-scope at this point, so one scoped read is performed
  // here. This is the same roster predicate used by later ante/deal
  // steps in the winning branch.
  let three57LegsAtStart: Array<{ player_id: string; position: number; legs: number }> | null = null;
  if (is357 && roundNumber === 1) {
    const { data: rosterAtStart } = await supabase
      .from('players')
      .select('id, position, legs')
      .eq('game_id', gameId);
    three57LegsAtStart = (rosterAtStart ?? []).map((p: any) => ({
      player_id: p.id as string,
      position: Number(p.position ?? 0),
      legs: Number(p.legs ?? 0),
    }));
  }

  // CRITICAL: Use INSERT-AS-LOCK pattern with unique constraint on (game_id, hand_number, round_number)
  // The unique index prevents duplicate rounds - only ONE client can successfully insert.
  // That winning client is the ONLY one that charges antes, updates pot, etc.
  const { data: insertedRound, error: roundInsertError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: roundNumber,
      cards_dealt: roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7,
      status: 'betting',
      pot: 0, // Will be updated after ante collection
      decision_deadline: deadline.toISOString(),
      hand_number: handNumber,
      dealer_game_id: currentGameUuid,
      ...(three57LegsAtStart !== null
        ? { three_five_seven_legs_at_start: three57LegsAtStart as any }
        : {}),
    })
    .select()
    .single();

  // Check if this client won the race to create the round
  if (roundInsertError) {
    // Unique constraint violation or other error - another client already created the round
    logRaceConditionGuard(gameId, 'gameLogic:startRound', 'ROUND_INSERT_RACE_LOST', {
      roundNumber,
      handNumber,
      error: roundInsertError.message,
      dealerGameId: currentGameUuid,
    });
    console.log('[START_ROUND] ⚠️ Round already exists (race lost or error):', roundInsertError.message);
    
    // Fetch the existing round so we can still return it (for callers that need round data)
    const { data: existingRound } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      // CRITICAL: Must scope to the active dealer game; round_number/hand_number repeat across dealer games in a session
      .eq('dealer_game_id', currentGameUuid)
      .eq('round_number', roundNumber)
      .eq('hand_number', handNumber)
      .maybeSingle();
    
    if (existingRound) {
      console.log('[START_ROUND] Returning existing round created by winner:', existingRound.id);
      return existingRound;
    }
    
    // If we can't find the round, throw error
    throw new Error(`Failed to create or find round: ${roundInsertError.message}`);
  }

  // This client WON the race - we are the only one that will charge antes
  logGameState({
    gameId,
    dealerGameId: currentGameUuid,
    roundId: insertedRound.id,
    eventType: 'ROUND_CREATED',
    currentRound: roundNumber,
    totalHands: handNumber,
    sourceLocation: 'gameLogic:startRound:wonRace',
    details: {
      cardsToDeal,
      timerSeconds,
      anteAmount,
    },
  });
  console.log('[START_ROUND] ✅ WON round creation race for round', roundNumber, 'id:', insertedRound.id);

  // ── H1R3 → H2R1 targeted trace: authoritative round-identity selection.
  try {
    if (is357 && handNumber >= 2 && roundNumber === 1) {
      __noteH2r1Selected(currentGameUuid ?? null);
    }
    __emitH1r3H2r1({
      eventName: 'h2r1.round_identity_selected',
      sourceSiteId: WARTIME_SRC.H2R1_ROUND_IDENTITY_SELECTED.id,
      identity: {
        gameId, dealerGameId: currentGameUuid ?? null, roundId: insertedRound.id,
        handNumber, roundNumber, currentGameUuid: currentGameUuid ?? null,
        currentRoundId: insertedRound.id,
        currentRoundStatus: (insertedRound as any)?.status ?? 'betting',
      },
      payload: {
        inserted: true, reused: false, expectedCardCount: cardsToDeal,
        callerAnchor: 'gameLogic.startRound.wonRace',
        deckShuffleAtRound: null,
      },
      forceEmit: is357 && handNumber >= 2 && roundNumber === 1,
    });
  } catch { /* fire-and-forget */ }

  // Reset all players to active for the new round (winner only)
  // SCOPED: must NOT revive status='left' (stood-up players are terminal until they
  // explicitly sit again) or 'observer'. sitting_out players keep their flag; only
  // their per-decision state is cleared.
  const { error: resetError } = await supabase
    .from('players')
    .update({
      current_decision: null,
      decision_locked: false,
      status: 'active',
    })
    .eq('game_id', gameId)
    .neq('status', 'left')
    .neq('status', 'observer');

  if (resetError) {
    console.error('[START_ROUND] Failed to reset players:', resetError);
  }

  // Fetch players AFTER the reset so we don't use stale fold/decision state
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('position');

  if (playersError) {
    console.error('[START_ROUND] Error fetching players:', playersError);
    throw new Error(`Failed to fetch players: ${playersError.message}`);
  }

  if (!players || players.length === 0) {
    throw new Error('No players found in game');
  }

  // Deal to all non-sitting-out, non-observer, non-left players.
  const activePlayers = players.filter((p) => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
  console.log('[START_ROUND] Players eligible for dealing:', {
    roundNumber,
    totalPlayers: players.length,
    activeCount: activePlayers.length,
    active: activePlayers.map((p) => ({ id: p.id, position: p.position, status: p.status, sitting_out: p.sitting_out })),
  });
  
  // The client-owned opening path collects the one initial ante. Subsequent
  // R3 -> next-hand R1 rollovers use advance_357_round instead.
  if (roundNumber === 1) {
    console.log('[START_ROUND] Charging antes. Players:', activePlayers.map(p => ({ id: p.id, position: p.position, chips_before: p.chips, is_bot: p.is_bot })));
    
    // Calculate total pot from active players
    initialPot = activePlayers.length * anteAmount;
    
    // BATCH: Charge all antes in a single RPC call instead of sequential updates
    const playerIds = activePlayers.map(p => p.id);
    console.log('[START_ROUND] Batch charging', playerIds.length, 'players $', anteAmount, 'each');
    
    let anteError: unknown = null;
    try {
      await settleGameplayChipTransfers(
        gameId,
        playerIds.map((playerId) => playerToPot(playerId, anteAmount)),
        'ante',
      );
    } catch (error) {
      anteError = error;
    }

    if (anteError) {
      console.error('[START_ROUND] Error batch charging antes:', anteError);
      // RPC failed - log but don't use non-atomic fallback which causes accounting drift
    } else {
      // CRITICAL: Record ante deductions in game_results to maintain zero-sum accounting
      // Each player's ante payment is tracked as a negative chip change
      const anteChipChanges: Record<string, number> = {};
      for (const player of activePlayers) {
        anteChipChanges[player.id] = -anteAmount;
      }
      
      // Fire-and-forget: Record antes as a game result entry (audit trail only)
      recordGameResult(
        gameId,
        handNumber,
        null, // no winner - this is ante collection
        'Ante', // Description
        `${activePlayers.length} players anted $${anteAmount}`,
        0, // pot_won is 0 - this is money going INTO the pot
        anteChipChanges,
        false,
        '357', // game_type
        currentGameUuid // dealer_game_id
      );
      console.log('[START_ROUND] Recorded ante chip changes in game_results:', anteChipChanges);
    }
    
    console.log('[START_ROUND] Total ante pot:', initialPot);
  }

  // Get current pot and update game state + pot atomically
  const { data: currentGameForPot } = await supabase
    .from('games')
    .select('pot')
    .eq('id', gameId)
    .single();
  
  const currentPot = currentGameForPot?.pot || 0;
  
  // Build game update object - CRITICAL: use insertedRound values to prevent drift
  // This ensures games.current_round/total_hands always match the actual round record
  const gameUpdate: Record<string, unknown> = {
    current_round: insertedRound.round_number, // Use inserted row, not local variable
    all_decisions_in: false,
    all_decisions_in_round_id: null, // F5.1: clear scoping when starting a new round
    // Ante transfers already updated the pot in their financial transaction.
    // This lifecycle write must not apply the same money a second time.
    pot: currentPot,
    // CRITICAL: Clear stale deadlines from config/ante phases so cron doesn't enforce them mid-game
    config_deadline: null,
    ante_decision_deadline: null,
  };

  // Only bump hand count when starting Round 1 of a new hand
  if (insertedRound.round_number === 1) {
    gameUpdate.total_hands = insertedRound.hand_number; // Use inserted row, not local variable
  }
  
  const { error: gameUpdateError } = await supabase
    .from('games')
    .update(gameUpdate)
    .eq('id', gameId);
  
  if (gameUpdateError) {
    console.error('[START_ROUND] Failed to update game state:', gameUpdateError);
    throw new Error(`Failed to update game state: ${gameUpdateError.message}`);
  }
  
  console.log('[START_ROUND] Game state updated:', {
    current_round: insertedRound.round_number,
    all_decisions_in: false,
    all_decisions_in_round_id: null,
    pot: currentPot,
    total_hands: insertedRound.round_number === 1 ? insertedRound.hand_number : currentHandNumber,
  });
  
  // Update round pot to reflect the ante collection
  if (initialPot > 0) {
    await supabase
      .from('rounds')
      .update({ pot: initialPot })
      .eq('id', insertedRound.id);
  }
  
  // Use the inserted round from here on
  const round = insertedRound;

  // Deal cards - create deck and remove already dealt cards
  let deck = shuffleDeck(createDeck());
  let cardIndex = 0;

  // Get previous round cards if this isn't round 1 (of the current 3-5-7 game)
  // CRITICAL: Use dealer_game_id to ensure we only get cards from THIS game, not previous games
  let previousRoundCards: Map<string, Card[]> = new Map();
  let alreadyDealtCards: Card[] = [];
  
  if (roundNumber > 1 && currentGameUuid) {
    const previousRoundNumber = roundNumber - 1;
    const { data: previousRound } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId)
      .eq('dealer_game_id', currentGameUuid)  // Only from current 3-5-7 game
      .eq('hand_number', handNumber)          // Only from current HAND within the game
      .eq('round_number', previousRoundNumber)
      .maybeSingle();

    if (previousRound) {
      const { data: previousCards } = await supabase
        .from('player_cards')
        .select('*')
        .eq('round_id', previousRound.id);

      if (previousCards) {
        previousCards.forEach(pc => {
          const cards = pc.cards as unknown as Card[];
          previousRoundCards.set(pc.player_id, cards);
          // Track all cards already dealt
          alreadyDealtCards.push(...cards);
        });
      }
    }
  }
  
  // Remove already dealt cards from the deck
  if (alreadyDealtCards.length > 0) {
    deck = deck.filter(card => {
      return !alreadyDealtCards.some(dealt => 
        dealt.suit === card.suit && dealt.rank === card.rank
      );
    });
    console.log('[START_ROUND] Removed', alreadyDealtCards.length, 'already dealt cards, deck now has', deck.length, 'cards');
  }

  const newCardsToDeal = roundNumber === 1 ? 3 : 2; // Round 1 gets 3, rounds 2 & 3 get 2 new cards

  // ── 3-5-7 INSTANT DEALER WIN HARNESS (admin-only Harness Profile) ──
  // When Game Defaults → Debug Harness Profile for '3-5-7' is set to
  // 'instant_win', force the ROUND 1 DEALER OF THE ACTIVE DEALER GAME
  // to receive 3♣ 5♦ 7♥. Prior implementation targeted the canonical
  // session host, which is invariant across dealer games — Dealer Game
  // 2 of a Cross Country session then failed because host ≠ dealer.
  // Detection still runs through the unchanged has357Hand path below
  // — the rule under test is NOT bypassed. The instrumentation payload
  // reports BOTH the actual harness target (dealer of DG) and the
  // session host so future traces remain unambiguous.
  let harnessInstantWinActive = false;
  let harnessTargetPlayerId: string | null = null;
  const forcedCardsByPlayer = new Map<string, Card[]>();
  if (roundNumber === 1) {
    const harnessId = await readDebugHarness('3-5-7');
    if (harnessId === 'instant_win') {
      // Preflight already validated in pre-mutation gate above. No
      // second readiness check here — a duplicate gate at this point
      // (after ante charge / round insert) can only strand the game.
      const sessionHostPlayerId = resolveSessionHostPlayerId(
        { current_host: (gameConfig as any)?.current_host ?? null },
        activePlayers.map((p) => ({
          id: p.id,
          user_id: (p as any).user_id ?? null,
          is_bot: (p as any).is_bot ?? null,
          created_at: (p as any).created_at ?? null,
        })),
      );
      // Round 1 dealer of the CURRENT dealer_game: player whose position
      // matches games.dealer_position. Falls back to session host only if
      // dealer_position is missing or no active player occupies it.
      const dealerPos = (gameConfig as any)?.dealer_position ?? null;
      const dealerPlayer = dealerPos != null
        ? activePlayers.find((p) => (p as any).position === dealerPos) ?? null
        : null;
      harnessTargetPlayerId = dealerPlayer?.id ?? sessionHostPlayerId;
      if (harnessTargetPlayerId) {
        harnessInstantWinActive = true;
        const forced = FORCED_357_CARDS;
        forcedCardsByPlayer.set(harnessTargetPlayerId, forced);
        deck = deck.filter(c => !forced.some(f => f.rank === c.rank && f.suit === c.suit));
        await trace357InstantWin('harness.override_applied', gameId, {
          harnessId,
          targetPlayerId: harnessTargetPlayerId,
          sessionHostPlayerId,
          dealerPosition: dealerPos,
          resolvedFrom: dealerPlayer ? 'dealer_position' : 'session_host_fallback',
          forcedCards: forced,
          roundId: round.id,
          handNumber,
          dealerGameId: currentGameUuid,
        });
      } else {
        await trace357InstantWin('harness.override_skipped_no_host', gameId, {
          harnessId,
          sessionHostPlayerId,
          dealerPosition: dealerPos,
          activePlayerIds: activePlayers.map(p => p.id),
        });
      }
    }
  }



  // BATCH: Prepare all player cards for a single insert
  const playerCardInserts: Array<{ player_id: string; round_id: string; cards: any }> = [];

  for (const player of activePlayers) {
    // Get existing cards from previous round (if any)
    const existingCards = previousRoundCards.get(player.id) || [];

    // Deal new cards from deck — or use forced cards if harness is active.
    let newCards: Card[];
    const forcedForPlayer = forcedCardsByPlayer.get(player.id);
    if (forcedForPlayer && existingCards.length === 0 && roundNumber === 1) {
      newCards = forcedForPlayer;
    } else {
      newCards = deck.slice(cardIndex, cardIndex + newCardsToDeal);
      cardIndex += newCardsToDeal;
    }
    const playerCards = [...existingCards, ...newCards];

    playerCardInserts.push({
      player_id: player.id,
      round_id: round.id,
      cards: playerCards as any
    });
  }

  // (Retired) per-step deal instrumentation — do NOT add begin/complete emits.

  // Single batch insert for all player cards
  if (playerCardInserts.length > 0) {
    const insertRes = await supabase
      .from('player_cards')
      .insert(playerCardInserts);

    if (insertRes.error) {
      console.error('[START_ROUND] Error batch inserting cards:', insertRes.error);
      throw new Error(`Failed to deal cards: ${insertRes.error.message}`);
    }
    console.log('[START_ROUND] Batch dealt cards to', playerCardInserts.length, 'players');

    // ── H1R3 → H2R1 targeted trace: authoritative server-deal commit.
    try {
      __emitH1r3H2r1({
        eventName: 'h2r1.server_deal_committed',
        sourceSiteId: WARTIME_SRC.H2R1_SERVER_DEAL_COMMITTED.id,
        identity: {
          gameId, dealerGameId: currentGameUuid ?? null, roundId: round.id,
          handNumber, roundNumber, currentGameUuid: currentGameUuid ?? null,
          currentRoundId: round.id,
        },
        payload: {
          expectedCardCount: roundNumber === 1 ? 3 : roundNumber === 2 ? 5 : 7,
          dealingCaller: 'gameLogic.startRound.batchInsert',
          roundIdUsedForWrite: round.id,
          perPlayer: playerCardInserts.map((ins) => {
            const arr = Array.isArray(ins.cards) ? (ins.cards as any[]) : [];
            return {
              playerId: ins.player_id,
              cardCount: arr.length,
              cardIds: arr.map((c: any) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`),
              mergedFromPrevious: (previousRoundCards.get(ins.player_id)?.length ?? 0) > 0,
              previousRoundCardCount: previousRoundCards.get(ins.player_id)?.length ?? 0,
            };
          }),
          deckRemainder: deck.length - cardIndex,
        },
        forceEmit: is357 && handNumber >= 2 && roundNumber === 1,
      });
    } catch { /* fire-and-forget */ }
  }

  // ============ IMMEDIATE 357 CHECK FOR ROUND 1 ============
  // Check for 3-5-7 hand immediately after dealing cards - no decision needed!
  if (roundNumber === 1) {
    console.log('[START_ROUND] Checking for immediate 3-5-7 hands...');

    // (Retired) detect.begin emit.

    // Fetch all player cards just dealt (include is_bot for alias resolution)
    const { data: dealtCards } = await supabase
      .from('player_cards')
      .select('*, players!inner(id, position, legs, user_id, is_bot, profiles(username), created_at)')
      .eq('round_id', round.id);

    // Fetch all players for bot alias resolution
    const { data: allPlayersForAlias } = await supabase
      .from('players')
      .select('user_id, is_bot, created_at')
      .eq('game_id', gameId);

    await trace357InstantWin('detect.candidate_cards', gameId, {
      roundId: round.id,
      handNumber,
      dealerGameId: currentGameUuid,
      harnessInstantWinActive,
      harnessTargetPlayerId,
      dealt: (dealtCards ?? []).map(pc => ({
        playerId: (pc as any).player_id,
        cards: pc.cards,
        cardCount: Array.isArray(pc.cards) ? (pc.cards as unknown[]).length : null,
      })),
    });

    if (dealtCards) {
      for (const pc of dealtCards) {
        const cards = pc.cards as unknown as Card[];
        const detected = has357Hand(cards);
        await trace357InstantWin('detect.has357Hand', gameId, {
          roundId: round.id,
          handNumber,
          playerId: (pc as any).player_id,
          cards,
          rankPresent: Array.isArray(cards) ? cards.map(c => c?.rank) : null,
          result: detected,
        });
        if (detected) {
          const player = pc.players as any;
          const username = player?.is_bot && allPlayersForAlias
            ? getBotAlias(allPlayersForAlias, player.user_id)
            : (player?.profiles?.username || `Player ${player?.position}`);
          console.log('[START_ROUND] 🎉 IMMEDIATE 357 DETECTED!', { playerId: player?.id, username, cards });

          // Pre-guard authoritative prize calculation. Snapshot pot + legs
          // BEFORE the atomic guard so the sentinel can embed the immutable
          // pre-zero terminal awarded amount in a single write.
          const { data: prePotRow } = await supabase
            .from('games')
            .select('pot, leg_value')
            .eq('id', gameId)
            .single();
          const preGuardPot = (prePotRow as any)?.pot || 0;
          const preGuardLegValue = (prePotRow as any)?.leg_value || 1;
          const { data: prePlayersFetch } = await supabase
            .from('players')
            .select('id, chips, legs')
            .eq('game_id', gameId);
          const preGuardPlayers = prePlayersFetch || [];
          const preGuardTotalLegValue = preGuardPlayers.reduce(
            (sum: number, p: any) => sum + ((p.legs || 0) * preGuardLegValue),
            0,
          );
          const preGuardTotalPrize = preGuardPot + preGuardTotalLegValue;

          const sweepMessage = `357_SWEEP:${username}:${preGuardTotalPrize}`;

          if (is357) {
            emit357InstantWinTerminal('detected', {
              gameId,
              roundId: round.id,
              handNumber,
              dealerGameId: currentGameUuid,
              winnerPlayerId: player?.id ?? null,
              winnerUsername: username,
              sweepMessage,
            });
          }

          try {
            // The database owns the terminal claim, payout, snapshots, and
            // lifecycle disposition. This can safely race with another client.
            const settlement = await settleThreeFiveSevenTerminal(
              gameId,
              round.id,
              currentGameUuid,
              handNumber,
            );
            await trace357InstantWin('commit.game_over', gameId, {
              roundId: round.id,
              handNumber,
              dealerGameId: currentGameUuid,
              winnerPlayerId: player?.id ?? null,
              winnerUsername: username,
              settlement,
            });
            return round;

            // Mark round completed and set sweep message.
            await __withWartimeDbMutationCorrelation({
              label: 'instant_win.rounds_completed',
              table: 'rounds',
              op: 'update',
              identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber },
              payloadHash: `status=completed|round=${round.id}`,
            }, async () => await supabase
              .from('rounds')
              .update({ status: 'completed' })
              .eq('id', round.id));

            // ATOMIC GUARD: win the in_progress → game_over transition once.
            const { data: guardResult, error: guardError } = await __withWartimeDbMutationCorrelation({
              label: 'instant_win.games_game_over_guard',
              table: 'games',
              op: 'update',
              identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber },
              payloadHash: `status=game_over|result=${sweepMessage}`,
            }, async () => await supabase
              .from('games')
              .update({
                status: 'game_over',
                game_over_at: null,
                current_round: null,
                awaiting_next_round: false,
                all_decisions_in: false,
                all_decisions_in_round_id: null,
                last_round_result: sweepMessage,
              })
              .eq('id', gameId)
              .eq('status', 'in_progress')
              .select('pot, total_hands, dealer_position, leg_value, pending_session_end')
              .single());

            if (guardError || !guardResult) {
              await trace357InstantWin('commit.guard_lost', gameId, {
                roundId: round.id,
                handNumber,
                error: guardError?.message ?? null,
              });
              emit357InstantWinTerminal('failed', {
                gameId,
                roundId: round.id,
                handNumber,
                eventKind: 'guard_lost',
                error: guardError ?? new Error('guard_lost'),
              });
              return round;
            }

            const currentPot = guardResult.pot || 0;
            const legValue = guardResult.leg_value || 1;
            const commitHandNumber = Math.max(guardResult.total_hands || 0, handNumber);

            const { data: playersFetch } = await supabase
              .from('players')
              .select('id, chips, legs')
              .eq('game_id', gameId);
            const allPlayers = playersFetch || [];

            const totalLegValue = allPlayers.reduce((sum: number, p: any) => sum + (p.legs * legValue), 0);
            const totalPrize = currentPot + totalLegValue;

            if (player?.id) {
              if (currentPot > 0) {
                await settleGameplayChipTransfers(gameId, [potToPlayer(player.id, currentPot)], 'sweep');
              }
              if (totalLegValue <= 0) {
                // The pot transfer above already paid the complete prize.
              } else {
              await __withWartimeDbMutationCorrelation({
                label: 'instant_win.increment_leg_reserve',
                table: 'rpc.increment_player_chips',
                op: 'rpc',
                identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber: commitHandNumber, currentPlayerId: player.id },
                payloadHash: `player=${player.id}|amount=${totalLegValue}`,
              }, async () => await supabase.rpc('increment_player_chips', {
                p_player_id: player.id,
                p_amount: totalLegValue,
              }));
              }
            }

            // Zero-sum accounting: winner receives totalPrize; other players
            // record 0 here (leg costs were booked at leg purchase time).
            const playerChipChanges: Record<string, number> = {};
            for (const p of allPlayers) {
              playerChipChanges[p.id] = p.id === player?.id ? totalPrize : 0;
            }

            // AUDIT/PROGRESSION: game_results row is what Cross Country reads.
            const __recordResultCausedBy = `357.instant_win.settlement|${gameId}|${round.id}|${commitHandNumber}`;
            try {
              await __withWartimeDbMutationCorrelation({
                label: 'instant_win.record_game_result',
                table: 'game_results',
                op: 'insert',
                identity: {
                  gameId,
                  roundId: round.id,
                  dealerGameId: currentGameUuid,
                  handNumber: commitHandNumber,
                  terminalResultIdentity: sweepMessage,
                  currentPlayerId: player?.id ?? null,
                },
                payloadHash: `winner=${player?.id ?? 'null'}|hand=${commitHandNumber}|prize=${totalPrize}|desc=357_Sweep`,
                causedByEventId: __recordResultCausedBy,
                sourceSiteId: WARTIME_SRC.DB_RECORD_RESULT_INSTANT_WIN.id,
              }, async () => {
                const rec = await recordGameResult(
                  gameId,
                  commitHandNumber,
                  player?.id ?? null,
                  username,
                  '3-5-7 Sweep',
                  totalPrize,
                  playerChipChanges,
                  false,
                  '357',
                  currentGameUuid,
                );
                // Behavioral purity: recordGameResult performs an
                // insert-only mutation and does not return a row id.
                // returnedIdSample is truthfully null.
                return { error: rec.error, data: null } as { error: unknown; data: null };
              });
            } catch (e) {
              await trace357InstantWin('commit.record_result_failed', gameId, {
                roundId: round.id,
                handNumber: commitHandNumber,
                error: (e as Error)?.message ?? String(e),
              });
            }

            // Fire-and-forget snapshot for audit parity with handleGameOver.
            try {
              void __withWartimeDbMutationCorrelation({
                label: 'instant_win.snapshot_player_chips',
                table: 'session_player_snapshots',
                op: 'insert',
                identity: {
                  gameId,
                  roundId: round.id,
                  dealerGameId: currentGameUuid,
                  handNumber: commitHandNumber,
                  terminalResultIdentity: sweepMessage,
                },
                payloadHash: `snapshot|hand=${commitHandNumber}|players=${allPlayers.length}`,
                causedByEventId: __recordResultCausedBy,
                sourceSiteId: WARTIME_SRC.DB_SNAPSHOT_CHIPS_INSTANT_WIN.id,
              }, async () => {
                await snapshotPlayerChips(gameId, commitHandNumber);
                return { error: null } as { error: null };
              });
            } catch { /* audit-only */ }

            await __withWartimeDbMutationCorrelation({
              label: 'instant_win.players_reset_legs_decisions',
              table: 'players',
              op: 'update',
              identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber: commitHandNumber },
              payloadHash: 'legs=0|decision=null|locked=false',
            }, async () => await supabase
              .from('players')
              .update({
                legs: 0,
                current_decision: null,
                decision_locked: false,
              })
              .eq('game_id', gameId));

            // Scope ante_decision reset to eligible participants only.
            await __withWartimeDbMutationCorrelation({
              label: 'instant_win.players_reset_ante',
              table: 'players',
              op: 'update',
              identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber: commitHandNumber },
              payloadHash: 'ante_decision=null|non_observer',
            }, async () => await supabase
              .from('players')
              .update({ ante_decision: null })
              .eq('game_id', gameId)
              .neq('status', 'observer'));

            await __withWartimeDbMutationCorrelation({
              label: 'instant_win.games_zero_pot_total_hands',
              table: 'games',
              op: 'update',
              identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber: commitHandNumber },
              payloadHash: `pot=0|total_hands=${commitHandNumber}`,
            }, async () => await supabase
              .from('games')
              .update({ pot: 0, total_hands: commitHandNumber })
              .eq('id', gameId));

            // Session end propagation (mirrors handleGameOver tail).
            if (guardResult.pending_session_end) {
              await __withWartimeDbMutationCorrelation({
                label: 'instant_win.games_session_ended',
                table: 'games',
                op: 'update',
                identity: { gameId, roundId: round.id, dealerGameId: currentGameUuid, handNumber: commitHandNumber },
                payloadHash: 'status=session_ended|pending_session_end=false',
              }, async () => await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  session_ended_at: new Date().toISOString(),
                  game_over_at: new Date().toISOString(),
                  pending_session_end: false,
                })
                .eq('id', gameId));
            }

            await trace357InstantWin('commit.game_over', gameId, {
              roundId: round.id,
              handNumber: commitHandNumber,
              dealerGameId: currentGameUuid,
              winnerPlayerId: player?.id ?? null,
              winnerUsername: username,
              currentPot,
              totalLegValue,
              totalPrize,
              harnessInstantWinActive,
              harnessTargetPlayerId,
              sweepMessage,
              gameResultRecorded: true,
              sessionEnded: !!guardResult.pending_session_end,
            });

            if (is357) {
              emit357InstantWinTerminal('settlement_completed', {
                gameId,
                roundId: round.id,
                handNumber: commitHandNumber,
                dealerGameId: currentGameUuid,
                winnerPlayerId: player?.id ?? null,
                winnerUsername: username,
                totalPrize,
                currentPot,
                totalLegValue,
                sweepMessage,
                sessionEnded: !!guardResult.pending_session_end,
              });
            }
          } catch (e) {
            emit357InstantWinTerminal('failed', {
              gameId,
              roundId: round.id,
              handNumber,
              eventKind: 'settle_exception',
              error: e,
            });
            throw e;
          }

          return round; // Exit early - 357 sweep handled
        }
      }
    }

    // No detection — if the instant-win harness was active but detection
    // still failed, that's a contract violation worth surfacing.
    if (harnessInstantWinActive) {
      await trace357InstantWin('harness.detection_failed_after_override', gameId, {
        targetPlayerId: harnessTargetPlayerId,
        roundId: round.id,
        handNumber,
        dealtCards: (dealtCards ?? []).map(pc => ({
          playerId: (pc as any).player_id,
          cards: pc.cards,
        })),
      });
      emit357InstantWinTerminal('failed', {
        gameId,
        roundId: round.id,
        handNumber,
        eventKind: 'harness_override_no_detection',
      });
    }
  }
  // ============ END IMMEDIATE 357 CHECK ============

  return round;
}

export async function makeDecision(
  gameId: string,
  playerId: string,
  decision: 'stay' | 'fold',
  expectedRoundId?: string,
) {
  const decisionTimestamp = new Date().toISOString();
  const shortGameId = gameId.slice(0, 8);
  const shortPlayerId = playerId.slice(0, 8);
  
  console.log(`[MAKE_DECISION] ===== START ===== game=${shortGameId} player=${shortPlayerId} decision=${decision} at ${decisionTimestamp}`);
  
  // Get current game
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (!game || gameError) {
    console.error(`[MAKE_DECISION] CRITICAL: Game not found`, { gameId, error: gameError?.message });
    // Log to game_state_debug_log for persistent tracking
    await logGameState({
      gameId,
      playerId,
      eventType: 'PLAYER_DECISION_MADE',
      sourceLocation: 'gameLogic:makeDecision:gameNotFound',
      details: {
        decision,
        error: gameError?.message || 'Game not found',
        timestamp: decisionTimestamp,
      },
    });
    throw new Error('Game not found');
  }

  console.log(`[MAKE_DECISION] Game status=${game.status} type=${game.game_type} current_round=${game.current_round} all_decisions_in=${game.all_decisions_in}`);

  // CRITICAL GUARD: Dice games (horses, ship-captain-crew) do NOT use makeDecision.
  // They have their own turn-based dice rolling logic. If makeDecision is called for a dice game,
  // it's a bug that will corrupt game state. Bail out immediately.
  const isDiceGame = game.game_type === 'horses' || game.game_type === 'ship-captain-crew' || game.game_type === 'yahtzee';
  if (isDiceGame) {
    console.error('[MAKE DECISION] BLOCKED: makeDecision called for dice game - this is a bug!', {
      gameId,
      gameType: game.game_type,
      playerId,
      decision,
    });
    // Fire-and-forget diagnostic log
    logRaceConditionGuard(gameId, 'gameLogic:makeDecision', 'BLOCKED_DICE_GAME', {
      gameType: game.game_type,
      playerId,
      decision,
    });
    return; // Do not throw - just silently return to prevent state corruption
  }

  // CRITICAL: For Holm games, fetch the LATEST round by round_number DESC
  // game.current_round is NOT updated for Holm (to avoid check constraint violation)
  const isHolmGame = game.game_type === 'holm-game';
  const is357Game = game.game_type === '3-5-7' || game.game_type === '3-5-7-game' || game.game_type === '357';
  const handNumber = typeof game.total_hands === 'number' ? game.total_hands : 1;
  const roundNumber = typeof game.current_round === 'number' ? game.current_round : null;

  if (is357Game && (game.status === 'game_over' || roundNumber === null)) {
    console.warn('[MAKE DECISION] Ignoring stale 3-5-7 decision at terminal/missing-round boundary', {
      gameId,
      gameType: game.game_type,
      status: game.status,
      currentRound: game.current_round,
      playerId,
      decision,
    });
    logRaceConditionGuard(gameId, 'gameLogic:makeDecision', 'BLOCKED_357_TERMINAL_OR_MISSING_ROUND', {
      gameType: game.game_type,
      status: game.status,
      currentRound: game.current_round,
      playerId,
      decision,
    });
    return;
  }

  if (!isHolmGame && roundNumber === null) {
    console.error('[MAKE DECISION] No current_round set for non-Holm game', { gameId, gameType: game.game_type });
    throw new Error('No current round');
  }
  
  let currentRound;
  if (isHolmGame) {
    // CRITICAL: Holm round selection must be scoped to dealer_game_id.
    // round_number can reset to 1 when switching game types, so round_number DESC across the session is unsafe.
    const baseRoundQuery = supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId);

    const roundQuery = game.current_game_uuid
      ? baseRoundQuery.eq('dealer_game_id', game.current_game_uuid)
      : baseRoundQuery;

    const { data: latestRound } = await roundQuery
      .order('hand_number', { ascending: false })
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestRound) {
      console.error('[MAKE DECISION] Holm game - no round found for dealer_game_id', {
        gameId,
        dealerGameId: game.current_game_uuid,
      });
      throw new Error('Round not found');
    }
    currentRound = latestRound;
    console.log('[MAKE DECISION] Holm game - using latest round by round_number:', latestRound?.round_number);
  } else {
    if (is357Game) {
      // 3-5-7 can have multiple round_number=1/2/3 rows across hands.
      // Disambiguate via (dealer_game_id, hand_number, round_number).
      const { data: round357 } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .eq('dealer_game_id', game.current_game_uuid)
        .eq('hand_number', handNumber)
        .eq('round_number', roundNumber)
        .maybeSingle();
      currentRound = round357;
    } else {
      // Non-3-5-7 games can restart at round_number=1 when a new dealer game starts.
      // Always scope to the active dealer_game_id when available and take the latest by (hand_number, round_number).
      const baseRoundQuery = supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId);

      const scopedQuery = game.current_game_uuid
        ? baseRoundQuery.eq('dealer_game_id', game.current_game_uuid)
        : baseRoundQuery;

      const { data: latestRound } = await scopedQuery
        .order('hand_number', { ascending: false })
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      currentRound = latestRound;
    }
  }
  
  if (!currentRound) {
    console.error(`[MAKE_DECISION] CRITICAL: Round not found for game=${shortGameId}`);
    await logGameState({
      gameId,
      playerId,
      eventType: 'PLAYER_DECISION_MADE',
      sourceLocation: 'gameLogic:makeDecision:roundNotFound',
      details: { decision, timestamp: new Date().toISOString() },
    });
    throw new Error('Round not found');
  }

  if (is357Game) {
    if (!expectedRoundId || expectedRoundId !== currentRound.id || !game.current_game_uuid) {
      throw new Error('three_five_seven_submit_decision requires exact current identity');
    }
    const { data, error } = await supabase.rpc('three_five_seven_submit_decision' as any, {
      p_game_id: gameId,
      p_round_id: currentRound.id,
      p_dealer_game_id: game.current_game_uuid,
      p_hand_number: currentRound.hand_number,
      p_round_number: currentRound.round_number,
      p_player_id: playerId,
      p_decision: decision,
    } as any);
    if (error) throw error;
    return data;
  }

  console.log(`[MAKE_DECISION] Round found: id=${currentRound.id.slice(0,8)} round_number=${currentRound.round_number} hand_number=${currentRound.hand_number} status=${currentRound.status}`);

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  if (!player || playerError) {
    console.error(`[MAKE_DECISION] CRITICAL: Player not found player=${shortPlayerId}`, { error: playerError?.message });
    await logGameState({
      gameId,
      playerId,
      eventType: 'PLAYER_DECISION_MADE',
      sourceLocation: 'gameLogic:makeDecision:playerNotFound',
      details: { decision, error: playerError?.message, timestamp: new Date().toISOString() },
    });
    throw new Error('Player not found');
  }

  console.log(`[MAKE_DECISION] Player BEFORE update: position=${player.position} decision_locked=${player.decision_locked} current_decision=${player.current_decision} status=${player.status}`);

  // Holm owns the final decision on the server.  In particular, the last
  // decision and the solo-vs-Chucky settlement must be one transaction: a
  // browser closing after its Stay/Fold write cannot be the thing that decides
  // whether a LAST HAND session ever reaches session_ended.
  if (isHolmGame) {
    if (!expectedRoundId) {
      throw new Error('Holm decision requires an exact round identity');
    }
    if (currentRound.id !== expectedRoundId) {
      throw new Error('Holm decision rejected: stale round identity');
    }

    const { data, error } = await supabase.rpc('holm_submit_decision', {
      p_game_id: gameId,
      p_round_id: expectedRoundId,
      p_player_id: playerId,
      p_decision: decision,
    });

    if (error) {
      console.error('[MAKE_DECISION] Holm server decision failed:', error);
      throw new Error(`Holm decision failed: ${error.message}`);
    }

    const result = (data ?? {}) as {
      already_locked?: boolean;
      already_terminal?: boolean;
      round_not_betting?: boolean;
      stale_round?: boolean;
      not_current_turn?: boolean;
      game_paused?: boolean;
      all_decisions_in?: boolean;
      server_resolved?: boolean;
      terminal_disposition?: 'game_over' | 'session_ended' | null;
    };

    console.log('[MAKE_DECISION] Holm server decision result:', result);

    if (
      result.already_locked
      || result.already_terminal
      || result.round_not_betting
      || result.stale_round
      || result.not_current_turn
      || result.game_paused
    ) {
      return;
    }

    // The server resolves all-fold and solo-vs-Chucky hands, including their
    // final-session disposition. Multi-player showdown presentation retains
    // its existing owner for now; it can safely claim the already-persisted
    // all-decisions state below.
    if (result.server_resolved) {
      return;
    }

    if (result.all_decisions_in) {
      const { checkHolmRoundComplete } = await import('./holmGameLogic');
      await checkHolmRoundComplete(gameId);
    }
    return;
  }

  // Prevent double-clicking - if player has already locked in a decision, don't allow changes
  if (player.decision_locked) {
    console.log(`[MAKE_DECISION] Player already locked, ignoring. player=${shortPlayerId} existing_decision=${player.current_decision}`);
    await logGameState({
      gameId,
      playerId,
      eventType: 'PLAYER_DECISION_MADE',
      sourceLocation: 'gameLogic:makeDecision:alreadyLocked',
      playerDecision: player.current_decision,
      decisionLocked: true,
      details: { attempted_decision: decision, existing_decision: player.current_decision, timestamp: new Date().toISOString() },
    });
    return;
  }

  // Lock in decision - no chips deducted yet
  // isHolmGame already defined above
  
  // CRITICAL: Use atomic guard to prevent race conditions with enforce-deadlines.
  // The .eq('decision_locked', false) ensures only ONE writer wins if the user clicks
  // Stay/Fold at the same moment the timer expires and calls the edge function.
  if (decision === 'stay') {
    console.log(`[MAKE_DECISION] Attempting DB UPDATE: SET current_decision='stay', decision_locked=true WHERE id=${shortPlayerId} AND decision_locked=false`);
    
    const { data: stayResult, error: stayError } = await supabase
      .from('players')
      .update({ 
        current_decision: 'stay',
        decision_locked: true
      })
      .eq('id', playerId)
      .eq('decision_locked', false) // ATOMIC GUARD: only update if not already locked
      .select();
    
    console.log(`[MAKE_DECISION] STAY DB result: affected_rows=${stayResult?.length ?? 0} error=${stayError?.message ?? 'none'}`);
    
    if (stayError) {
      console.error(`[MAKE_DECISION] CRITICAL: STAY update failed with error`, { error: stayError.message, code: stayError.code });
      await logGameState({
        gameId,
        playerId,
        roundId: currentRound.id,
        eventType: 'PLAYER_DECISION_MADE',
        playerDecision: 'stay',
        decisionLocked: false,
        sourceLocation: 'gameLogic:makeDecision:stayDbError',
        details: { 
          error: stayError.message, 
          error_code: stayError.code,
          position: player.position,
          timestamp: new Date().toISOString(),
        },
      });
      throw new Error(`Stay update failed: ${stayError.message}`);
    }
    
    if (!stayResult || stayResult.length === 0) {
      console.log(`[MAKE_DECISION] STAY atomic guard: 0 rows affected - player was already locked by another process`);
      await logGameState({
        gameId,
        playerId,
        roundId: currentRound.id,
        eventType: 'RACE_CONDITION_GUARD',
        playerDecision: 'stay',
        decisionLocked: false,
        sourceLocation: 'gameLogic:makeDecision:stayRaceLost',
        details: { 
          guard_type: 'decision_locked_atomic_guard',
          attempted_decision: 'stay',
          position: player.position,
          timestamp: new Date().toISOString(),
        },
      });
      return; // Another process already locked this player
    }
    
    console.log(`[MAKE_DECISION] ✅ STAY SUCCESS: player=${shortPlayerId} position=${player.position} decision_locked=true`);
    
    // DEBUG LOG: Player stay decision (fire-and-forget)
    logPlayerDecision(gameId, playerId, 'stay', true, 'gameLogic:makeDecision:staySuccess', {
      round_id: currentRound.id,
      round_number: currentRound.round_number,
      hand_number: currentRound.hand_number,
      position: player.position,
      game_type: game.game_type,
      affected_rows: stayResult.length,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Only 3-5-7 variants treat fold as session-elimination (status='folded').
    // All other game types (Holm, cribbage, gin, yahtzee, dice, etc.) must not
    // stamp status='folded' — that's a 3-5-7-specific semantic and pollutes
    // cross-dealer-game player rows. See bot-ownership boundary fix.
    const updatePayload = {
      current_decision: 'fold',
      decision_locked: true,
      ...(is357Game ? { status: 'folded' } : {})
    };
    
    console.log(`[MAKE_DECISION] Attempting DB UPDATE: SET ${JSON.stringify(updatePayload)} WHERE id=${shortPlayerId} AND decision_locked=false`);
    
    const { data: foldResult, error: foldError } = await supabase
      .from('players')
      .update(updatePayload)
      .eq('id', playerId)
      .eq('decision_locked', false) // ATOMIC GUARD: only update if not already locked
      .select();
    
    console.log(`[MAKE_DECISION] FOLD DB result: affected_rows=${foldResult?.length ?? 0} error=${foldError?.message ?? 'none'}`);
    
    if (foldError) {
      console.error(`[MAKE_DECISION] CRITICAL: FOLD update failed with error`, { error: foldError.message, code: foldError.code });
      await logGameState({
        gameId,
        playerId,
        roundId: currentRound.id,
        eventType: 'PLAYER_DECISION_MADE',
        playerDecision: 'fold',
        decisionLocked: false,
        sourceLocation: 'gameLogic:makeDecision:foldDbError',
        details: { 
          error: foldError.message, 
          error_code: foldError.code,
          position: player.position,
          timestamp: new Date().toISOString(),
        },
      });
      throw new Error(`Fold update failed: ${foldError.message}`);
    }
    
    if (!foldResult || foldResult.length === 0) {
      console.log(`[MAKE_DECISION] FOLD atomic guard: 0 rows affected - player was already locked by another process`);
      await logGameState({
        gameId,
        playerId,
        roundId: currentRound.id,
        eventType: 'RACE_CONDITION_GUARD',
        playerDecision: 'fold',
        decisionLocked: false,
        sourceLocation: 'gameLogic:makeDecision:foldRaceLost',
        details: { 
          guard_type: 'decision_locked_atomic_guard',
          attempted_decision: 'fold',
          position: player.position,
          timestamp: new Date().toISOString(),
        },
      });
      return; // Another process already locked this player
    }
    
    console.log(`[MAKE_DECISION] ✅ FOLD SUCCESS: player=${shortPlayerId} position=${player.position} decision_locked=true status=${isHolmGame ? 'active' : 'folded'}`);
    
    
    // DEBUG LOG: Player fold decision (fire-and-forget)
    logPlayerDecision(gameId, playerId, 'fold', true, 'gameLogic:makeDecision:foldSuccess', {
      round_id: currentRound.id,
      round_number: currentRound.round_number,
      hand_number: currentRound.hand_number,
      position: player.position,
      game_type: game.game_type,
      status_change: isHolmGame ? 'none' : 'folded',
      affected_rows: foldResult.length,
      timestamp: new Date().toISOString(),
    });
  }

  // Holm returned through its exact-round server RPC above. This remaining
  // path is exclusively the simultaneous-decision 3-5-7 owner.
  console.log(`[MAKE_DECISION] 3-5-7 game - calling checkAllDecisionsIn for game=${shortGameId}`);
  await checkAllDecisionsIn(gameId);
  
  console.log(`[MAKE_DECISION] ===== COMPLETE ===== game=${shortGameId} player=${shortPlayerId} decision=${decision}`);
}

async function checkAllDecisionsIn(gameId: string) {
  const shortGameId = gameId.slice(0, 8);
  const checkTimestamp = new Date().toISOString();
  
  console.log(`[CHECK_ALL_DECISIONS] ===== START ===== game=${shortGameId} at ${checkTimestamp}`);
  
  // First check if decisions are already marked as in
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('all_decisions_in, current_round, total_hands, status, current_game_uuid, game_type, is_paused')
    .eq('id', gameId)
    .single();

  console.log(
    `[CHECK_ALL_DECISIONS] Game state: all_decisions_in=${game?.all_decisions_in} current_round=${game?.current_round} status=${game?.status}`,
  );

  // RECOVERY: It's possible for all_decisions_in to be set true but endRound never ran
  // (e.g. client crash / refresh right after the atomic flag update). In that case the game
  // would be permanently stuck because this function would "skip" forever.
  // endRound is idempotent and has its own atomic round lock, so it's safe to call here.
  //
  // CRITICAL GUARD: Before calling endRound, verify that at least one player in the CURRENT
  // round actually has a decision. A stale all_decisions_in=true from a previous hand/round
  // can race with a new round creation, causing endRound to fire with zero decisions.
  if (game?.all_decisions_in) {
    // P0-CONTAINMENT: only Holm/3-5-7 use the all_decisions_in → endRound recovery
    // path. Other game types must never trigger endRound; doing so writes
    // awaiting_next_round into rows whose lifecycle does not own that field.
    const gTypeCheck = (game as any)?.game_type;
    const isHolmOrThreeFiveSeven =
      gTypeCheck === '3-5-7' || gTypeCheck === '3-5-7-game' || gTypeCheck === '357' ||
      gTypeCheck === 'holm' || gTypeCheck === 'holm-game';
    if (!isHolmOrThreeFiveSeven) {
      console.error('[CHECK_ALL_DECISIONS] checkAllDecisions-suppressed-non-holm-357', {
        gameId: shortGameId, gameType: gTypeCheck,
      });
      // Also clear the stale flag so this doesn't loop forever.
      await supabase.from('games').update({ all_decisions_in: false, all_decisions_in_round_id: null }).eq('id', gameId);
      return;
    }

    console.warn(`[CHECK_ALL_DECISIONS] all_decisions_in already true - checking if decisions exist`, {
      gameId: shortGameId,
      status: game.status,
      isPaused: game.is_paused,
      gameType: game.game_type,
    });

    if (!game.is_paused && game.status === 'in_progress') {
      // Verify players actually have decisions before allowing recovery endRound
      const { data: currentPlayers } = await supabase
        .from('players')
        .select('id, current_decision, status, sitting_out')
        .eq('game_id', gameId)
        .eq('status', 'active')
        .eq('sitting_out', false);

      const withDecision = (currentPlayers || []).filter(
        p => p.current_decision === 'stay' || p.current_decision === 'fold'
      );

      if (withDecision.length === 0 && (currentPlayers || []).length > 0) {
        // Stale all_decisions_in from a prior round — reset it and bail
        console.error(`[CHECK_ALL_DECISIONS] ❌ STALE all_decisions_in - ${(currentPlayers || []).length} active players but ZERO decisions. Resetting flag.`);
        await supabase
          .from('games')
          .update({ all_decisions_in: false, all_decisions_in_round_id: null })
          .eq('id', gameId);
        return;
      }

      try {
        await endRound(gameId);
      } catch (err) {
        console.error('[CHECK_ALL_DECISIONS] Recovery endRound failed:', err);
      }
    }

    return;
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, position, current_decision, decision_locked, status, sitting_out, is_bot, user_id')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || playersError) {
    console.error(`[CHECK_ALL_DECISIONS] ERROR fetching players: ${playersError?.message}`);
    return;
  }

  // Log EVERY player's state for debugging
  console.log(`[CHECK_ALL_DECISIONS] Player states (${players.length} active players):`);
  players.forEach(p => {
    console.log(`  Position ${p.position}: decision_locked=${p.decision_locked} current_decision=${p.current_decision} is_bot=${p.is_bot}`);
  });

  const allDecided = players.every(p => p.decision_locked);
  const decidedCount = players.filter(p => p.decision_locked).length;
  const undecidedPlayers = players.filter(p => !p.decision_locked);

  console.log(`[CHECK_ALL_DECISIONS] Decision tally: ${decidedCount}/${players.length} decided. allDecided=${allDecided}`);
  
  if (undecidedPlayers.length > 0) {
    console.log(`[CHECK_ALL_DECISIONS] WAITING for ${undecidedPlayers.length} players:`, undecidedPlayers.map(p => ({ pos: p.position, is_bot: p.is_bot })));
  }

  if (allDecided) {
    console.log(`[CHECK_ALL_DECISIONS] ✅ ALL DECIDED - attempting to set all_decisions_in flag`);

    // F5.1: Identity-scope the flag by stamping it with the current round_id.
    // Fetch the active round so the flag is rejectable by readers if a fresher
    // round overtakes it. Scope to current_game_uuid (dealer game) to avoid
    // picking up rows from prior dealer games with the same hand/round numbers.
    let activeRoundId: string | null = null;
    try {
      let roundQuery = supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId)
        .order('hand_number', { ascending: false, nullsFirst: false })
        .order('round_number', { ascending: false, nullsFirst: false })
        .limit(1);
      const dgId = (game as any)?.current_game_uuid as string | null | undefined;
      if (dgId) roundQuery = roundQuery.eq('dealer_game_id', dgId);
      const { data: activeRound } = await roundQuery.maybeSingle();
      activeRoundId = activeRound?.id ?? null;
    } catch (e) {
      console.warn('[CHECK_ALL_DECISIONS] could not resolve active round id for scoping:', e);
    }

    // Try to atomically set all_decisions_in flag together with the scoping round id
    const { data: updateResult, error } = await supabase
      .from('games')
      .update({ all_decisions_in: true, all_decisions_in_round_id: activeRoundId })
      .eq('id', gameId)
      .eq('all_decisions_in', false) // Only update if not already set
      .select();

    console.log(`[CHECK_ALL_DECISIONS] all_decisions_in UPDATE result: affected_rows=${updateResult?.length ?? 0} round_id=${activeRoundId?.slice(0,8) ?? 'null'} error=${error?.message ?? 'none'}`);

    // Log to persistent debug table
    await logAllDecisionsIn(gameId, null, true, 'gameLogic:checkAllDecisionsIn', {
      player_decisions: players.map(p => ({ position: p.position, decision: p.current_decision, locked: p.decision_locked, is_bot: p.is_bot })),
      update_affected_rows: updateResult?.length ?? 0,
      update_error: error?.message,
      timestamp: checkTimestamp,
    });

    // Only the first call that successfully sets the flag should proceed
    if (!error && updateResult && updateResult.length > 0) {
      console.log(`[CHECK_ALL_DECISIONS] ✅ WON RACE - calling endRound for game=${shortGameId}`);
      // End round immediately without delay
      try {
        await endRound(gameId);
        console.log(`[CHECK_ALL_DECISIONS] ✅ endRound completed successfully`);
      } catch (endRoundError) {
        console.error(`[CHECK_ALL_DECISIONS] ❌ ERROR in endRound:`, endRoundError);
      }
    } else {
      console.log(`[CHECK_ALL_DECISIONS] Lost race - another process already set all_decisions_in`);
    }
  } else {
    console.log(`[CHECK_ALL_DECISIONS] Not all decided yet, waiting for more decisions`);
  }
  
  console.log(`[CHECK_ALL_DECISIONS] ===== COMPLETE ===== game=${shortGameId}`);
}

export async function autoFoldUndecided(gameId: string, opts?: {
  expectedRoundId?: string | null;
  expectedHandNumber?: number | null;
  expectedRoundNumber?: number | null;
}) {
  console.log('[AUTO-FOLD] Starting autoFoldUndecided for game:', gameId);

  // SAFETY: Re-fetch authoritative game + current round + ruleset config
  // before mutating. A stale callback (e.g. cribbage idle timeout) must
  // never auto-fold. Policy is read from DB config, not game_type.
  const { resolveTimeoutPolicy, validateTimeoutAutoFold } =
    await import('./timeoutRules');

  const { data: game } = await supabase
    .from('games')
    .select('id, game_type, status, is_paused, total_hands, current_round, current_game_uuid, timeout_enforcement_enabled, timeout_action')
    .eq('id', gameId)
    .single();

  if (!game) {
    console.warn('[AUTO-FOLD] suppressed: game not found');
    return;
  }

  // Authoritative current round for this dealer game
  let currentRound: any = null;
  {
    const q = supabase
      .from('rounds')
      .select('id, status, decision_deadline, hand_number, round_number, dealer_game_id')
      .eq('game_id', gameId)
      .eq('hand_number', game.total_hands ?? 1)
      .eq('round_number', game.current_round ?? 0)
      .order('created_at', { ascending: false })
      .limit(1);
    const { data } = await q;
    currentRound = (data || [])[0] || null;
    if (currentRound && game.current_game_uuid && currentRound.dealer_game_id && currentRound.dealer_game_id !== game.current_game_uuid) {
      currentRound = null;
    }
  }

  // Resolve authoritative timeout policy: games override → game_defaults → safe default
  const { data: gameDefault } = await supabase
    .from('game_defaults')
    .select('timeout_enforcement_enabled, timeout_action')
    .eq('game_type', game.game_type || '')
    .maybeSingle();
  const policy = resolveTimeoutPolicy(game as any, gameDefault as any);

  const suppress = validateTimeoutAutoFold({
    policy,
    game,
    round: currentRound,
    expectedRoundId: opts?.expectedRoundId ?? null,
    expectedHandNumber: opts?.expectedHandNumber ?? null,
    expectedRoundNumber: opts?.expectedRoundNumber ?? null,
    roundHandNumber: currentRound?.hand_number ?? null,
    roundRoundNumber: currentRound?.round_number ?? null,
  });

  if (suppress) {
    console.warn('[AUTO-FOLD] suppressed:', suppress, { gameId, game_type: game.game_type });
    try {
      await supabase.from('debug_events').insert({
        event_type: `timeout-auto-fold-suppressed-${suppress}`,
        game_id: gameId,
        round_id: currentRound?.id ?? null,
        payload: {
          game_type: game.game_type,
          status: game.status,
          is_paused: game.is_paused,
          round_status: currentRound?.status,
          decision_deadline: currentRound?.decision_deadline,
          expected: opts ?? null,
        },
      });
    } catch {}
    return;
  }

  const isHolmGame = game?.game_type === 'holm-game';
  const is357GameAutoFold = game?.game_type === '3-5-7' || game?.game_type === '3-5-7-game' || game?.game_type === '357';

  if (is357GameAutoFold) {
    if (!currentRound?.id || !currentRound.dealer_game_id) {
      throw new Error('three_five_seven_expire_round requires exact current identity');
    }
    const { error } = await supabase.rpc('three_five_seven_expire_round' as any, {
      p_game_id: gameId,
      p_round_id: currentRound.id,
      p_dealer_game_id: currentRound.dealer_game_id,
      p_hand_number: currentRound.hand_number,
      p_round_number: currentRound.round_number,
    } as any);
    if (error) throw error;
    return;
  }

  // Get players who haven't decided yet (active and not sitting out)
  const { data: undecidedPlayers, error: fetchError } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .is('decision_locked', false);

  if (fetchError) {
    console.error('[AUTO-FOLD] Error fetching undecided players:', fetchError);
    return;
  }

  if (!undecidedPlayers || undecidedPlayers.length === 0) {
    console.log('[AUTO-FOLD] No undecided players found, checking if round should end');
    await checkAllDecisionsIn(gameId);
    return;
  }

  console.log('[AUTO-FOLD] Auto-folding', undecidedPlayers.length, 'undecided players');

  // Auto-fold all undecided players
  // In Holm game, keep status 'active' so they can play next hand
  for (const player of undecidedPlayers) {
    const { error: foldError } = await supabase
      .from('players')
      .update({
        current_decision: 'fold',
        decision_locked: true,
        // This function is only called for timer-expiry; mark humans as auto_fold.
        auto_fold: player.is_bot ? false : true,
        ...(is357GameAutoFold ? { status: 'folded' } : {}),
      })
      .eq('id', player.id);
    
    if (foldError) {
      console.error('[AUTO-FOLD] Error folding player:', player.id, foldError);
    }
  }

  console.log('[AUTO-FOLD] Checking all decisions after auto-fold');
  // Check if all decisions are in and end round if needed
  await checkAllDecisionsIn(gameId);
}


// Centralized game-over handler to ensure consistency
async function handleGameOverLegacy(
  gameId: string,
  winnerId: string,
  winnerUsername: string,
  winnerLegs: number,
  allPlayers: any[],
  currentPot: number,
  legValue: number,
  legsToWin: number,
  currentDealerPosition: number,
  currentGameUuid?: string | null
) {
  console.log('[HANDLE GAME OVER] Starting game over handler', { winnerId, winnerUsername, winnerLegs });
  
  // ATOMIC GUARD: Only the first client to update status from 'in_progress' to 'game_over' proceeds
  // This prevents duplicate pot awards in human-vs-human games
  const { data: guardResult, error: guardError } = await supabase
    .from('games')
    .update({ 
      status: 'game_over',
      game_over_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .eq('status', 'in_progress')  // ATOMIC: Only if still in_progress
    .select('total_hands, pot')
    .single();
  
  if (guardError || !guardResult) {
    console.log('[HANDLE GAME OVER] Another client already processed game over, skipping pot award');
    return;
  }
  
  console.log('[HANDLE GAME OVER] Won atomic guard, proceeding with pot award');
  
  // Use the pot value from the atomic guard result to ensure consistency
  const actualPot = guardResult.pot || currentPot;
  // 3-5-7 HAND MODEL: total_hands == current hand_number (increments when a NEW Round 1 starts)
  const handNumber = Math.max(guardResult.total_hands || 0, 1);
  
  // Calculate total leg value from all players (legs are separate from pot)
  // Winner gets pot + all leg values when they win the game
  const totalLegValue = allPlayers.reduce((sum, p) => sum + (p.legs * legValue), 0);
  const totalPrize = actualPot + totalLegValue;
  
  console.log('[HANDLE GAME OVER] Awarding prize:', { actualPot, totalLegValue, totalPrize });
  
  // Calculate chip changes for all players (for game result tracking)
  // Winner gets the pot; losers record nothing (their losses were already recorded)
  const playerChipChanges: Record<string, number> = {};
  for (const player of allPlayers) {
    if (player.id === winnerId) {
      playerChipChanges[player.id] = totalPrize; // Winner gains the pot
    } else {
      // Other players' leg costs were already recorded when they bought legs
      // Recording 0 here for completeness in the game_results entry
      playerChipChanges[player.id] = 0;
    }
  }
  
  // The visible pot portion is a database-owned pot → player transfer.  Leg
  // reserve value retains its existing accounting path (it has no visible pot
  // endpoint), so this change does not alter settlement economics.
  if (actualPot > 0) {
    await settleGameplayChipTransfers(gameId, [potToPlayer(winnerId, actualPot)], 'win');
  }
  if (totalLegValue > 0) {
    await supabase.rpc('increment_player_chips', {
      p_player_id: winnerId,
      p_amount: totalLegValue,
    });
  }
  
  // Fire-and-forget: Record game result for hand history (audit trail only)
  recordGameResult(
    gameId,
    handNumber,
    winnerId,
    winnerUsername,
    `${winnerLegs} legs`,
    totalPrize,
    playerChipChanges,
    false,
    '357', // game_type
    currentGameUuid // dealer_game_id
  );
  
  // Fire-and-forget: Snapshot player chips (audit trail only)
  snapshotPlayerChips(gameId, handNumber);
  
  const gameWinMessage = `🏆 ${winnerUsername} won the game!`;
  
  // Reset per-game ephemeral fields for ALL players (legs/decision state).
  // CRITICAL: Do NOT bulk-write `status` or `sitting_out` here — that would
  // promote observers to active and reactivate intentionally sitting-out
  // players. Participation intent is owned by evaluatePlayerStatesEndOfGame
  // and the seat/opt-in/rejoin flows.
  await supabase
    .from('players')
    .update({
      legs: 0,
      current_decision: null,
      decision_locked: false,
    })
    .eq('game_id', gameId);

  // Scope ante_decision reset to eligible participants only (exclude observers).
  await supabase
    .from('players')
    .update({ ante_decision: null })
    .eq('game_id', gameId)
    .neq('status', 'observer');
  
  // NOTE: Dealer rotation is NOT done here anymore - it's done in handleGameOverComplete
  // after evaluating player states (sit_out_next_hand, stand_up_next_hand, etc.)
  // This prevents double-rotation and ensures player state is considered before selecting next dealer
  
  console.log('[HANDLE GAME OVER] Keeping current dealer position:', currentDealerPosition, '(rotation happens in handleGameOverComplete)');
  
  // Check if session should end AFTER awarding prizes
  const { data: sessionData } = await supabase
    .from('games')
    .select('pending_session_end, current_round')
    .eq('id', gameId)
    .single();
  
  if (sessionData?.pending_session_end) {
    console.log('[HANDLE GAME OVER] Session ending - marking as session_ended');
    await supabase
      .from('games')
      .update({
        status: 'session_ended',
        session_ended_at: new Date().toISOString(),
        game_over_at: new Date().toISOString(),
        total_hands: handNumber,
        pending_session_end: false,
        last_round_result: gameWinMessage,
        pot: 0
      })
      .eq('id', gameId);
    
    console.log('[HANDLE GAME OVER] Session ended successfully');
    return;
  }
  
  console.log('[HANDLE GAME OVER] Setting game_over status');
  
  // Update game to game_over status - SINGLE atomic update with ALL required fields
  // NOTE: dealer_position stays the same here - rotation happens in handleGameOverComplete
  // NOTE: game_over_at is NULL so frontend animation can complete before countdown starts
  const { data: gameOverUpdate, error: gameOverError } = await supabase
    .from('games')
    .update({ 
      status: 'game_over',
      // dealer_position is NOT updated here - rotation happens after player state evaluation
      current_round: null,
      awaiting_next_round: false,
      all_decisions_in: false,
      all_decisions_in_round_id: null,
      last_round_result: gameWinMessage,
      game_over_at: null,  // NULL - frontend animation will set this after completing
      pot: 0,  // Critical: always reset pot
      total_hands: handNumber
    })
    .eq('id', gameId)
    .select();
  
  if (gameOverError) {
    console.error('[HANDLE GAME OVER] ERROR updating game:', gameOverError);
    throw gameOverError;
  }
  
  console.log('[HANDLE GAME OVER] Game over setup complete', { 
    updateSuccess: !!gameOverUpdate,
    rowsUpdated: gameOverUpdate?.length,
    gameStatus: gameOverUpdate?.[0]?.status,
    gameOverAt: gameOverUpdate?.[0]?.game_over_at,
    pot: gameOverUpdate?.[0]?.pot
  });
}

// Terminal financial state is owned by the replay-safe RPC. The retained
// helper above is no longer called by either active 3-5-7 terminal path.
async function handleGameOver(
  gameId: string,
  _winnerId: string,
  _winnerUsername: string,
  _winnerLegs: number,
  _allPlayers: any[],
  _currentPot: number,
  _legValue: number,
  _legsToWin: number,
  _currentDealerPosition: number,
  currentGameUuid?: string | null,
  roundId?: string | null,
  handNumber?: number | null,
) {
  if (!currentGameUuid || !roundId || !handNumber) {
    throw new Error('three_five_seven_settle_game requires round, dealer-game, and hand identity');
  }

  const settlement = await settleThreeFiveSevenTerminal(
    gameId,
    roundId,
    currentGameUuid,
    handNumber,
  );
  console.log('[HANDLE GAME OVER] Authoritative terminal settlement complete', settlement);
}

export async function endRound(gameId: string) {
  const shortGameId = gameId.slice(0, 8);
  const endRoundTimestamp = new Date().toISOString();
  
  console.log(`[END_ROUND] ===== START ===== game=${shortGameId} at ${endRoundTimestamp}`);
  
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*, players(*)')
    .eq('id', gameId)
    .single();

  // P0-CONTAINMENT: endRound() is Holm/3-5-7 lifecycle logic. It writes the shared
  // `awaiting_next_round` / `next_round_number` fields and must NEVER fire for other
  // game types (cribbage, gin-rummy, yahtzee, horses, scc) — doing so corrupts
  // mid-hand state. Re-fetch the authoritative game_type and abort with a logged
  // suppression event if this is not a Holm/3-5-7 game.
  const gType = (game as any)?.game_type;
  const isHolmOrThreeFiveSeven =
    gType === '3-5-7' || gType === '3-5-7-game' || gType === '357' ||
    gType === 'holm' || gType === 'holm-game';
  if (!isHolmOrThreeFiveSeven) {
    console.error('[END_ROUND] endRound-suppressed-non-holm-357', { gameId: shortGameId, gameType: gType });
    await logGameState({
      gameId,
      eventType: 'RACE_CONDITION_GUARD',
      sourceLocation: 'gameLogic:endRound:gameTypeGuard',
      details: { suppressed: 'endRound-suppressed-non-holm-357', gameType: gType, timestamp: endRoundTimestamp },
    });
    return;
  }

  console.log(`[END_ROUND] Game: status=${game?.status} current_round=${game?.current_round} total_hands=${game?.total_hands} pot=${game?.pot}`);

  if (!game || !game.current_round) {
    console.error(`[END_ROUND] CRITICAL: No game or no current_round. game=${shortGameId} error=${gameError?.message}`);
    await logGameState({
      gameId,
      eventType: 'ROUND_TRANSITION',
      sourceLocation: 'gameLogic:endRound:noGameOrRound',
      details: { error: gameError?.message || 'No current_round', timestamp: endRoundTimestamp },
    });
    return;
  }

  // Fetch game configuration
  const { data: gameConfig } = await supabase
    .from('games')
    .select('leg_value, legs_to_win, pot_max_enabled, pot_max_value, pussy_tax_enabled, pussy_tax_value, current_game_uuid, reveal_at_showdown')
    .eq('id', gameId)
    .single();
  
  const currentGameUuid = gameConfig?.current_game_uuid || null;
  
  const legValue = gameConfig?.leg_value || 1;
  const legsToWin = gameConfig?.legs_to_win || 3;
  const potMaxEnabled = gameConfig?.pot_max_enabled ?? true;
  const potMaxValue = gameConfig?.pot_max_value || 10;
  const pussyTaxEnabled = gameConfig?.pussy_tax_enabled ?? true;
  const pussyTaxValue = gameConfig?.pussy_tax_value || 1;
  const revealAtShowdown = gameConfig?.reveal_at_showdown ?? true;
  const betAmount = legValue;

  const currentRound = game.current_round;

  // Get all player hands for this round
  const is357Game = game.game_type === '3-5-7' || game.game_type === '3-5-7-game' || game.game_type === '357';
  const handNumber = typeof game.total_hands === 'number' ? game.total_hands : 1;
  
  console.log(`[END_ROUND] Config: is357Game=${is357Game} handNumber=${handNumber} currentRound=${currentRound} dealerGameId=${currentGameUuid?.slice(0,8)}`);
  
  // CRITICAL: Round selection must never rely on (game_id, round_number) alone.
  // When a new dealer game starts inside the same session, round_number can restart at 1.
  // If we select by round_number we can target a historical round from a prior dealer game and stall progression.
  const baseRoundQuery = supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId);

  let round: any | null = null;

  if (is357Game) {
    const { data } = await baseRoundQuery
      .eq('dealer_game_id', currentGameUuid)
      .eq('hand_number', handNumber)
      .eq('round_number', currentRound)
      .maybeSingle();
    round = data;
  } else {
    const scopedQuery = currentGameUuid
      ? baseRoundQuery.eq('dealer_game_id', currentGameUuid)
      : baseRoundQuery;

    const { data } = await scopedQuery
      .order('hand_number', { ascending: false })
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    round = data;
  }

  if (!round) {
    console.error(`[END_ROUND] CRITICAL: Round not found. game=${shortGameId} handNumber=${handNumber} currentRound=${currentRound}`);
    await logGameState({
      gameId,
      eventType: 'ROUND_TRANSITION',
      sourceLocation: 'gameLogic:endRound:roundNotFound',
      details: { handNumber, currentRound, dealerGameId: currentGameUuid, timestamp: endRoundTimestamp },
    });
    return;
  }

  if (is357Game) {
    // The final decision RPC resolves the exact round transactionally. A
    // disconnected final actor is covered by scheduled recovery; the browser
    // no longer computes or republishes a result here.
    return;
  }
  
  console.log(`[END_ROUND] Round found: id=${round.id.slice(0,8)} status=${round.status} round_number=${round.round_number} hand_number=${round.hand_number}`);
  
  // A completed 3-5-7 round can be the durable resolution lock left behind
  // after the winning leg was awarded but before terminal settlement returned.
  // Replay the authoritative RPC for that exact signature; its settlement key
  // makes concurrent/reconnected callers safe. Ordinary completed rounds still
  // return without being processed twice.
  if (round.status === 'completed') {
    const terminalWinners = (game.players || []).filter(
      (player: any) => (player.legs || 0) >= legsToWin,
    );

    if (
      is357Game &&
      game.status === 'in_progress' &&
      currentGameUuid &&
      terminalWinners.length === 1
    ) {
      console.warn('[END_ROUND] Recovering interrupted 3-5-7 terminal settlement', {
        gameId: shortGameId,
        roundId: round.id,
        dealerGameId: currentGameUuid,
        handNumber,
        winnerPlayerId: terminalWinners[0].id,
      });
      const settlement = await settleThreeFiveSevenTerminal(
        gameId,
        round.id,
        currentGameUuid,
        handNumber,
      );
      console.log('[END_ROUND] Recovered authoritative 3-5-7 terminal settlement', settlement);
      return;
    }

    console.log(`[END_ROUND] Round already completed, skipping. round=${round.id.slice(0,8)}`);
    return;
  }

  // Immediately mark round as completed to prevent race conditions
  console.log(`[END_ROUND] Attempting atomic lock: SET status='completed' WHERE id=${round.id.slice(0,8)} AND status='betting'`);
  const { data: lockResult, error: lockError } = await supabase
    .from('rounds')
    .update({ status: 'completed' })
    .eq('id', round.id)
    .eq('status', 'betting') // Only update if still in betting status
    .select();

  console.log(`[END_ROUND] Lock result: affected_rows=${lockResult?.length ?? 0} error=${lockError?.message ?? 'none'}`);

  // If no rows were updated, another call is already processing
  if (lockError || !lockResult || lockResult.length === 0) {
    console.log(`[END_ROUND] Lock failed - round already being processed. round=${round.id.slice(0,8)}`);
    await logRaceConditionGuard(gameId, 'gameLogic:endRound:lockFailed', 'ROUND_LOCK_RACE_LOST', {
      round_id: round.id,
      round_status: round.status,
      timestamp: endRoundTimestamp,
    });
    return;
  }

  console.log(`[END_ROUND] ✅ WON LOCK - proceeding with round completion`);

  // Get all players and their decisions
  const { data: allPlayers, error: playersError } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId);

  console.log(`[END_ROUND] Players fetched: count=${allPlayers?.length ?? 0} error=${playersError?.message ?? 'none'}`);
  
  // Log EVERY player's decision for debugging
  if (allPlayers) {
    console.log(`[END_ROUND] All player decisions:`);
    allPlayers.forEach(p => {
      const username = p.is_bot ? `Bot(${p.position})` : (p.profiles?.username || `Player ${p.position}`);
      console.log(`  ${username} (pos=${p.position}): decision=${p.current_decision} locked=${p.decision_locked} status=${p.status}`);
    });
  }

  if (!allPlayers) {
    console.error(`[END_ROUND] CRITICAL: No players found. game=${shortGameId}`);
    return;
  }

  // Find players who stayed (didn't fold)
  const playersWhoStayed = allPlayers.filter(p => p.current_decision === 'stay');
  const playersWhoFolded = allPlayers.filter(p => p.current_decision === 'fold');
  const playersNoDecision = allPlayers.filter(p => p.current_decision === null || p.current_decision === undefined);
  
  console.log(`[END_ROUND] Decision summary:`);
  console.log(`  STAYED: ${playersWhoStayed.length} players - positions: [${playersWhoStayed.map(p => p.position).join(', ')}]`);
  console.log(`  FOLDED: ${playersWhoFolded.length} players - positions: [${playersWhoFolded.map(p => p.position).join(', ')}]`);
  if (playersNoDecision.length > 0) {
    console.error(`[END_ROUND] ⚠️ WARNING: ${playersNoDecision.length} players have NO DECISION! positions: [${playersNoDecision.map(p => p.position).join(', ')}]`);
  }

  // CRITICAL GUARD: If NO player has any decision (stay or fold), this is a premature call.
  // This happens when a stale all_decisions_in=true from a previous hand races with the
  // new round creation. Revert the atomic lock so the round can be processed correctly later.
  const activePlayers = allPlayers.filter(p => p.status === 'active' && !p.sitting_out);
  const activeWithDecision = activePlayers.filter(p => p.current_decision === 'stay' || p.current_decision === 'fold');
  if (activeWithDecision.length === 0 && activePlayers.length > 0) {
    console.error(`[END_ROUND] ❌ PREMATURE CALL - ${activePlayers.length} active players but ZERO decisions. Reverting round lock.`);
    // Revert: set round back to betting so the real endRound can process it later
    await supabase
      .from('rounds')
      .update({ status: 'betting' })
      .eq('id', round.id);
    // Also reset all_decisions_in since it was stale
    await supabase
      .from('games')
      .update({ all_decisions_in: false, all_decisions_in_round_id: null })
      .eq('id', gameId);
    return;
  }
  
  let resultMessage = '';

  // ============ 357 SWEEP CHECK (Round 1 only) ============
  // If any player who stayed has 3, 5, 7 in round 1, they sweep the pot and win all legs instantly
  if (currentRound === 1) {
    const { data: playerCardsFor357 } = await supabase
      .from('player_cards')
      .select('*')
      .eq('round_id', round.id);
    
    if (playerCardsFor357 && playerCardsFor357.length > 0) {
      for (const pc of playerCardsFor357) {
        const player = playersWhoStayed.find(p => p.id === pc.player_id);
        if (player) {
          const cards = pc.cards as unknown as Card[];
          if (has357Hand(cards)) {
            await settleThreeFiveSevenTerminal(
              gameId,
              round.id,
              currentGameUuid,
              handNumber,
            );
            return;

            const username = player.is_bot 
              ? getBotAlias(allPlayers, player.user_id) 
              : (player.profiles?.username || `Player ${player.position}`);
            console.log('[endRound] 🎉 357 SWEEP DETECTED!', { playerId: player.id, username, cards });
            
            // Award all legs needed to win
            const currentPot = game.pot || 0;
            
            // Give winner all the legs
            await supabase
              .from('players')
              .update({ legs: legsToWin })
              .eq('id', player.id);
            
            // Set the special result message for 357 sweep with the immutable
            // pre-zero terminal awarded amount. Project totalLegValue using
            // the post-update leg counts (winner=legsToWin, others unchanged).
            const projectedTotalLegs = allPlayers.reduce(
              (sum: number, p: any) => sum + (p.id === player.id ? legsToWin : (p.legs || 0)),
              0,
            );
            const projectedTotalPrize = currentPot + (projectedTotalLegs * legValue);
            const sweepMessage = `357_SWEEP:${username}:${projectedTotalPrize}`;

            // Set awaiting_next_round with special sweep message
            await supabase
              .from('games')
              .update({ 
                last_round_result: sweepMessage,
                awaiting_next_round: true,
                next_round_number: 1
              })
              .eq('id', gameId);
            
            // After 5 seconds (animation duration), trigger game over
            setTimeout(async () => {
              // Fetch fresh player data and game data
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*, profiles(username)')
                .eq('game_id', gameId);
              
              // Fetch fresh pot value
              const { data: freshGameData } = await supabase
                .from('games')
                .select('pot, dealer_position, current_game_uuid')
                .eq('id', gameId)
                .single();
              
              const freshPot = freshGameData?.pot || 0;
              console.log('[357 SWEEP] Fresh pot value for game over:', freshPot);
              
              await handleGameOver(
                gameId,
                player.id,
                username,
                legsToWin,
                freshPlayers || allPlayers,
                freshPot,
                legValue,
                legsToWin,
                freshGameData?.dealer_position || 1,
                freshGameData?.current_game_uuid || currentGameUuid
              );
            }, 5000);
            
            return; // Exit - 357 sweep handled
          }
        }
      }
    }
  }
  // ============ END 357 SWEEP CHECK ============

  // Award leg only if exactly one player stayed
  if (playersWhoStayed.length === 1) {
    const soloStayer = playersWhoStayed[0];
    const username = soloStayer.is_bot 
      ? getBotAlias(allPlayers, soloStayer.user_id) 
      : (soloStayer.profiles?.username || `Player ${soloStayer.position}`);
    
    console.log(`[END_ROUND] 🏆 SOLO STAY DETECTED - Awarding leg to ${username}`);
    console.log(`[END_ROUND]   Player: id=${soloStayer.id.slice(0,8)} position=${soloStayer.position} currentLegs=${soloStayer.legs} legsToWin=${legsToWin}`);
    
    // Log to persistent debug table
    await logGameState({
      gameId,
      dealerGameId: currentGameUuid,
      roundId: round.id,
      playerId: soloStayer.id,
      eventType: 'LEG_AWARDED',
      currentRound: currentRound,
      totalHands: handNumber,
      sourceLocation: 'gameLogic:endRound:soloStay',
      details: {
        username,
        current_legs: soloStayer.legs,
        new_legs: soloStayer.legs + 1,
        legs_to_win: legsToWin,
        leg_value: betAmount,
        players_who_stayed: playersWhoStayed.map(p => ({ id: p.id.slice(0,8), position: p.position })),
        all_players_decisions: allPlayers.map(p => ({ 
          position: p.position, 
          decision: p.current_decision, 
          locked: p.decision_locked,
          status: p.status,
        })),
        timestamp: new Date().toISOString(),
      },
    });
    
    // Check if player already has enough legs (game should have ended)
    if (soloStayer.legs >= legsToWin) {
      console.log(`[END_ROUND] Player already has ${legsToWin}+ legs, game should have ended`);
      return;
    }
    
    // Winning a leg costs the leg value (can go negative)
    const newLegCount = soloStayer.legs + 1;
    
    console.log(`[END_ROUND] Deducting leg cost: $${betAmount} from ${username}`);
    
    // Deduct leg cost using atomic decrement to prevent race conditions
    await supabase.rpc('decrement_player_chips', {
      player_ids: [soloStayer.id],
      amount: betAmount,
    });
    
    console.log(`[END_ROUND] Updating legs: ${soloStayer.legs} -> ${newLegCount}`);
    
    // Update legs separately (no race condition risk)
    // NOTE: Leg costs are NOT added to pot - they're held separately
    // Winner receives pot + all leg values when they win the game
    await supabase
      .from('players')
      .update({ legs: newLegCount })
      .eq('id', soloStayer.id);
    
    // CRITICAL: Record leg purchase in game_results for zero-sum accounting
    // This is a leg purchase - money held separately from pot, awarded to winner at game end
    const legChipChanges: Record<string, number> = {};
    legChipChanges[soloStayer.id] = -betAmount;
    
    const currentHandNumber = game.total_hands || 1;
    // Fire-and-forget: Record leg purchase (audit trail only)
    recordGameResult(
      gameId,
      currentHandNumber,
      null, // no winner - this is a leg purchase
      'Leg Purchase',
      `${username} paid $${betAmount} for leg ${newLegCount}`,
      0, // pot_won is 0 - money held for game winner
      legChipChanges,
      false,
      '357', // game_type
      currentGameUuid // dealer_game_id
    );
    console.log(`[END_ROUND] ✅ LEG AWARDED: ${username} now has ${newLegCount} legs`);
      
    resultMessage = `${username} won a leg`;
    
    console.log(`[END_ROUND] Leg award summary: newLegCount=${newLegCount} betAmount=${betAmount} legsToWin=${legsToWin} isFinalLeg=${newLegCount >= legsToWin}`);
    
    // If this is their final leg, they win the game immediately
    if (newLegCount >= legsToWin) {
      console.log('[SOLO WIN] Player won the game!', { username, newLegCount, legsToWin, playerId: soloStayer.id });

      await handleGameOver(
        gameId,
        soloStayer.id,
        username,
        newLegCount,
        allPlayers,
        game.pot || 0,
        legValue,
        legsToWin,
        game.dealer_position || 1,
        currentGameUuid,
        round.id,
        handNumber,
      );
      return;
      
      // Set result message and awaiting state so user sees the leg win
      const nextRound = currentRound < 3 ? currentRound + 1 : 1;
      await supabase
        .from('games')
        .update({ 
          last_round_result: resultMessage,
          awaiting_next_round: true,
          next_round_number: nextRound
        })
        .eq('id', gameId);
      
      // Fetch fresh player data after the leg/chips update above
      const { data: freshPlayers } = await supabase
        .from('players')
        .select('*, profiles(username)')
        .eq('game_id', gameId);

      await handleGameOver(
        gameId,
        soloStayer.id,
        username,
        newLegCount,
        freshPlayers || allPlayers,
        game.pot || 0,
        legValue,
        legsToWin,
        game.dealer_position || 1,
        currentGameUuid,
        round.id,
        handNumber,
      );
      return;
      
      // Wait 4 seconds to show "won a leg" message, then transition to game over
      setTimeout(async () => {
        // Fetch fresh game data to get current pot value
        const { data: freshGameData } = await supabase
          .from('games')
          .select('pot, dealer_position, current_game_uuid')
          .eq('id', gameId)
          .single();
        
        const currentPot = freshGameData?.pot || 0;
        console.log('[SOLO WIN] Fresh pot value for game over:', currentPot);
        
        // Use centralized game-over handler with fresh data
        await handleGameOver(
          gameId,
          soloStayer.id,
          username,
          newLegCount,
          freshPlayers || allPlayers,
          currentPot,
          legValue,
          legsToWin,
          freshGameData?.dealer_position || 1,
          freshGameData?.current_game_uuid || currentGameUuid
        );
      }, 4000);
      
      return; // Exit early, game over will be handled after delay
    }
    
    console.log('[endRound] Not final leg, setting awaiting_next_round for solo stayer');
    
    // CRITICAL FIX: Solo stayer with non-final leg must explicitly set awaiting_next_round
    // Previously this fell through to the showdown/pussy-tax branches incorrectly
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    await supabase
      .from('games')
      .update({ 
        awaiting_next_round: true,
        next_round_number: nextRound,
        last_round_result: resultMessage
      })
      .eq('id', gameId);
    
    console.log('[endRound] Solo stayer leg awarded, awaiting_next_round set. Next round:', nextRound);
    return; // Exit - solo stayer handled
  } else if (playersWhoStayed.length > 1) {
    console.log('[endRound] SHOWDOWN: Multiple players stayed, evaluating hands');
    // Multiple players stayed - evaluate hands for showdown
    const { data: playerCards, error: cardsError } = await supabase
      .from('player_cards')
      .select('*')
      .eq('round_id', round.id);

    console.log('[endRound] SHOWDOWN: Player cards fetch result:', {
      roundId: round.id,
      cardsCount: playerCards?.length,
      error: cardsError,
      hasCards: !!playerCards
    });

    if (playerCards && playerCards.length > 0) {
      console.log('[endRound] SHOWDOWN: Processing cards for evaluation');
      
      // VISIBILITY: Set card visibility based on round and reveal settings
      // Round 3: all seated players see cards
      // Round 1/2 with reveal: only showdown participants see cards
      const stayedPlayerIds = playersWhoStayed.map(p => p.id);
      const seatedUserIds = allPlayers.map(p => p.user_id);
      const showdownUserIds = playersWhoStayed.map(p => p.user_id);
      
      if (currentRound === 3 || revealAtShowdown) {
        // Round 3 or reveal enabled: set visibility for hand history
        const visibleTo = currentRound === 3 ? seatedUserIds : showdownUserIds;
        // Only Round 3 cards are automatically public (visible to everyone including non-participants)
        // For Rounds 1-2, cards only become public if the winner clicks "Show Cards" (handled in Game.tsx)
        const isPubliclyTabled = currentRound === 3;
        console.log('[endRound] SHOWDOWN: Setting card visibility to', visibleTo.length, 'users for', stayedPlayerIds.length, 'players, isPublic:', isPubliclyTabled);
        // Fire-and-forget: visibility update is for history only - but must actually execute!
        supabase
          .from('player_cards')
          .update({ 
            visible_to_user_ids: visibleTo,
            is_public: isPubliclyTabled 
          })
          .eq('round_id', round.id)
          .in('player_id', stayedPlayerIds)
          .then(({ error }) => {
            if (error) {
              console.error('[endRound] SHOWDOWN: Error setting card visibility:', error);
            } else {
              console.log('[endRound] SHOWDOWN: Card visibility set successfully');
            }
          });
      }
      // Only evaluate hands of players who stayed
      // 3-5-7 game uses wildcards based on round - determine explicit wild rank
      const wildRank = currentRound === 1 ? '3' : currentRound === 2 ? '5' : '7';
      const hands = playerCards
        .filter(pc => playersWhoStayed.some(p => p.id === pc.player_id))
        .map(pc => ({
          playerId: pc.player_id,
          cards: pc.cards as unknown as Card[],
          evaluation: evaluateHand(pc.cards as unknown as Card[], true, wildRank as any) // Pass correct wild rank
        }));

      console.log('[endRound] SHOWDOWN: Hands evaluated:', {
        handsCount: hands.length,
        hands: hands.map(h => ({
          playerId: h.playerId,
          rank: h.evaluation.rank,
          value: h.evaluation.value
        }))
      });

      if (hands.length > 0) {
        // Find the best hand value
        const bestValue = Math.max(...hands.map(h => h.evaluation.value));
        
        // Find ALL players with the best hand (to detect ties)
        const winners = hands.filter(h => h.evaluation.value === bestValue);
        
        console.log('[endRound] SHOWDOWN: Best hands found:', {
          bestValue,
          winnerCount: winners.length,
          winners: winners.map(w => ({ playerId: w.playerId, rank: w.evaluation.rank }))
        });

        if (winners.length > 1) {
          // TIE - no money changes hands, just show the tie message
          const tiedPlayerNames: string[] = [];
          for (const w of winners) {
            const player = playersWhoStayed.find(p => p.id === w.playerId);
            if (player) {
              const name = player.is_bot 
                ? getBotAlias(allPlayers, player.user_id) 
                : (player.profiles?.username || `Player ${player.position}`);
              tiedPlayerNames.push(name);
            }
          }
          const handName = formatHandRankDetailed(winners[0].cards, true, wildRank as any);
          resultMessage = `${tiedPlayerNames.join(' and ')} tied with ${handName} - no money changes hands`;
          
          console.log('[endRound] SHOWDOWN: TIE detected, no chips transferred:', {
            tiedPlayers: tiedPlayerNames,
            handName
          });
        } else {
          // Single winner - transfer chips
          const winner = winners[0];

          console.log('[endRound] SHOWDOWN: Single winner determined:', {
            winnerId: winner.playerId,
            winnerRank: winner.evaluation.rank,
            winnerValue: winner.evaluation.value
          });

          const { data: winningPlayer } = await supabase
            .from('players')
            .select('*, profiles(username)')
            .eq('id', winner.playerId)
            .single();

          if (winningPlayer) {
            const winnerUsername = winningPlayer.is_bot 
              ? getBotAlias(allPlayers, winningPlayer.user_id) 
              : (winningPlayer.profiles?.username || `Player ${winningPlayer.position}`);
            const handName = formatHandRankDetailed(winner.cards, true, wildRank as any);
            
            const currentPot = game.pot || 0;
            let totalWinnings = 0;
            
            // Charge each loser and award the winner in one atomic transfer
            // projection. Independent RPCs used to race raw realtime rows.
            const loserIds: string[] = [];
            let amountPerLoser = 0;
            const showdownTransfers: ReturnType<typeof playerToPlayer>[] = [];
            for (const player of playersWhoStayed) {
              if (player.id !== winner.playerId) {
                let amountToCharge;
                if (potMaxEnabled) {
                  // With pot max: charge current pot value, capped at pot max
                  amountToCharge = Math.min(currentPot, potMaxValue);
                } else {
                  // No pot max: charge entire current pot value
                  amountToCharge = currentPot;
                }
                totalWinnings += amountToCharge;
                amountPerLoser = amountToCharge; // All losers pay same amount
                loserIds.push(player.id);
                showdownTransfers.push(playerToPlayer(player.id, winner.playerId, amountToCharge));
              }
            }
            try {
              await settleGameplayChipTransfers(gameId, showdownTransfers, 'transfer');
              console.log('[endRound] SHOWDOWN: Awarded', totalWinnings, 'to winner', winner.playerId);
            } catch (winnerError) {
              console.error('[endRound] SHOWDOWN: atomic transfer failed:', winnerPlayer.id, winnerError);
            }
            
            // CRITICAL: Record showdown chip changes in game_results for zero-sum accounting
            // Winner gains what losers paid (not the pot - pot came from antes which are tracked separately)
            const showdownChipChanges: Record<string, number> = {};
            showdownChipChanges[winner.playerId] = totalWinnings;
            for (const loserId of loserIds) {
              showdownChipChanges[loserId] = -amountPerLoser;
            }
            
            // Get current hand number
            const currentHandNumber = game.total_hands || 1;
            
            // Fire-and-forget: Record showdown result (audit trail only)
            recordGameResult(
              gameId,
              currentHandNumber,
              winner.playerId,
              winnerUsername,
              handName,
              totalWinnings, // pot_won = what winner received from losers
              showdownChipChanges,
              false,
              '357', // game_type
              currentGameUuid // dealer_game_id
            );
            console.log('[endRound] SHOWDOWN: Recorded chip changes:', showdownChipChanges);
            
            // Include metadata for chip transfer animation (similar to Holm format)
            // Format: "WinnerName won showdown|||WINNER:id|||LOSERS:ids|||AMOUNT:x|||HANDNAME:handDescription"
            // Client-side decides whether to show hand name based on reveal_at_showdown setting
            const showdownResult = `${winnerUsername} won showdown|||WINNER:${winner.playerId}|||LOSERS:${loserIds.join(',')}|||AMOUNT:${amountPerLoser}|||HANDNAME:${handName}`;
            
            console.log('[endRound] SHOWDOWN: Result determined:', {
              winner: winnerUsername,
              winnings: totalWinnings,
              handName,
              resultMessage: showdownResult
            });
            
            // ── 357-showdown-resolved (always-on investigation) ──
            const { persist357Investigation } = await import('./threeFiveSevenSyncDiagnostics');
            persist357Investigation(gameId, game.total_hands || 1, '357-showdown-resolved', {
              roundId: round.id.slice(0, 8),
              handNumber: game.total_hands || 1,
              roundNumber: currentRound,
              winnerPlayerId: winner.playerId.slice(0, 8),
              loserPlayerIds: loserIds.map((id: string) => id.slice(0, 8)),
              amount: amountPerLoser,
              bothStayed: playersWhoStayed.length > 1,
              handRanks: hands.map(h => ({ pid: h.playerId.slice(0, 8), rank: h.evaluation.rank, value: h.evaluation.value })),
              transitionType: 'showdown',
            }, round.id);
            
            resultMessage = showdownResult;
          } else {
            console.log('[endRound] SHOWDOWN: ERROR - No winning player found');
          }
        }
      } else {
        console.log('[endRound] SHOWDOWN: ERROR - No hands to evaluate');
      }
    } else {
      console.log('[endRound] SHOWDOWN: ERROR - No player cards found or empty array');
    }

    // Showdowns never end the game - continue to next round
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    
    console.log('[endRound] SHOWDOWN: Preparing to set awaiting_next_round', {
      gameId,
      currentRound,
      nextRound,
      resultMessage,
      hasResultMessage: resultMessage.length > 0
    });
    
    // Set game to await next round with result visible
    // Frontend will handle the 4-second delay before starting next round
    const { data: updateResult, error: updateError } = await supabase
      .from('games')
      .update({ 
        awaiting_next_round: true,
        next_round_number: nextRound,
        last_round_result: resultMessage  // Set result message here atomically
        // proceedToNextRound will clear it after 4 seconds
      })
      .eq('id', gameId)
      .select();
    
    console.log('[endRound] SHOWDOWN: awaiting_next_round update result:', {
      error: updateError,
      rowsUpdated: updateResult?.length,
      awaiting: updateResult?.[0]?.awaiting_next_round
    });
    
    // ── 357-last-round-result-persisted (always-on investigation) ──
    const { classify357TransitionType, persist357Investigation: persist357Inv } = await import('./threeFiveSevenSyncDiagnostics');
    persist357Inv(gameId, game.total_hands || 1, '357-last-round-result-persisted', {
      roundId: round.id.slice(0, 8),
      roundNumber: currentRound,
      lastRoundResultPresent: !!resultMessage,
      lastRoundResultLength: resultMessage.length,
      awaitingNextRound: !updateError && (updateResult?.length ?? 0) > 0,
      winnerPlayerId: resultMessage.match(/\|\|\|WINNER:([^|]+)/)?.[1]?.slice(0, 8) ?? null,
      amount: parseInt(resultMessage.match(/\|\|\|AMOUNT:(\d+)/)?.[1] ?? '0', 10),
      transitionType: classify357TransitionType(resultMessage),
    }, round.id);
    
    return; // Exit after showdown handling
  } else {
    // Everyone folded - apply pussy tax if enabled
    console.log('[endRound] EVERYONE FOLDED - applying pussy tax logic');
    
    if (pussyTaxEnabled) {
      // Reset player statuses so chip animations are visible
      // SCOPED: do not revive stood-up ('left') or observer rows back to active.
      await supabase
        .from('players')
        .update({ 
          status: 'active',
          current_decision: null
        })
        .eq('game_id', gameId)
        .neq('status', 'left')
        .neq('status', 'observer');
      
      // Only charge active (non-sitting-out) players
      const activePlayersForTax = allPlayers.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
      const playerIds = activePlayersForTax.map(p => p.id);
      
      console.log('[endRound] Charging pussy tax to', playerIds.length, 'active players, amount:', pussyTaxValue);
      
      let taxError: unknown = null;
      try {
        await settleGameplayChipTransfers(
          gameId,
          playerIds.map((playerId) => playerToPot(playerId, pussyTaxValue)),
          'bet',
        );
      } catch (error) {
        taxError = error;
      }
      
      if (taxError) {
        console.error('[357 END] Pussy tax decrement error:', taxError);
        // RPC failed - log but don't use non-atomic fallback which causes accounting drift
      } else {
        // CRITICAL: Record pussy tax in game_results for zero-sum accounting
        const pussyTaxChipChanges: Record<string, number> = {};
        for (const player of activePlayersForTax) {
          pussyTaxChipChanges[player.id] = -pussyTaxValue;
        }
        
        const currentHandNumber = game.total_hands || 1;
        // Fire-and-forget: Record pussy tax (audit trail only)
        recordGameResult(
          gameId,
          currentHandNumber,
          null, // no winner - this is tax going into pot
          'Pussy Tax',
          `${activePlayersForTax.length} players paid $${pussyTaxValue} pussy tax`,
          0, // pot_won is 0 - money going INTO pot
          pussyTaxChipChanges,
          false,
          '357', // game_type
          currentGameUuid // dealer_game_id
        );
        console.log('[endRound] Recorded pussy tax chip changes:', pussyTaxChipChanges);
      }
      const taxCollected = pussyTaxValue * activePlayersForTax.length;
      
      console.log('[endRound] Pussy tax applied:', { taxCollected, newPot: (game.pot || 0) + taxCollected });
      
      // Use consistent message that frontend expects (case-insensitive check)
      resultMessage = 'Pussy Tax';
    } else {
      resultMessage = 'Everyone folded - no winner';
    }
  }

  // Only set awaiting_next_round if we're not ending the game
  // Check if game is over by re-fetching to see if status was set to game_over
  const { data: finalGameState } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single();
  
  console.log(`[END_ROUND] Final game status: ${finalGameState?.status}`);
  
  if (finalGameState?.status !== 'game_over') {
    const nextRound = currentRound < 3 ? currentRound + 1 : 1;
    
    console.log(`[END_ROUND] Setting awaiting_next_round=true, next_round=${nextRound}, result="${resultMessage}"`);
    
    const { data: awaitResult, error: awaitError } = await supabase
      .from('games')
      .update({ 
        last_round_result: resultMessage,
        awaiting_next_round: true,
        next_round_number: nextRound
      })
      .eq('id', gameId)
      .select();
    
    if (awaitError) {
      console.error(`[END_ROUND] ERROR setting awaiting_next_round:`, awaitError);
    } else {
      console.log(`[END_ROUND] ✅ awaiting_next_round set. affected_rows=${awaitResult?.length ?? 0}`);
    }
    
    // Log successful round completion
    await logGameState({
      gameId,
      dealerGameId: currentGameUuid,
      roundId: round.id,
      eventType: 'ROUND_COMPLETE',
      currentRound: currentRound,
      totalHands: handNumber,
      sourceLocation: 'gameLogic:endRound:complete',
      details: {
        result: resultMessage,
        next_round: nextRound,
        players_stayed: playersWhoStayed.length,
        players_folded: playersWhoFolded.length,
        final_status: finalGameState?.status,
        timestamp: new Date().toISOString(),
      },
    });
  } else {
    console.log(`[END_ROUND] Game is over, not setting awaiting_next_round`);
  }
  
  console.log(`[END_ROUND] ===== COMPLETE ===== game=${shortGameId}`);
}

export async function proceedToNextRound(gameId: string) {
  console.log('[PROCEED_NEXT_ROUND] Starting for game', gameId);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, current_game_uuid, total_hands, current_round, next_round_number, status, awaiting_next_round, game_type')
    .eq('id', gameId)
    .single();

  if (gameError || !game) throw gameError ?? new Error('3-5-7 game not found');

  const _gt = (game as any)?.game_type;
  const _is357 = _gt === '3-5-7' || _gt === '3-5-7-game' || _gt === '357';
  if (!_is357) {
    console.warn('[PROCEED_NEXT_ROUND] proceedToNextRound-suppressed-non-357 — game_type=', _gt);
    return;
  }

  if (!game?.next_round_number) {
    console.log('[PROCEED_NEXT_ROUND] No next round configured');
    return;
  }

  if (!game.awaiting_next_round) {
    console.log('[PROCEED_NEXT_ROUND] Not awaiting next round, skipping');
    return;
  }

  if (!game.current_game_uuid || !game.total_hands || !game.current_round) {
    throw new Error('three_five_seven_advance_round requires exact predecessor identity');
  }
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, dealer_game_id, hand_number, round_number')
    .eq('game_id', gameId)
    .eq('dealer_game_id', game.current_game_uuid)
    .eq('hand_number', game.total_hands)
    .eq('round_number', game.current_round)
    .single();
  if (roundError || !round) throw roundError ?? new Error('3-5-7 predecessor round not found');

  const { data, error } = await supabase.rpc('three_five_seven_advance_round' as any, {
    p_game_id: gameId,
    p_round_id: round.id,
    p_dealer_game_id: round.dealer_game_id,
    p_hand_number: round.hand_number,
    p_round_number: round.round_number,
  } as any);
  if (error) throw error;
  console.log('[PROCEED_NEXT_ROUND] Authoritative advance result:', data);
  return data;
}

/**
 * Atomic 3-5-7 round-transition orchestrator.
 *
 * Sends ONLY transition identity to the `advance_357_round` RPC. The
 * server derives the roster, reads prior-round cards for carry-forward,
 * builds the deck, shuffles, deals, resets players, collects the persisted
 * rollover at the R3 -> next-hand R1 seam, and updates the game pointer — all
 * inside a single locked
 * transaction.
 *
 * Round-only fold semantics: every non-left / non-observer / non-sitting
 * player receives the destination card set and normal Drop/Stay
 * eligibility, regardless of the previous round's fold/stay decision.
 *
 * For the new-hand R1 seam only: this function also (a) records the rollover audit
 * game_result row, and (b) invokes the extracted instant-357 detection
 * & settlement helper. Both are guarded on `status === 'advanced'` so
 * a `repaired_and_advanced` / `already_advanced` retry does not
 * double-record.
 */
async function advance357RoundAtomic(
  gameId: string,
  nextRoundNumber: 1 | 2 | 3,
): Promise<{ status: string; round_id?: string }> {
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('id, current_game_uuid, total_hands, ante_amount, game_type, pot, current_host, dealer_position')
    .eq('id', gameId)
    .single();
  if (gameErr || !game) {
    throw new Error(`advance357:game_fetch_failed: ${gameErr?.message ?? 'no row'}`);
  }
  const dealerGameId = game.current_game_uuid;
  if (!dealerGameId) throw new Error('advance357:no_dealer_game_uuid');

  // Hand number: incremented server-side ONLY on R1 seam. For R2/R3
  // the server uses `COALESCE(games.total_hands, ...)` so we pass the
  // current hand number unchanged.
  const currentHandNumber = typeof game.total_hands === 'number' ? game.total_hands : 0;
  const handNumberForRpc = nextRoundNumber === 1 ? currentHandNumber + 1 : (currentHandNumber || 1);

  // Timer for destination round.
  const { data: gameDefaults } = await supabase
    .from('game_defaults')
    .select('decision_timer_seconds')
    .eq('game_type', '3-5-7')
    .maybeSingle();
  const timerSeconds = gameDefaults?.decision_timer_seconds ?? 10;
  const deadline = new Date(Date.now() + (timerSeconds + 2) * 1000).toISOString();

  // Harness force-hand override — R1 seam only.
  // The RPC applies this per-player when the player has no carry-forward
  // (i.e. new-hand R1). Ordinary clients pass null.
  let forcedHandByPlayer: Record<string, Card[]> | null = null;
  if (nextRoundNumber === 1) {
    try {
      const harnessId = await readDebugHarness('3-5-7');
      if (harnessId === 'instant_win') {
        const { data: roster } = await supabase
          .from('players')
          .select('id, user_id, position, status, sitting_out, is_bot, created_at')
          .eq('game_id', gameId);
        const active = (roster ?? []).filter(
          (p: any) => !p.sitting_out && p.status !== 'observer' && p.status !== 'left',
        );
        const sessionHostPlayerId = resolveSessionHostPlayerId(
          { current_host: (game as any).current_host ?? null },
          active.map((p: any) => ({
            id: p.id, user_id: p.user_id ?? null,
            is_bot: p.is_bot ?? null, created_at: p.created_at ?? null,
          })),
        );
        const dealerPos = (game as any).dealer_position ?? null;
        const dealerPlayer = dealerPos != null
          ? active.find((p: any) => p.position === dealerPos) ?? null
          : null;
        const targetId = dealerPlayer?.id ?? sessionHostPlayerId;
        if (targetId) {
          forcedHandByPlayer = { [targetId]: FORCED_357_CARDS };
        }
      }
    } catch { /* harness read is best-effort */ }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('advance_357_round', {
    _game_id: gameId,
    _dealer_game_id: dealerGameId,
    _next_round_number: nextRoundNumber,
    _next_hand_number: handNumberForRpc,
    _decision_deadline: deadline,
    _forced_hand_by_player: forcedHandByPlayer as any,
  });
  if (rpcErr) {
    throw new Error(`advance357:rpc_failed: ${rpcErr.message}`);
  }
  const result = (rpcData ?? { status: 'unknown' }) as { status: string; round_id?: string };

  // New-hand R1 seam consequences (rollover audit game_results row AND instant-357
  // detection + full sweep settlement) are now committed inside the
  // `advance_357_round` RPC transaction. No browser callback is required
  // after the RPC returns — if the client disconnects immediately, the
  // authoritative state is still complete.
  return result;
}

