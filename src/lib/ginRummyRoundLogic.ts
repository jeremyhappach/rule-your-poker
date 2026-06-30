// Gin Rummy round orchestration - database integration layer
// Follows the same patterns as cribbageRoundLogic.ts:
// - DB-First round creation with atomic guards
// - State persistence via gin_rummy_state JSONB column
// - Atomic claim for end-of-game processing

import { supabase } from '@/integrations/supabase/client';
import {
  createInitialGinRummyState,
  dealHand,
  getNextDealer,
  scoreHand,
} from './ginRummyGameLogic';
import { snapshotPlayerChips } from './gameLogic';
import { getBotAlias } from './botAlias';
import { describeKnockResult } from './ginRummyScoring';
import type { GinRummyState } from './ginRummyTypes';
import { logGinHandStart } from './ginRummySyncDiagnostics';
import { ginTrace } from './ginStartupTrace';
import { isGinTwoActionHarnessEnabled } from './debugFlags';
import { resolveSessionHostPlayerId } from './debugHarness/resolveHarnessHost';
import { recordStartupFlight } from './startupFlightRecorder';

/**
 * Start the first Gin Rummy round/hand.
 * Creates a round record with gin_rummy_state initialized.
 *
 * Critical-path optimization: callers that have already fetched the game row
 * (with players) and know this is the first hand of the dealer_game may pass
 * `preloaded` to skip the redundant `games` re-fetch and the existing-rounds
 * pre-check. The 23505 unique-constraint guard on insert still protects
 * concurrency, so semantics are preserved.
 */
export async function startGinRummyRound(
  gameId: string,
  preloaded?: {
    game?: any; // expected to include `.players` array when provided
    assumeFirstHand?: boolean; // true when caller knows total_hands === 0 for this dealer_game
  }
): Promise<{ success: boolean; roundId?: string; handNumber?: number; round?: any; error?: string }> {
  recordStartupFlight('EFFECT TIMELINE', 'startGinRummyRound entered', {
    file: 'src/lib/ginRummyRoundLogic.ts',
    function: 'startGinRummyRound',
    caller: 'Game.tsx handleAllAnteDecisionsIn',
    gameId,
    usedPreloadedGame: !!preloaded?.game,
    assumeFirstHand: !!preloaded?.assumeFirstHand,
  });
  console.log('[GIN-RUMMY] Starting gin rummy round', { gameId });

  try {
    // Fetch game data (unless caller already provided it)
    let game: any = preloaded?.game ?? null;
    if (!game) {
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound fetch game start', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
      });
      const { data: fetched, error: gameError } = await supabase
        .from('games')
        .select('*, players(*)')
        .eq('id', gameId)
        .single();
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound fetch game complete', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
        oldValue: null,
        newValue: {
          status: (fetched as any)?.status ?? null,
          game_type: (fetched as any)?.game_type ?? null,
          current_game_uuid: (fetched as any)?.current_game_uuid ?? null,
          players: (fetched as any)?.players?.map((p: any) => ({ id: p.id, ante_decision: p.ante_decision, is_bot: p.is_bot, sitting_out: p.sitting_out, status: p.status })) ?? null,
        },
        error: gameError?.message ?? null,
      });

      if (gameError || !fetched) {
        throw new Error(`Failed to fetch game: ${gameError?.message}`);
      }
      game = fetched;
    } else {
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound fetch game skipped (preloaded)', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
      });
    }

    if (game.status === 'game_over' || game.status === 'session_ended') {
      return { success: false, error: 'Game already over' };
    }

    // Get players who actually anted into this dealer game. At a dealer-game
    // boundary, stale per-hand statuses like "folded" may still be present
    // from the completed Gin match; those must not block same-game replay
    // bootstrap once the player has anted and is still seated.
    const activePlayers = (game.players || []).filter(
      (p: any) =>
        p.ante_decision === 'ante_up' &&
        !p.sitting_out &&
        p.status !== 'observer' &&
        p.status !== 'left'
    );

    if (activePlayers.length !== 2) {
      throw new Error('Gin Rummy requires exactly 2 players');
    }

    // Determine dealer and non-dealer using natural rotation.
    // Near-Gin harness target = canonical SESSION HOST, decoupled from
    // dealer/turn/seat order. The advantaged hand is assigned by
    // dealHand based on hostPid, not by forcing host to be dealer.
    const dealerPosition = game.dealer_position || 1;
    const sortedPlayers = [...activePlayers].sort((a: any, b: any) => a.position - b.position);
    const dealerPlayer: any = sortedPlayers.find((p: any) => p.position === dealerPosition)
      || sortedPlayers[0];
    const nonDealerPlayer = sortedPlayers.find((p: any) => p.id !== dealerPlayer.id)!;

    // Resolve harness target = session host. Fail-closed when no host
    // can be resolved (do NOT silently target dealer).
    const harnessTargetPlayerId = isGinTwoActionHarnessEnabled()
      ? (() => {
          const hostPid = resolveSessionHostPlayerId(
            { current_host: (game as any)?.current_host ?? null },
            sortedPlayers,
          );
          const hostSeated = hostPid
            && (hostPid === dealerPlayer.id || hostPid === nonDealerPlayer.id);
          return hostSeated ? hostPid : null;
        })()
      : null;

    const anteAmount = game.ante_amount || 1;
    // Authoritative Gin match target. Single source for both server
    // terminal evaluation (createNextHand carries it forward via
    // previousState.pointsToWin → matchWinner check) AND the client
    // score-rail denominator. Default 100. Near-Gin harness must NEVER
    // alter this target — it may only assign an advantaged hand.
    const pointsToWin = game.points_to_win ?? 100;

    // Initialize and deal (handNumber set after DB query below)
    let ginState = createInitialGinRummyState(
      dealerPlayer.id,
      nonDealerPlayer.id,
      anteAmount,
      pointsToWin,
    );
    ginState = dealHand(ginState, harnessTargetPlayerId);

    const dealerGameId = game.current_game_uuid;
    if (!dealerGameId) {
      throw new Error('No dealer_game_id - cannot create round');
    }

    // Calculate hand number (DB-First). Skip the precheck on the happy path
    // when caller asserts this is the first hand of the dealer_game — the
    // 23505 unique-constraint guard on insert still catches concurrent inserts.
    let handNumber: number;
    if (preloaded?.assumeFirstHand) {
      handNumber = 1;
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound existing rounds skipped (first-hand assumed)', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
        dealerGameId,
      });
    } else {
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound existing rounds fetch start', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
        dealerGameId,
      });
      const { data: existingRounds } = await supabase
        .from('rounds')
        .select('hand_number')
        .eq('dealer_game_id', dealerGameId)
        .order('hand_number', { ascending: false })
        .limit(1);
      recordStartupFlight('FETCH TIMELINE', 'startGinRummyRound existing rounds fetch complete', {
        file: 'src/lib/ginRummyRoundLogic.ts',
        function: 'startGinRummyRound',
        gameId,
        dealerGameId,
        oldValue: null,
        newValue: existingRounds ?? [],
      });
      handNumber = existingRounds && existingRounds.length > 0
        ? (existingRounds[0].hand_number || 0) + 1
        : 1;
    }

    // Stamp handNumber into state for the sync progress vector
    ginState = { ...ginState, handNumber };

    // Create round record
    ginTrace('rounds.insert dispatched', {
      dealerGameId: dealerGameId?.slice(0, 8) ?? null,
      handNumber,
    });
    recordStartupFlight('WRITE TIMELINE', 'rounds INSERT issued', {
      file: 'src/lib/ginRummyRoundLogic.ts',
      function: 'startGinRummyRound',
      caller: 'Game.tsx handleAllAnteDecisionsIn',
      table: 'rounds',
      row: null,
      oldValue: null,
      newValue: { gameId, dealerGameId, round_number: 1, hand_number: handNumber, status: 'betting', hasGinState: true },
    });
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1, // Gin rummy uses single round per hand (like cribbage)
        hand_number: handNumber,
        cards_dealt: 10,
        pot: 0,
        status: 'betting',
        gin_rummy_state: ginState as any,
      })
      .select()
      .single();
    ginTrace('rounds.insert returned', {
      ok: !roundError && !!round,
      code: roundError?.code ?? null,
      roundId: round?.id?.slice(0, 8) ?? null,
    });
    recordStartupFlight('ROUND TIMELINE', 'currentRound created / rounds INSERT returned', {
      file: 'src/lib/ginRummyRoundLogic.ts',
      function: 'startGinRummyRound',
      table: 'rounds',
      row: round?.id ?? null,
      oldValue: null,
      newValue: {
        roundId: round?.id ?? null,
        dealerGameId: (round as any)?.dealer_game_id ?? null,
        handNumber: (round as any)?.hand_number ?? null,
        hasGinState: !!(round as any)?.gin_rummy_state,
      },
      error: roundError?.message ?? null,
    });

    if (roundError || !round) {
      // Atomic guard: unique constraint violation means another client already created it
      if (roundError?.code === '23505') {
        console.log('[GIN-RUMMY] Round already exists (atomic guard)');
      return { success: true };
      }
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }

    const insertedHandNumber = round.hand_number ?? handNumber;

    logGinHandStart(gameId, insertedHandNumber, dealerPlayer.id, round.id);

    // CRITICAL-PATH OPTIMIZATION: readiness depends only on rounds.gin_rummy_state
    // (already persisted by the insert above). Run the games-status update and
    // player_cards upserts in parallel, off the awaited critical path, so the
    // caller can return as soon as the authoritative frame is queryable.
    ginTrace('off-critical writes dispatched (games + player_cards)');
    const tStatusWriteIssued = Date.now();
    recordStartupFlight('WRITE TIMELINE', 'games.status=in_progress UPDATE issued', {
      file: 'src/lib/ginRummyRoundLogic.ts',
      function: 'startGinRummyRound',
      caller: 'Game.tsx handleAllAnteDecisionsIn',
      table: 'games',
      row: gameId,
      oldValue: game.status,
      newValue: { status: 'in_progress', current_round: 1, total_hands: insertedHandNumber },
      roundId: round.id,
    });
    console.log('[GIN_RUNTIME_TIMELINE] startGinRummyRound:status=in_progress write issued', { t: tStatusWriteIssued, gameId, roundId: round.id });
    const offCriticalWrites: PromiseLike<unknown>[] = [
      supabase
        .from('games')
        .update({
          status: 'in_progress',
          current_round: 1,
          total_hands: insertedHandNumber,
          pot: 0,
          is_first_hand: handNumber === 1,
        })
        .eq('id', gameId)
        .then(({ error }) => {
          recordStartupFlight('WRITE TIMELINE', 'games.status=in_progress UPDATE completed', {
            file: 'src/lib/ginRummyRoundLogic.ts',
            function: 'startGinRummyRound',
            caller: 'Game.tsx handleAllAnteDecisionsIn',
            table: 'games',
            row: gameId,
            oldValue: game.status,
            newValue: 'in_progress',
            elapsedMs: Date.now() - tStatusWriteIssued,
            error: error?.message ?? null,
          });
          console.log('[GIN_RUNTIME_TIMELINE] startGinRummyRound:status=in_progress write completed', { t: Date.now(), deltaMs: Date.now() - tStatusWriteIssued, error: error?.message ?? null });
          if (error) console.warn('[GIN-RUMMY] games status update failed:', error.message);
        }),
    ];
    for (const playerId of [dealerPlayer.id, nonDealerPlayer.id]) {
      const playerState = ginState.playerStates[playerId];
      if (!playerState) continue;
      offCriticalWrites.push(
        supabase
          .from('player_cards')
          .upsert(
            { player_id: playerId, round_id: round.id, cards: playerState.hand as any },
            { onConflict: 'player_id,round_id' }
          )
          .then(({ error }) => {
            if (error) console.warn('[GIN-RUMMY] Failed to store player cards:', playerId, error.message);
          })
      );
    }
    // Fire-and-forget: do NOT await — readiness probe does not depend on these.
    void Promise.all(offCriticalWrites.map((p) => Promise.resolve(p)));

    console.log('[GIN-RUMMY] Round started', { roundId: round.id, handNumber: insertedHandNumber });
    recordStartupFlight('EFFECT TIMELINE', 'startGinRummyRound exited', {
      file: 'src/lib/ginRummyRoundLogic.ts',
      function: 'startGinRummyRound',
      gameId,
      roundId: round.id,
      handNumber: insertedHandNumber,
      success: true,
    });
    return { success: true, roundId: round.id, handNumber: insertedHandNumber, round };

  } catch (error: any) {
    console.error('[GIN-RUMMY] Error starting round:', error);
    recordStartupFlight('EFFECT TIMELINE', 'startGinRummyRound exited', {
      file: 'src/lib/ginRummyRoundLogic.ts',
      function: 'startGinRummyRound',
      gameId,
      success: false,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Start the next Gin Rummy hand (after a hand completes).
 * Rotates dealer, preserves match scores, creates new round record.
 */
export async function startNextGinRummyHand(
  gameId: string,
  dealerGameId: string,
  previousState: GinRummyState
): Promise<{
  success: boolean;
  roundId?: string;
  handNumber?: number;
  newState?: GinRummyState;
  error?: string;
  alreadyStarted?: boolean;
}> {
  console.log('[GIN-RUMMY] Starting next hand', { gameId, dealerGameId });

  try {
    // Check if match is over (someone hit pointsToWin)
    if (previousState.winnerPlayerId) {
      return { success: false, error: 'Match already won' };
    }

    // Server-authoritative pure alternation: every hand within the same
    // dealerGameId past H1 swaps dealer/non-dealer. The harness no longer
    // suppresses rotation — alternation is an invariant the client must
    // consume from the persisted round, never recompute from parity.
    const nextDealerId = getNextDealer(previousState);
    const nextNonDealerId = nextDealerId === previousState.dealerPlayerId
      ? previousState.nonDealerPlayerId
      : previousState.dealerPlayerId;

    // Create new hand state with preserved match scores (handNumber set after DB query)
    let newState = createInitialGinRummyState(
      nextDealerId,
      nextNonDealerId,
      previousState.anteAmount,
      previousState.pointsToWin,
      previousState.matchScores,
    );

    // Harness target = canonical SESSION HOST. Resolved from games.current_host
    // on every hand, decoupled from dealer rotation. Fail-closed when
    // host cannot be resolved.
    let harnessTargetPlayerId: string | null = null;
    if (isGinTwoActionHarnessEnabled()) {
      const { data: gameRow } = await supabase
        .from('games')
        .select('current_host')
        .eq('id', gameId)
        .maybeSingle();
      const { data: playerRows } = await supabase
        .from('players')
        .select('id,user_id,is_bot,created_at')
        .eq('game_id', gameId);
      const hostPid = resolveSessionHostPlayerId(
        { current_host: (gameRow as any)?.current_host ?? null },
        (playerRows ?? []) as any[],
      );
      const hostSeated = hostPid && (hostPid === nextDealerId || hostPid === nextNonDealerId);
      harnessTargetPlayerId = hostSeated ? hostPid : null;
    }
    newState = dealHand(newState, harnessTargetPlayerId);

    // Get next hand number (DB-First)
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('hand_number')
      .eq('dealer_game_id', dealerGameId)
      .order('hand_number', { ascending: false })
      .limit(1);

    const handNumber = existingRounds && existingRounds.length > 0
      ? (existingRounds[0].hand_number || 0) + 1
      : 1;

    // Stamp handNumber into state for the sync progress vector
    newState = { ...newState, handNumber };

    // Atomic insert (unique constraint guard)
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        round_number: 1,
        hand_number: handNumber,
        cards_dealt: 10,
        pot: 0,
        status: 'betting',
        gin_rummy_state: newState as any,
      })
      .select()
      .single();

    if (roundError) {
      if (roundError.code === '23505' || roundError.message?.includes('duplicate key')) {
        console.log('[GIN-RUMMY] Next hand already exists (atomic guard)');
        return { success: true, alreadyStarted: true };
      }
      throw new Error(`Failed to create round: ${roundError?.message}`);
    }

    if (!round) throw new Error('No data returned from round insert');

    const insertedHandNumber = round.hand_number ?? handNumber;

    // Update game state
    await supabase
      .from('games')
      .update({
        total_hands: insertedHandNumber,
        is_first_hand: false,
      })
      .eq('id', gameId);

    // Store player cards
    for (const playerId of [nextDealerId, nextNonDealerId]) {
      const ps = newState.playerStates[playerId];
      if (ps) {
        supabase
          .from('player_cards')
          .upsert(
            { player_id: playerId, round_id: round.id, cards: ps.hand as any },
            { onConflict: 'player_id,round_id' }
          )
          .then(({ error }) => {
            if (error) console.warn('[GIN-RUMMY] Failed to store cards:', playerId, error.message);
          });
      }
    }

    console.log('[GIN-RUMMY] Next hand started', { roundId: round.id, handNumber: insertedHandNumber });
    return { success: true, roundId: round.id, handNumber: insertedHandNumber, newState };

  } catch (error: any) {
    console.error('[GIN-RUMMY] Error starting next hand:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update gin rummy state in the database (after each action).
 */
export async function updateGinRummyState(
  roundId: string,
  newState: GinRummyState
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('rounds')
      .update({ gin_rummy_state: newState as any })
      .eq('id', roundId);

    if (error) {
      console.error('[GIN-RUMMY] Failed to update state:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[GIN-RUMMY] Error updating state:', error);
    return false;
  }
}

/**
 * Fetch authoritative gin rummy state from DB (prevents stale closure issues).
 */
export async function fetchGinRummyState(
  roundId: string
): Promise<GinRummyState | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('gin_rummy_state')
    .eq('id', roundId)
    .single();

  if (error || !data?.gin_rummy_state) {
    console.error('[GIN-RUMMY] Failed to fetch state:', error);
    return null;
  }
  return data.gin_rummy_state as unknown as GinRummyState;
}

/**
 * End a Gin Rummy match and distribute winnings.
 * Uses atomic claim pattern (transition status to 'completed') to prevent double processing.
 */
export async function endGinRummyGame(
  gameId: string,
  roundId: string,
  ginState: GinRummyState
): Promise<boolean> {
  console.log('[GIN-RUMMY] Ending game', {
    gameId,
    roundId,
    winner: ginState.winnerPlayerId,
    matchScores: ginState.matchScores,
  });

  try {
    if (!ginState.winnerPlayerId) {
      throw new Error('No match winner specified');
    }

    const playerIds = Object.keys(ginState.playerStates);
    const loserId = playerIds.find(id => id !== ginState.winnerPlayerId)!;

    // Atomic claim: transition round to 'completed'
    const { data: claimedRounds, error: claimError } = await supabase
      .from('rounds')
      .update({
        status: 'completed',
        gin_rummy_state: ginState as any,
      })
      .eq('id', roundId)
      .neq('status', 'completed')
      .select('hand_number, dealer_game_id');

    if (claimError) {
      console.error('[GIN-RUMMY] Failed to claim end-of-game:', claimError);
      return false;
    }

    const claimedRound = claimedRounds && claimedRounds.length > 0 ? claimedRounds[0] : null;

    if (!claimedRound) {
      console.log('[GIN-RUMMY] Already processed by another client');
      await supabase
        .from('games')
        .update({
          status: 'game_over',
          pot: 0,
          game_over_at: new Date().toISOString(),
        })
        .eq('id', gameId);
      return true;
    }

    const handNumber = claimedRound.hand_number ?? 1;
    const dealerGameId = claimedRound.dealer_game_id ?? null;

    // Fetch dealer_game config for bonus/per-point settings
    const config = await fetchGinRummyConfig(dealerGameId);
    const perPointValue = config.per_point_value ?? 0;
    const anteAmount = ginState.anteAmount || 1;
    
    // Base match payout: the ante amount (chips transfer at match end, not per-hand)
    let payoutAmount = anteAmount;
    
    // Optional: per-point payout on top of ante (based on final score differential)
    if (perPointValue > 0) {
      const winnerScore = ginState.matchScores[ginState.winnerPlayerId] || 0;
      const loserScore = ginState.matchScores[loserId] || 0;
      payoutAmount += (winnerScore - loserScore) * perPointValue;
    }

    const chipChanges: Record<string, number> = {
      [ginState.winnerPlayerId]: payoutAmount,
      [loserId]: -payoutAmount,
    };

    // Execute chip transfer at match end (single transaction)
    const { error: deductError } = await supabase.rpc('increment_player_chips', {
      p_player_id: loserId,
      p_amount: -payoutAmount,
    });
    if (deductError) console.error('[GIN-RUMMY] Failed to deduct loser:', deductError);

    const { error: awardError } = await supabase.rpc('increment_player_chips', {
      p_player_id: ginState.winnerPlayerId,
      p_amount: payoutAmount,
    });
    if (awardError) console.error('[GIN-RUMMY] Failed to award winner:', awardError);

    // Small delay to ensure chip RPCs are fully committed before snapshot reads
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get winner display name
    const { data: winner } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at, profiles(username)')
      .eq('id', ginState.winnerPlayerId)
      .single();

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at')
      .eq('game_id', gameId);

    const winnerUsername = winner?.is_bot && allPlayers
      ? getBotAlias(allPlayers, winner.user_id)
      : ((winner?.profiles as any)?.username || 'Player');

    const winnerScore = ginState.matchScores[ginState.winnerPlayerId] || 0;
    const loserScore = ginState.matchScores[loserId] || 0;
    const resultDescription = `${winnerUsername} wins ${winnerScore}-${loserScore} +$${payoutAmount}`;

    // Update game status
    await supabase
      .from('games')
      .update({
        status: 'game_over',
        pot: 0,
        last_round_result: resultDescription,
        game_over_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    // Record in game_results — MUST be awaited so cleanup logic can detect history
    const { error: resultError } = await supabase
      .from('game_results')
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId,
        hand_number: handNumber,
        pot_won: payoutAmount,
        winner_player_id: ginState.winnerPlayerId,
        winner_username: winnerUsername,
        winning_hand_description: resultDescription,
        is_chopped: false,
        player_chip_changes: chipChanges,
        game_type: 'gin-rummy',
      });
    if (resultError) console.error('[GIN-RUMMY] Failed to record result:', resultError);

    // Snapshot chips AFTER match payout — use handNumber+1 to distinguish from per-hand snapshot
    await snapshotPlayerChips(gameId, handNumber + 1).catch((err) => {
      console.error('[GIN-RUMMY] Failed to snapshot chips:', err);
    });

    console.log('[GIN-RUMMY] Game ended successfully, payout:', payoutAmount);
    return true;

  } catch (error) {
    console.error('[GIN-RUMMY] Error ending game:', error);
    return false;
  }
}

/**
 * Fetch gin rummy config from dealer_games record.
 */
async function fetchGinRummyConfig(
  dealerGameId: string | null
): Promise<{
  per_point_value: number;
  gin_bonus: number;
  undercut_bonus: number;
}> {
  const defaults = { per_point_value: 0, gin_bonus: 0, undercut_bonus: 0 };
  if (!dealerGameId) return defaults;

  const { data, error } = await supabase
    .from('dealer_games')
    .select('config')
    .eq('id', dealerGameId)
    .single();

  if (error || !data?.config) return defaults;
  const cfg = data.config as any;
  return {
    per_point_value: cfg.per_point_value ?? 0,
    gin_bonus: cfg.gin_bonus ?? 0,
    undercut_bonus: cfg.undercut_bonus ?? 0,
  };
}

/**
 * Record a per-hand result (for hand history) without ending the match.
 * Also handles per-hand chip transfers for gin/undercut bonuses.
 */
export async function recordGinRummyHandResult(
  gameId: string,
  dealerGameId: string,
  handNumber: number,
  ginState: GinRummyState
): Promise<void> {
  if (!ginState.knockResult) {
    console.log('[GIN-RUMMY] Void hand, no result to record');
    return;
  }

  const result = ginState.knockResult;
  const loserId = result.winnerId === result.knockerId ? result.opponentId : result.knockerId;

  // Fetch config for bonus calculations
  const config = await fetchGinRummyConfig(dealerGameId);
  const ante = ginState.anteAmount;
  
  // Per-hand: record the hand result for history only.
  // Chips only change hands when the match is won (someone reaches pointsToWin).
  // Bonus points (gin/undercut) are flat point values added to the scoring, not chip bonuses.
  let handPayout = ante; // What the winner would earn per hand (for record-keeping)

  // NO chip transfers here — chips only move at match end (endGinRummyGame).
  // This keeps the game zero-sum until the match winner is determined.

  const chipChanges: Record<string, number> = {
    [result.winnerId]: handPayout,
    [loserId]: -handPayout,
  };

  // Get winner username
  const { data: winner } = await supabase
    .from('players')
    .select('id, user_id, is_bot, created_at, profiles(username)')
    .eq('id', result.winnerId)
    .single();

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, user_id, is_bot, created_at')
    .eq('game_id', gameId);

  const winnerUsername = winner?.is_bot && allPlayers
    ? getBotAlias(allPlayers, winner.user_id)
    : ((winner?.profiles as any)?.username || 'Player');

  const description = describeKnockResult(result);

  // Await the insert so the record exists before any cleanup logic runs
  const { error: insertError } = await supabase
    .from('game_results')
    .insert({
      game_id: gameId,
      dealer_game_id: dealerGameId,
      hand_number: handNumber,
      pot_won: handPayout,
      winner_player_id: result.winnerId,
      winner_username: winnerUsername,
      winning_hand_description: `${winnerUsername}: ${description}`,
      is_chopped: false,
      player_chip_changes: chipChanges,
      game_type: 'gin-rummy',
    });
  if (insertError) console.error('[GIN-RUMMY] Failed to record hand result:', insertError);
  else console.log('[GIN-RUMMY] Hand result recorded:', { handNumber, description, handPayout });

  // Snapshot chips per-hand so mid-match quits have history — must await
  await snapshotPlayerChips(gameId, handNumber).catch((err) => {
    console.error('[GIN-RUMMY] Failed to snapshot chips:', err);
  });
}
