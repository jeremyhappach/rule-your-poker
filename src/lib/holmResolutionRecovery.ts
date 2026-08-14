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

export interface HolmContinuationInput {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  gameStatus: string | null | undefined;
  gamePaused: boolean | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  roundStatus: string | null | undefined;
  handNumber: number | null | undefined;
  awaitingNextRound: boolean;
  lastRoundResult: string | null | undefined;
  participantPresent: boolean;
}

export interface HolmContinuationReconnectIdentity {
  dealerGameId: string | null;
  roundId: string | null;
}

export type HolmContinuationSource =
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
 * Exact predecessor identity for any committed continuing Holm result. A
 * fresh mount or realtime reconnect may reconcile an already-committed result
 * without replaying its immutable transfer batch; that client may request the
 * same idempotent successor RPC directly instead of waiting for a
 * batch-settled callback that cannot recur.
 */
export function getHolmContinuationKey({
  gameId,
  gameType,
  gameStatus,
  gamePaused,
  dealerGameId,
  roundId,
  roundStatus,
  handNumber,
  awaitingNextRound,
  lastRoundResult,
  participantPresent,
}: HolmContinuationInput): string | null {
  if (!gameId || gameType !== 'holm-game' || gameStatus !== 'in_progress') return null;
  if (gamePaused) return null;
  if (!dealerGameId || !roundId || roundStatus !== 'completed') return null;
  if (!Number.isInteger(handNumber) || (handNumber ?? 0) <= 0) return null;
  if (!awaitingNextRound || !participantPresent || !lastRoundResult?.trim()) return null;
  return `${gameId}:${dealerGameId}:${roundId}:h${handNumber}`;
}

/**
 * A result observed live must finish through presentation. The only direct
 * continuation exceptions are a historical entry (whose immutable batch the
 * ledger intentionally baselines) or an authoritative reconnect snapshot for
 * this exact dealer-game/round identity.
 */
export function getHolmContinuationSource({
  observedLive,
  dealerGameId,
  roundId,
  reconnectIdentity,
}: {
  observedLive: boolean;
  dealerGameId: string;
  roundId: string;
  reconnectIdentity: HolmContinuationReconnectIdentity | null;
}): HolmContinuationSource {
  if (!observedLive) return 'historical-entry';
  if (
    reconnectIdentity?.dealerGameId === dealerGameId
    && reconnectIdentity.roundId === roundId
  ) return 'realtime-reconnect';
  return null;
}
