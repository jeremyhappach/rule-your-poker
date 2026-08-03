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
