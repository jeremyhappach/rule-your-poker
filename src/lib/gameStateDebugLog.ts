import { supabase } from "@/integrations/supabase/client";

export type GameStateEventType =
  | 'PLAYER_DECISION_MADE'
  | 'PLAYER_DECISION_LOCKED'
  | 'ALL_DECISIONS_IN_SET'
  | 'GAME_STATUS_CHANGE'
  | 'ROUND_STATUS_CHANGE'
  | 'DEADLINE_EXPIRED'
  | 'DEADLINE_SET'
  | 'AUTO_FOLD_SET'
  | 'ROUND_CREATED'
  | 'ROUND_TRANSITION'
  | 'SHOWDOWN_START'
  | 'SHOWDOWN_END'
  | 'COMMUNITY_CARDS_REVEAL'
  | 'HAND_COMPLETE'
  | 'END_HOLM_ROUND_CALLED'
  | 'END_HOLM_ROUND_RESULT'
  | 'BOT_DECISION'
  | 'REJOIN_VISIBILITY_CHANGE';

interface LogGameStateParams {
  gameId: string;
  dealerGameId?: string | null;
  roundId?: string | null;
  playerId?: string | null;
  eventType: GameStateEventType;
  gameStatus?: string | null;
  roundStatus?: string | null;
  allDecisionsIn?: boolean | null;
  currentRound?: number | null;
  totalHands?: number | null;
  playerDecision?: string | null;
  decisionLocked?: boolean | null;
  autoFold?: boolean | null;
  deadlineExpired?: boolean | null;
  sourceLocation: string;
  details?: Record<string, unknown>;
}

/**
 * Log a game state change for debugging purposes.
 * This is a fire-and-forget operation - errors are logged but don't throw.
 */
export async function logGameState({
  gameId,
  dealerGameId,
  roundId,
  playerId,
  eventType,
  gameStatus,
  roundStatus,
  allDecisionsIn,
  currentRound,
  totalHands,
  playerDecision,
  decisionLocked,
  autoFold,
  deadlineExpired,
  sourceLocation,
  details = {},
}: LogGameStateParams): Promise<void> {
  const shortGameId = gameId.slice(0, 8);
  console.log(`[GAME_STATE_DEBUG] ${eventType} | game=${shortGameId} | ${sourceLocation}`, {
    gameStatus,
    roundStatus,
    allDecisionsIn,
    playerDecision,
    decisionLocked,
    autoFold,
    ...details,
  });

  try {
    await supabase
      .from('game_state_debug_log' as any)
      .insert({
        game_id: gameId,
        dealer_game_id: dealerGameId || null,
        round_id: roundId || null,
        player_id: playerId || null,
        event_type: eventType,
        game_status: gameStatus || null,
        round_status: roundStatus || null,
        all_decisions_in: allDecisionsIn ?? null,
        current_round: currentRound ?? null,
        total_hands: totalHands ?? null,
        player_decision: playerDecision || null,
        decision_locked: decisionLocked ?? null,
        auto_fold: autoFold ?? null,
        deadline_expired: deadlineExpired ?? null,
        source_location: sourceLocation,
        details: details,
      } as any);
  } catch (err) {
    console.error('[GAME_STATE_DEBUG] Failed to log:', err);
  }
}

/**
 * Helper to log player decision changes
 */
export function logPlayerDecision(
  gameId: string,
  playerId: string,
  decision: string,
  locked: boolean,
  source: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return logGameState({
    gameId,
    playerId,
    eventType: locked ? 'PLAYER_DECISION_LOCKED' : 'PLAYER_DECISION_MADE',
    playerDecision: decision,
    decisionLocked: locked,
    sourceLocation: source,
    details: extra,
  });
}

/**
 * Helper to log auto_fold changes
 */
export function logAutoFoldChange(
  gameId: string,
  playerId: string,
  autoFold: boolean,
  source: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return logGameState({
    gameId,
    playerId,
    eventType: 'AUTO_FOLD_SET',
    autoFold,
    sourceLocation: source,
    details: extra,
  });
}

/**
 * Helper to log deadline expiration
 */
export function logDeadlineExpired(
  gameId: string,
  playerId: string | null,
  deadlineType: string,
  source: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return logGameState({
    gameId,
    playerId,
    eventType: 'DEADLINE_EXPIRED',
    deadlineExpired: true,
    sourceLocation: source,
    details: { deadline_type: deadlineType, ...extra },
  });
}

/**
 * Helper to log game/round status changes
 */
export function logStatusChange(
  gameId: string,
  roundId: string | null,
  gameStatus: string | null,
  roundStatus: string | null,
  source: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return logGameState({
    gameId,
    roundId,
    eventType: roundStatus ? 'ROUND_STATUS_CHANGE' : 'GAME_STATUS_CHANGE',
    gameStatus,
    roundStatus,
    sourceLocation: source,
    details: extra,
  });
}

/**
 * Helper to log all_decisions_in changes
 */
export function logAllDecisionsIn(
  gameId: string,
  roundId: string | null,
  allDecisionsIn: boolean,
  source: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return logGameState({
    gameId,
    roundId,
    eventType: 'ALL_DECISIONS_IN_SET',
    allDecisionsIn,
    sourceLocation: source,
    details: extra,
  });
}
