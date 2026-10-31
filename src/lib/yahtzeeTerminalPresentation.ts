import type { ChipPresentationBatch } from './canonicalShell/ChipPresentationLedger';
import type { YahtzeeState } from './yahtzeeTypes';
import { getTotalScore } from './yahtzeeScoring';

export type YahtzeePayoutScope = {
  gameId: string; dealerGameId: string; roundId: string; handNumber: number;
  winnerId: string; loserIds: string[];
};
/** Ownership follows the live authoritative terminal receipt, independently
 * of the final score animation. The route supplies live=false on cold history. */
export function liveYahtzeePayoutScope(
  identity: { gameId: string; dealerGameId?: string | null; roundId?: string | null; handNumber?: number | null },
  state: YahtzeeState | null | undefined,
  live: boolean,
): YahtzeePayoutScope | null {
  if (!live || state?.gamePhase !== 'complete' || !identity.gameId || !identity.dealerGameId
    || !identity.roundId || !Number.isInteger(identity.handNumber)) return null;
  const scores = Object.entries(state.playerStates).map(([id, player]) => ({ id, score: getTotalScore(player.scorecard) }));
  if (scores.length < 2) return null;
  const highest = Math.max(...scores.map(player => player.score));
  const winners = scores.filter(player => player.score === highest);
  if (winners.length !== 1) return null;
  return { gameId: identity.gameId, dealerGameId: identity.dealerGameId, roundId: identity.roundId,
    handNumber: identity.handNumber!, winnerId: winners[0].id,
    loserIds: scores.filter(player => player.id !== winners[0].id).map(player => player.id) };
}
export function yahtzeeTerminalToken(scope: YahtzeePayoutScope): string {
  return ['yahtzee', 'winseq', scope.gameId, scope.dealerGameId, scope.handNumber, scope.winnerId, scope.roundId].join('|');
}
export function isYahtzeeTerminalPayout(batch: ChipPresentationBatch, scope: YahtzeePayoutScope | null): boolean {
  if (!scope || batch.game_id !== scope.gameId || batch.dealer_game_id !== scope.dealerGameId
    || (batch.source_round_id != null && batch.source_round_id !== scope.roundId)
    || batch.reason !== 'transfer' || batch.transfers.length !== scope.loserIds.length || !scope.loserIds.length) return false;
  const payers = new Set<string>();
  for (const transfer of batch.transfers) {
    if (transfer.from.kind !== 'player' || transfer.to.kind !== 'player'
      || transfer.to.playerId !== scope.winnerId || !scope.loserIds.includes(transfer.from.playerId)) return false;
    payers.add(transfer.from.playerId);
  }
  return payers.size === scope.loserIds.length;
}
