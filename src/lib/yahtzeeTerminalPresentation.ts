import type { ChipPresentationBatch } from './canonicalShell/ChipPresentationLedger';

export type YahtzeePayoutScope = {
  gameId: string; dealerGameId: string; roundId: string; handNumber: number;
  winnerId: string; loserIds: string[];
};
export function yahtzeeTerminalToken(scope: YahtzeePayoutScope): string {
  return ['yahtzee', 'winseq', scope.gameId, scope.dealerGameId, scope.handNumber, scope.winnerId, scope.roundId].join('|');
}
export function isYahtzeeTerminalPayout(batch: ChipPresentationBatch, scope: YahtzeePayoutScope | null): boolean {
  if (!scope || batch.game_id !== scope.gameId || batch.dealer_game_id !== scope.dealerGameId
    || batch.reason !== 'transfer' || batch.transfers.length !== scope.loserIds.length || !scope.loserIds.length) return false;
  const payers = new Set<string>();
  for (const transfer of batch.transfers) {
    if (transfer.from.kind !== 'player' || transfer.to.kind !== 'player'
      || transfer.to.playerId !== scope.winnerId || !scope.loserIds.includes(transfer.from.playerId)) return false;
    payers.add(transfer.from.playerId);
  }
  return payers.size === scope.loserIds.length;
}
