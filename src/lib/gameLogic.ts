import { supabase } from "@/integrations/supabase/client";
import { createDeck, shuffleDeck, type Card, evaluateHand, formatHandRank, formatHandRankDetailed, has357Hand } from "./cardUtils";
import {
  buildAdvance357CardAssignments,
  cardsDealtForRound,
  type EligiblePlayer,
} from "./threeFiveSeven/advanceRound";
import { readDebugHarness } from "./debugHarness/useDebugHarness";
import { submitHolmDecision } from './holmDecisionAuthority';
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

    return submitHolmDecision({
      gameId,
      roundId: expectedRoundId,
      playerId,
      decision,
    });
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


// Final 3-5-7 decisions resolve in their action transaction. Holm's optional
// recovery delivery delegates the exact round to its existing server owner.
export async function endRound(gameId: string) {
  const { data: game, error } = await supabase.from('games')
    .select('game_type,current_game_uuid,total_hands,status').eq('id', gameId).single();
  if (error) throw error;
  if (!game || !['holm', 'holm-game'].includes(game.game_type ?? '') ||
      game.status !== 'in_progress' || !game.current_game_uuid) return;
  const { data: round, error: roundError } = await supabase.from('rounds').select('id')
    .eq('game_id', gameId).eq('dealer_game_id', game.current_game_uuid)
    .eq('hand_number', game.total_hands).order('round_number', { ascending: false }).limit(1).maybeSingle();
  if (roundError) throw roundError;
  if (!round) return;
  const { error: resolveError } = await supabase.rpc('resolve_holm_showdown' as any, {
    p_game_id: gameId, p_expected_round_id: round.id,
  } as any);
  if (resolveError) throw resolveError;
}

export interface ThreeFiveSevenAdvanceRoundResult {
  outcome?: string;
  deduped?: boolean;
  round_id?: string;
  hand_number?: number;
  round_number?: number;
  game?: {
    id?: string;
    current_game_uuid?: string | null;
    chip_transfer_cursor?: number | null;
    [key: string]: unknown;
  };
  round?: {
    id?: string;
    dealer_game_id?: string | null;
    hand_number?: number | null;
    round_number?: number | null;
    status?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function proceedToNextRound(
  gameId: string,
  exactPredecessor?: {
    dealerGameId: string;
    roundId: string;
    handNumber: number;
    roundNumber: number;
  },
): Promise<ThreeFiveSevenAdvanceRoundResult | null> {
  console.log('[PROCEED_NEXT_ROUND] Starting for game', gameId);

  if (exactPredecessor) {
    const { data, error } = await supabase.rpc('three_five_seven_advance_round' as any, {
      p_game_id: gameId,
      p_round_id: exactPredecessor.roundId,
      p_dealer_game_id: exactPredecessor.dealerGameId,
      p_hand_number: exactPredecessor.handNumber,
      p_round_number: exactPredecessor.roundNumber,
    } as any);
    if (error) throw error;
    console.log('[PROCEED_NEXT_ROUND] Exact authoritative advance result:', data);
    return data as unknown as ThreeFiveSevenAdvanceRoundResult;
  }

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
    return null;
  }

  if (!game?.next_round_number) {
    console.log('[PROCEED_NEXT_ROUND] No next round configured');
    return null;
  }

  if (!game.awaiting_next_round) {
    console.log('[PROCEED_NEXT_ROUND] Not awaiting next round, skipping');
    return null;
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
  return data as unknown as ThreeFiveSevenAdvanceRoundResult;
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

