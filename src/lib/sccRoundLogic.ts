/**
 * Ship Captain Crew Round Logic
 * Handles creating and managing rounds for the SCC dice game
 * Follows the same pattern as horsesRoundLogic.ts
 */

import { supabase } from "@/integrations/supabase/client";
import { getMakeItTakeItSetting } from "@/hooks/useMakeItTakeIt";
import { recordGameResult } from "./gameLogic";
import { logRaceConditionGuard } from "./gameStateDebugLog";
import { logSCCAnteApplied } from "./sccSyncDiagnostics";
import { persistTransition, persistSyncDebugEvent } from "./persistSyncDebugEvent";
import type { HorsesRoundCallerContext } from "./horsesRoundLogic";
import { nextClockwise } from "./canonicalShell/seatRing";

/**
 * Start a new Ship Captain Crew round
 * Creates a round record and sets the game to in_progress
 * Collects antes from all active players and sets the pot
 */
export async function startSCCRound(
  gameId: string,
  isFirstHand: boolean = false,
  callerContext?: HorsesRoundCallerContext,
): Promise<void> {

  const callerInvocationId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Get current game state including ante_amount
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('current_round, total_hands, pot, ante_amount, status, awaiting_next_round, dealer_position, current_game_uuid, is_paused, ante_decision_deadline, is_first_hand')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError || !game) {
    console.error('[SCC] Failed to get game:', gameError);
    throw new Error('Failed to get game state');
  }

  // P0 #2 INSTRUMENTATION: attempt event with caller context + observed pre-state
  let callerUserIdAttempt: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    callerUserIdAttempt = user?.id ?? null;
  } catch { /* */ }
  persistSyncDebugEvent({
    gameId,
    gameType: 'ship-captain-crew',
    handNumber: (game as any)?.total_hands ?? 0,
    roundId: null,
    eventType: 'invariant',
    severity: 'info',
    eventName: 'scc-round-create-attempt',
    payload: {
      callerInvocationId,
      callerUserId: callerUserIdAttempt?.slice(0, 8) ?? null,
      isFirstHand,
      callerContext: callerContext ?? null,
      observedGame: {
        status: game.status,
        awaitingNextRound: game.awaiting_next_round,
        currentRound: game.current_round,
        totalHands: game.total_hands,
        dealerGameId: (game.current_game_uuid as string | null)?.slice(0, 8) ?? null,
        isFirstHandFlag: (game as any).is_first_hand,
        isPaused: (game as any).is_paused,
        anteDecisionDeadline: (game as any).ante_decision_deadline ?? null,
      },
      tsClient: Date.now(),
    },
  });

  // CRITICAL GUARD: Block round creation if game is paused
  if ((game as any).is_paused) {
    logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'BLOCKED_PAUSED', {
      currentStatus: game.status,
      isFirstHand,
      dealerGameId: game.current_game_uuid,
    });
    console.warn('[SCC] Blocked round start - game is paused');
    return;
  }

  // TERMINAL STATE GUARD: Don't start rounds if game is already over
  if (game.status === 'game_over' || game.status === 'session_ended') {
    logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'BLOCKED_GAME_OVER', {
      currentStatus: game.status,
      dealerGameId: game.current_game_uuid,
      isFirstHand,
    });
    return;
  }

  // CORRECT APPROACH: Each dealer_game_id has its own hand/round numbering starting at 1.
  // The unique constraint is now (dealer_game_id, hand_number, round_number).
  // Query only rounds for THIS dealer game to find the next hand/round number.
  const dealerGameId = game.current_game_uuid;
  
  let newRoundNumber: number;
  let newHandNumber: number;
  
  if (isFirstHand) {
    // First hand of this dealer game = hand 1, round 1
    newRoundNumber = 1;
    newHandNumber = 1;
  } else {
    // Find max hand/round within THIS dealer game only (for rollovers)
    const { data: latestRound, error: latestRoundError } = await supabase
      .from('rounds')
      .select('hand_number, round_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRoundError) {
      console.warn('[SCC] Failed to read latest round (continuing):', latestRoundError);
    }

    // For SCC, hand_number = round_number (one hand per round)
    newHandNumber = (latestRound?.hand_number ?? 0) + 1;
    newRoundNumber = newHandNumber;
  }
  

  // CRITICAL: Prevent multi-client race where multiple players start the first hand at the same time,
  // OR multiple clients try to start the next hand after a rollover.
  // We "claim" the right to start the new hand by atomically flipping pointers on the game row.
  // This also clears any stale game_over / last_round_result so the UI doesn't show the previous winner.
  if (isFirstHand) {
    const { data: claim, error: claimError } = await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: newHandNumber,
        awaiting_next_round: false,
        all_decisions_in: false,
        last_round_result: null,
        game_over_at: null,
        is_first_hand: true,
      })
      .eq('id', gameId)
      .neq('status', 'in_progress')
      .select('id');

    if (claimError) {
      console.warn('[SCC] Failed to claim first-hand start (continuing):', claimError);
    }

    if (!claim || claim.length === 0) {
      logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'FIRST_HAND_CLAIM_LOST', {
        dealerGameId: game.current_game_uuid,
      });
      return;
    }
    logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'FIRST_HAND_CLAIM_WON', {
      dealerGameId: game.current_game_uuid,
      newHandNumber: newHandNumber,
    });
  } else if (game.awaiting_next_round) {
    // Rollover / re-ante: multiple clients may see awaiting_next_round and try to start the next hand.
    let q = supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: newHandNumber,
        awaiting_next_round: false,
        all_decisions_in: false,
        last_round_result: null,
        game_over_at: null,
        is_first_hand: false,
      })
      .eq('id', gameId)
      .eq('awaiting_next_round', true);

    // Only one client should succeed: require the current_round we observed.
    if (typeof game.current_round === 'number') q = q.eq('current_round', game.current_round);
    else q = q.is('current_round', null);

    const { data: claim, error: claimError } = await q.select('id');

    if (claimError) {
      console.warn('[SCC] Failed to claim rollover start (continuing):', claimError);
    }

    // P0 #2 INSTRUMENTATION: persist rollover claim outcome with caller context
    persistSyncDebugEvent({
      gameId,
      gameType: 'ship-captain-crew',
      handNumber: newHandNumber,
      roundId: null,
      eventType: 'invariant',
      severity: claim && claim.length > 0 ? 'info' : 'warn',
      eventName: claim && claim.length > 0 ? 'scc-rollover-claim-won' : 'scc-rollover-claim-lost',
      payload: {
        callerInvocationId,
        callerUserId: callerUserIdAttempt?.slice(0, 8) ?? null,
        callerContext: callerContext ?? null,
        newRoundNumber,
        newHandNumber,
        observedCurrentRound: game.current_round,
        observedAwaitingNextRound: game.awaiting_next_round,
        claimError: claimError?.message ?? null,
        tsClient: Date.now(),
      },
    });

    if (!claim || claim.length === 0) {
      logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'ROLLOVER_CLAIM_LOST', {
        dealerGameId: game.current_game_uuid,
        previousRound: game.current_round,
      });
      return;
    }
    logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'ROLLOVER_CLAIM_WON', {
      dealerGameId: game.current_game_uuid,
      newHandNumber: newHandNumber,
    });
  }
  // Check if round already exists within THIS dealer game (race condition protection)
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id, pot, hand_number')
    .eq('dealer_game_id', dealerGameId)
    .eq('hand_number', newHandNumber)
    .eq('round_number', newRoundNumber)
    .maybeSingle();

  if (existingRound) {

    logRaceConditionGuard(gameId, 'sccRoundLogic:startSCCRound', 'ROUND_ALREADY_EXISTS', {
      existingRoundId: existingRound.id,
      roundNumber: newRoundNumber,
      handNumber: newHandNumber,
      dealerGameId,
    });

    const existingHandNumber = (existingRound as any)?.hand_number as number | null;

    await supabase
      .from('games')
      .update({
        status: 'in_progress',
        current_round: newRoundNumber,
        total_hands: existingHandNumber ? Math.max(newHandNumber, existingHandNumber) : newHandNumber,
        pot: (existingRound as any)?.pot ?? game.pot ?? 0,
        all_decisions_in: false,
        awaiting_next_round: false,
        last_round_result: null,
        game_over_at: null,
        is_first_hand: isFirstHand,
      })
      .eq('id', gameId);

    return;
  }

  // Get active players for ante collection
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, position, is_bot, chips, sitting_out, sit_out_next_hand, status')
    .eq('game_id', gameId);

  if (playersError) {
    console.error('[SCC] Failed to get players:', playersError);
    throw new Error('Failed to get players');
  }

  // For rollovers (not first hand), reactivate ALL sitting_out players for the tiebreaker
  // A rollover is a continuation of the SAME hand, so sit_out_next_hand should NOT apply
  // (it means "sit out the next GAME", not "sit out the rollover")
  // CRITICAL: do NOT reactivate observer/left players — they are not participants.
  if (!isFirstHand) {
    const playersToReactivate = (players || []).filter(
      (p) => p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left'
    );
    if (playersToReactivate.length > 0) {
      const reactivateIds = playersToReactivate.map((p) => p.id);
      await supabase
        .from('players')
        .update({ sitting_out: false })
        .in('id', reactivateIds);
    }
  }

  // Re-fetch to get updated sitting_out status
  const { data: freshPlayers } = await supabase
    .from('players')
    .select('id, user_id, position, is_bot, chips, sitting_out, status')
    .eq('game_id', gameId);

  // Exclude observer/left from active participants — they have no turn, no ante, no roll.
  const activePlayers = (freshPlayers || []).filter(
    (p) => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left'
  );
  const anteAmount = game.ante_amount || 1;

  // Read configurable turn timer from game_defaults
  const { data: gameDefaultsData } = await supabase
    .from('game_defaults')
    .select('decision_timer_seconds')
    .eq('game_type', 'ship-captain-crew')
    .maybeSingle();
  const turnTimerSeconds = gameDefaultsData?.decision_timer_seconds ?? 30;

  // Pre-initialize horses_state (reused column) so SCC can start even if the client can't UPDATE rounds (RLS-safe).
  const sortedActive = [...activePlayers].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const dealerPos = (game as any)?.dealer_position as number | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dealerIdx = dealerPos ? sortedActive.findIndex((p) => p.position === dealerPos) : -1;

  // Check Make It Take It setting - if enabled, dealer goes first, otherwise player clockwise (left) of dealer
  const makeItTakeIt = await getMakeItTakeItSetting();

  // Canonical clockwise iteration via seatRing (Wave 3 P1-A): clockwise =
  // nearest LOWER occupied position. SCC now matches Holm/357/Horses.
  let turnOrder: string[];
  if (dealerIdx >= 0 && dealerPos != null) {
    const positions = sortedActive.map((p) => p.position!).filter((p): p is number => p != null);
    const byPos = new Map(sortedActive.map((p) => [p.position!, p]));
    const startPos = makeItTakeIt ? dealerPos : nextClockwise(dealerPos, positions);
    const ordered: string[] = [];
    let cur = startPos;
    for (let i = 0; i < sortedActive.length; i++) {
      const player = byPos.get(cur);
      if (player) ordered.push(player.id);
      cur = nextClockwise(cur, positions);
    }
    turnOrder = ordered;
  } else {
    turnOrder = sortedActive.map((p) => p.id);
  }

  const firstTurnPlayer = sortedActive.find((p) => p.id === turnOrder[0]) ?? null;
  const controllerUserId =
    turnOrder
      .map((id) => sortedActive.find((p) => p.id === id))
      .find((p) => p && !p.is_bot)?.user_id ?? null;

  const initialDice = [
    { value: 0, isHeld: false, isSCC: false },
    { value: 0, isHeld: false, isSCC: false },
    { value: 0, isHeld: false, isSCC: false },
    { value: 0, isHeld: false, isSCC: false },
    { value: 0, isHeld: false, isSCC: false },
  ];

  const initialState: any = {
    currentTurnPlayerId: turnOrder[0] ?? null,
    playerStates: Object.fromEntries(
      turnOrder.map((pid) => [
        pid,
        { dice: initialDice, rollsRemaining: 3, isComplete: false },
      ]),
    ),
    gamePhase: 'playing',
    turnOrder,
    botControllerUserId: controllerUserId,
    turnDeadline: firstTurnPlayer?.is_bot
      ? null
      : new Date(Date.now() + turnTimerSeconds * 1000).toISOString(),
  };

  // Calculate pot: previous pot (for re-ante/tie) + new antes
  const newAnteTotal = activePlayers.length * anteAmount;
  const potForRound = (isFirstHand ? 0 : (game.pot || 0)) + newAnteTotal;

  // STEP 1: Create the round record FIRST (before collecting antes)
  // NOTE: cards_dealt has a check constraint (2-7) - use 2 as minimum for non-card games
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .insert({
      game_id: gameId,
      round_number: newRoundNumber,
      hand_number: newHandNumber,
      cards_dealt: 2, // SCC doesn't deal cards but constraint requires >= 2
      status: 'betting', // Use existing status; horses_state manages gamePhase
      pot: potForRound,
      horses_state: initialState,
      dealer_game_id: game.current_game_uuid || null,
    })
    .select()
    .single();

  if (roundError || !roundData) {
    console.error('[SCC] Failed to create round:', roundError);
    throw new Error('Failed to create round');
  }

  // P0 #2 INSTRUMENTATION: persist successful round creation with caller context
  persistSyncDebugEvent({
    gameId,
    gameType: 'ship-captain-crew',
    handNumber: newHandNumber,
    roundId: roundData.id,
    eventType: 'invariant',
    severity: 'info',
    eventName: 'scc-round-created',
    payload: {
      callerInvocationId,
      callerUserId: callerUserIdAttempt?.slice(0, 8) ?? null,
      callerContext: callerContext ?? null,
      newRoundId: roundData.id.slice(0, 8),
      isFirstHand,
      newRoundNumber,
      newHandNumber,
      dealerGameId: (game.current_game_uuid as string | null)?.slice(0, 8) ?? null,
      prevAwaitingNextRound: game.awaiting_next_round,
      prevStatus: game.status,
      prevAnteDecisionDeadline: (game as any).ante_decision_deadline ?? null,
      prevIsFirstHandFlag: (game as any).is_first_hand,
      potForRound,
      activePlayerCount: activePlayers.length,
      turnOrder: turnOrder.map(p => p.slice(0, 8)),
      firstTurnPlayer: turnOrder[0]?.slice(0, 8) ?? null,
      tsClient: Date.now(),
    },
  });

  logSCCAnteApplied(gameId, newHandNumber, potForRound, activePlayers.length, anteAmount, roundData.id);

  // STEP 2: Update game status/pointers BEFORE collecting antes
  // CRITICAL: Clear stale deadlines from config/ante phases so cron doesn't enforce them mid-game
  const { error: updateError } = await supabase
    .from('games')
    .update({
      status: 'in_progress',
      current_round: newRoundNumber,
      total_hands: newHandNumber,
      pot: potForRound,
      all_decisions_in: false,
      awaiting_next_round: false,
      last_round_result: null,
      game_over_at: null,
      is_first_hand: isFirstHand,
      config_deadline: null,
      ante_decision_deadline: null,
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('[SCC] Failed to update game:', updateError);
  }


  // STEP 3: Collect antes AFTER round is created and game pointers are set
  if (activePlayers.length > 0 && anteAmount > 0) {
    const playerIds = activePlayers.map((p) => p.id);
    const { error: anteError } = await supabase.rpc('decrement_player_chips', {
      player_ids: playerIds,
      amount: anteAmount,
    });

    if (anteError) {
      console.error('[SCC] ERROR collecting antes:', anteError);
    } else {
      
      // CRITICAL: Record ante deductions in game_results to maintain zero-sum accounting
      // Each player's ante payment is tracked as a negative chip change
      const anteChipChanges: Record<string, number> = {};
      for (const player of activePlayers) {
        anteChipChanges[player.id] = -anteAmount;
      }
      
      const eventType = isFirstHand ? 'Ante' : 'Re-Ante (Rollover)';

      persistTransition(gameId, 'ship-captain-crew', newHandNumber, 'ante-applied', {
        playerCount: activePlayers.length,
        anteAmount,
        pot: potForRound,
        isFirstHand,
      });
      
      // Fire-and-forget: Record antes (audit trail only)
      recordGameResult(
        gameId,
        newHandNumber,
        null, // no winner - this is ante collection
        eventType, // Description
        `${activePlayers.length} players ${isFirstHand ? 'anted' : 're-anted'} $${anteAmount}`,
        0, // pot_won is 0 - this is money going INTO the pot
        anteChipChanges,
        false,
        'ship-captain-crew', // game_type
        game.current_game_uuid || null // dealer_game_id
      );
      
    }
  }
}

/**
 * End the current SCC round and prepare for the next hand
 */
export async function endSCCRound(
  gameId: string, 
  winnerId: string | null, 
  winnerDescription: string,
  isTie: boolean = false,
  extraContext?: {
    dealerGameId?: string | null;
    roundId?: string | null;
    handNumber?: number;
    pot?: number;
    winnerIds?: string[];
    playerResults?: Record<string, { rank: number; description: string }>;
  }
): Promise<void> {
  

  if (isTie) {
    // For ties, set awaiting_next_round which will trigger re-ante
    const { error } = await supabase
      .from('games')
      .update({
        awaiting_next_round: true,
        last_round_result: 'One tie all tie - rollover',
      })
      .eq('id', gameId);

    if (error) {
      console.error('[SCC] Failed to set tie state:', error);
    }
    
  } else if (winnerId) {
    // Winner takes the pot
    const { error } = await supabase
      .from('games')
      .update({
        status: 'game_over',
        last_round_result: winnerDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    if (error) {
      console.error('[SCC] Failed to set game over:', error);
    }
    
  }
}
