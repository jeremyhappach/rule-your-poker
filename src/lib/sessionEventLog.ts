import { supabase } from "@/integrations/supabase/client";

export type SessionEventType =
  | 'session_created'
  | 'player_joined'
  | 'player_left'
  | 'bot_added'
  | 'game_started'
  | 'dealer_selected'
  | 'config_deadline_set'
  | 'config_submitted'
  | 'config_timeout'
  | 'status_changed'
  | 'session_deleted'
  | 'session_ended';

interface LogSessionEventParams {
  gameId: string;
  eventType: SessionEventType;
  eventData?: Record<string, unknown>;
  userId?: string;
}

/**
 * Log a session event for debugging game lifecycle issues.
 * These logs persist even if the game is deleted, helping debug issues like:
 * - Duplicate countdown timers
 * - Unexpected session deletions
 * - Bot add flickering
 */
export async function logSessionEvent({
  gameId,
  eventType,
  eventData = {},
  userId,
}: LogSessionEventParams): Promise<void> {
  console.log(`[SESSION EVENT] ${eventType}`, { gameId: gameId.slice(0, 8), ...eventData });

  try {
    const { error } = await supabase
      .from('session_events' as any)
      .insert({
        game_id: gameId,
        event_type: eventType,
        event_data: eventData,
        user_id: userId || null,
      } as any);

    if (error) {
      console.error('[SESSION EVENT] Failed to log event:', error);
    }
  } catch (err) {
    console.error('[SESSION EVENT] Exception logging event:', err);
  }
}

/**
 * Shorthand for logging session creation
 */
export function logSessionCreated(gameId: string, userId: string, sessionName?: string): Promise<void> {
  return logSessionEvent({
    gameId,
    eventType: 'session_created',
    eventData: { session_name: sessionName },
    userId,
  });
}

/**
 * Shorthand for logging bot additions
 */
export function logBotAdded(gameId: string, userId: string, botPosition: number, botUsername: string): Promise<void> {
  return logSessionEvent({
    gameId,
    eventType: 'bot_added',
    eventData: { position: botPosition, bot_username: botUsername },
    userId,
  });
}

/**
 * Shorthand for logging config deadline set
 */
export function logConfigDeadlineSet(
  gameId: string,
  userId: string | undefined,
  deadline: string,
  source: string
): Promise<void> {
  return logSessionEvent({
    gameId,
    eventType: 'config_deadline_set',
    eventData: { deadline, source },
    userId,
  });
}

/**
 * Shorthand for logging status changes
 */
export function logStatusChanged(
  gameId: string,
  userId: string | undefined,
  oldStatus: string,
  newStatus: string,
  reason?: string
): Promise<void> {
  return logSessionEvent({
    gameId,
    eventType: 'status_changed',
    eventData: { old_status: oldStatus, new_status: newStatus, reason },
    userId,
  });
}

/**
 * Shorthand for logging session deletion
 */
export function logSessionDeleted(
  gameId: string,
  userId: string | undefined,
  reason: string,
  hadHistory: boolean
): Promise<void> {
  return logSessionEvent({
    gameId,
    eventType: 'session_deleted',
    eventData: { reason, had_history: hadHistory },
    userId,
  });
}
