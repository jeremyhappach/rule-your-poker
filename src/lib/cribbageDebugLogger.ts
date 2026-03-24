/**
 * Cribbage-specific debug event logging helpers.
 *
 * Follows the same pattern as Gin Rummy debug logging:
 *   - input handler entered
 *   - optimistic snapshot applied
 *   - db write start / success / failure
 *   - realtime / poll snapshot received
 *   - snapshot accepted / rejected
 *   - authoritative / presentation state summaries
 */

import { logDebugEvent, newTraceId } from './debugEventLogger';
import { buildMetaPayload } from './buildMeta';
import type { CribbageState } from './cribbageTypes';

/** Standard Cribbage state summary payload for every event */
export function cribbageStateSummary(
  state: CribbageState | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if (!state) return { state: null, ...extra };

  const scores: Record<string, number> = {};
  const handSizes: Record<string, number> = {};
  let totalDiscarded = 0;

  for (const [pid, ps] of Object.entries(state.playerStates)) {
    const short = pid.slice(0, 8);
    scores[short] = ps.pegScore ?? 0;
    handSizes[short] = ps.hand?.length ?? 0;
    totalDiscarded += ps.discardedToCrib?.length ?? 0;
  }

  return {
    phase: state.phase,
    dealer: state.dealerPlayerId?.slice(0, 8) ?? null,
    currentTurn: state.pegging?.currentTurnPlayerId?.slice(0, 8) ?? null,
    playedCards: state.pegging?.playedCards?.length ?? 0,
    count: state.pegging?.currentCount ?? 0,
    cribSize: state.crib?.length ?? 0,
    totalDiscarded,
    scores,
    handSizes,
    cutCard: state.cutCard ? `${state.cutCard.rank}${state.cutCard.suit}` : null,
    winner: state.winnerPlayerId?.slice(0, 8) ?? null,
    multiplier: state.payoutMultiplier ?? 1,
    ...extra,
  };
}

export interface CribbageDebugContext {
  gameId: string;
  roundId: string | null;
  userId: string | null;
  handNumber: number;
}

export function logCribbageDebug(
  ctx: CribbageDebugContext,
  eventType: string,
  payload: Record<string, unknown>,
  traceId?: string,
): void {
  logDebugEvent({
    gameId: ctx.gameId,
    roundId: ctx.roundId,
    userId: ctx.userId,
    clientRole: 'actor',
    eventType: `crib:${eventType}`,
    traceId,
    payload: { handNumber: ctx.handNumber, ...buildMetaPayload(), ...payload },
  });
}

/** Generate a new trace ID for an action chain */
export { newTraceId };
