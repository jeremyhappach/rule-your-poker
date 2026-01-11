import { supabase } from "@/integrations/supabase/client";

interface LogSittingOutChangeParams {
  playerId: string;
  userId: string;
  gameId: string;
  username?: string;
  isBot: boolean;
  fieldChanged: 'sitting_out' | 'sit_out_next_hand';
  oldValue: boolean | null;
  newValue: boolean;
  reason: string;
  sourceLocation: string;
  additionalContext?: Record<string, unknown>;
}

/**
 * Log a sitting_out or sit_out_next_hand status change to the debug table.
 * Only logs for human players (not bots) to keep the table focused on debugging human issues.
 */
export async function logSittingOutChange({
  playerId,
  userId,
  gameId,
  username,
  isBot,
  fieldChanged,
  oldValue,
  newValue,
  reason,
  sourceLocation,
  additionalContext,
}: LogSittingOutChangeParams): Promise<void> {
  // Skip logging for bots - we only care about human player issues
  if (isBot) {
    console.log(`[SITTING OUT DEBUG] Skipping bot log: ${fieldChanged} ${oldValue} -> ${newValue} (${reason})`);
    return;
  }

  // Only log if the value is actually changing
  if (oldValue === newValue) {
    console.log(`[SITTING OUT DEBUG] No change: ${fieldChanged} already ${newValue} (${reason})`);
    return;
  }

  console.log(`[SITTING OUT DEBUG] 📝 Logging: ${fieldChanged} ${oldValue} -> ${newValue}`, {
    reason,
    sourceLocation,
    playerId: playerId.slice(0, 8),
    username,
  });

  try {
    const { error } = await supabase
      .from('sitting_out_debug_log' as any)
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
      } as any);

    if (error) {
      console.error('[SITTING OUT DEBUG] Failed to insert log:', error);
    }
  } catch (err) {
    console.error('[SITTING OUT DEBUG] Exception inserting log:', err);
  }
}

/**
 * Helper to log when sit_out_next_hand is set to true
 */
export async function logSitOutNextHandSet(
  playerId: string,
  userId: string,
  gameId: string,
  username: string | undefined,
  isBot: boolean,
  oldValue: boolean,
  reason: string,
  sourceLocation: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  return logSittingOutChange({
    playerId,
    userId,
    gameId,
    username,
    isBot,
    fieldChanged: 'sit_out_next_hand',
    oldValue,
    newValue: true,
    reason,
    sourceLocation,
    additionalContext,
  });
}

/**
 * Helper to log when sitting_out is set to true
 */
export async function logSittingOutSet(
  playerId: string,
  userId: string,
  gameId: string,
  username: string | undefined,
  isBot: boolean,
  oldValue: boolean,
  reason: string,
  sourceLocation: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  return logSittingOutChange({
    playerId,
    userId,
    gameId,
    username,
    isBot,
    fieldChanged: 'sitting_out',
    oldValue,
    newValue: true,
    reason,
    sourceLocation,
    additionalContext,
  });
}
