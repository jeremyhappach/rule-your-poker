/**
 * Narrow, persistent instrumentation for the Start Game (waiting → dealer_selection) flow.
 *
 * Writes fire-and-forget rows to the existing `debug_events` sink (same table used by
 * logGameState / logDebugEvent). No new pill, no new ledger, no new UI. One correlation
 * ID per Start Game invocation groups every stage.
 *
 * This helper is intentionally NOT gated by the debug_events feature flag — Start Game
 * failures are P0 and must always persist. If the insert fails, we log to console but
 * never throw.
 */

import { supabase } from '@/integrations/supabase/client';

export type StartGameStage =
  | 'start_game_entered'
  | 'players_update_started'
  | 'players_update_completed'
  | 'seat_normalization_started'
  | 'seat_normalization_completed'
  | 'games_update_started'
  | 'games_update_completed'
  | 'begin_session_dealer_selection_completed'
  | 'fetch_game_data_scheduled'
  | 'fetch_game_data_completed'
  | 'start_game_aborted'
  | 'start_game_completed';

export interface StartGameTraceContext {
  correlationId: string;
  gameId: string;
  userId: string | null;
  startedAt: number;
  clientGameStatus: string | null;
}

export function createStartGameTrace(
  gameId: string,
  userId: string | null,
  clientGameStatus: string | null,
): StartGameTraceContext {
  const correlationId =
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    correlationId,
    gameId,
    userId,
    startedAt: performance.now(),
    clientGameStatus,
  };
}

export function emitStartGameStage(
  ctx: StartGameTraceContext,
  stage: StartGameStage,
  success: boolean,
  payload: Record<string, unknown> = {},
): void {
  const elapsedMs = Math.round(performance.now() - ctx.startedAt);
  const row = {
    game_id: ctx.gameId,
    user_id: ctx.userId,
    client_role: 'actor',
    event_type: `start_game:${stage}`,
    payload: {
      _correlationId: ctx.correlationId,
      stage,
      success,
      elapsedMs,
      clientGameStatus: ctx.clientGameStatus,
      userId: ctx.userId,
      gameId: ctx.gameId,
      ...payload,
    },
  };

  supabase
    .from('debug_events' as any)
    .insert(row as any)
    .then(({ error }) => {
      if (error) console.warn('[start_game_trace] write failed:', error.message, stage);
    });

  // Also mirror to console for live-session tailing.
  // eslint-disable-next-line no-console
  console.log(`[START_GAME_TRACE] ${stage} success=${success} +${elapsedMs}ms corr=${ctx.correlationId}`, payload);
}

/** Capture the full Supabase response envelope for a mutation. */
export function capturePostgrestResult(result: {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string; hint?: string } | null;
  status?: number;
  statusText?: string;
}): Record<string, unknown> {
  return {
    data: result.data ?? null,
    errorCode: result.error?.code ?? null,
    errorMessage: result.error?.message ?? null,
    errorDetails: result.error?.details ?? null,
    errorHint: result.error?.hint ?? null,
    status: result.status ?? null,
    statusText: result.statusText ?? null,
    hasError: !!result.error,
  };
}

export function captureException(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { exceptionName: e.name, exceptionMessage: e.message, exceptionStack: e.stack?.slice(0, 500) ?? null };
  }
  return { exceptionName: 'unknown', exceptionMessage: String(e) };
}
