import { isHolmChuckyLossResult } from './canonicalShell/holmTransferPresentationStage';

export interface HolmResolutionRecoveryInput {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  gameStatus: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  roundStatus: string | null | undefined;
  allDecisionsInForRound: boolean;
  participantPresent: boolean;
}

export interface HolmChuckyLossContinuationInput {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  gameStatus: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  roundStatus: string | null | undefined;
  handNumber: number | null | undefined;
  transferCursor: number | null | undefined;
  awaitingNextRound: boolean;
  lastRoundResult: string | null | undefined;
  participantPresent: boolean;
}

export interface HolmChuckyLossReconnectIdentity {
  dealerGameId: string | null;
  roundId: string | null;
}

export type HolmChuckyLossContinuationSource =
  | 'historical-entry'
  | 'realtime-reconnect'
  | null;

/**
 * Returns the authoritative identity that a connected Holm participant may
 * attempt to resolve, or null when the state is not the terminal betting
 * edge. The resolver itself remains replay-safe because endHolmRound claims
 * the round with the existing atomic betting -> processing transition.
 */
export function getHolmResolutionRecoveryKey({
  gameId,
  gameType,
  gameStatus,
  dealerGameId,
  roundId,
  roundStatus,
  allDecisionsInForRound,
  participantPresent,
}: HolmResolutionRecoveryInput): string | null {
  if (!gameId || gameType !== 'holm-game' || gameStatus !== 'in_progress') return null;
  if (!roundId || roundStatus !== 'betting') return null;
  if (!allDecisionsInForRound || !participantPresent) return null;

  return `${gameId}:${dealerGameId ?? 'no-dealer-game'}:${roundId}`;
}

/**
 * Exact predecessor identity for a Chucky-loss continuation. A fresh mount or
 * realtime reconnect may reconcile an already-committed transfer without
 * replaying it; that client may request the same idempotent successor RPC
 * directly instead of waiting for a batch-settled callback that cannot recur.
 */
export function getHolmChuckyLossContinuationKey({
  gameId,
  gameType,
  gameStatus,
  dealerGameId,
  roundId,
  roundStatus,
  handNumber,
  transferCursor,
  awaitingNextRound,
  lastRoundResult,
  participantPresent,
}: HolmChuckyLossContinuationInput): string | null {
  if (!gameId || gameType !== 'holm-game' || gameStatus !== 'in_progress') return null;
  if (!dealerGameId || !roundId || roundStatus !== 'completed') return null;
  if (!Number.isInteger(handNumber) || (handNumber ?? 0) <= 0) return null;
  if (!Number.isInteger(transferCursor) || (transferCursor ?? 0) <= 0) return null;
  if (!awaitingNextRound || !participantPresent || !isHolmChuckyLossResult(lastRoundResult)) return null;
  return `${gameId}:${dealerGameId}:${roundId}:h${handNumber}:c${transferCursor}`;
}

/**
 * A loss observed live must finish through presentation. The only direct
 * continuation exceptions are a historical entry (whose immutable batch the
 * ledger intentionally baselines) or an authoritative reconnect snapshot for
 * this exact dealer-game/round identity.
 */
export function getHolmChuckyLossContinuationSource({
  observedLive,
  dealerGameId,
  roundId,
  reconnectIdentity,
}: {
  observedLive: boolean;
  dealerGameId: string;
  roundId: string;
  reconnectIdentity: HolmChuckyLossReconnectIdentity | null;
}): HolmChuckyLossContinuationSource {
  if (!observedLive) return 'historical-entry';
  if (
    reconnectIdentity?.dealerGameId === dealerGameId
    && reconnectIdentity.roundId === roundId
  ) return 'realtime-reconnect';
  return null;
}
